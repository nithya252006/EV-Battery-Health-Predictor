"""
Battery health inference.

This module exposes one function, run_inference(), used by the /ingest
endpoint. It currently uses a documented heuristic so the backend runs
out-of-the-box with zero setup (no dataset/model file required for a demo).

--------------------------------------------------------------------------
SWAPPING IN A REAL TRAINED MODEL (recommended before final submission)
--------------------------------------------------------------------------
1. Train on an open dataset (NASA Battery Dataset / Oxford Battery
   Degradation Dataset / CALCE) using features like: voltage_avg,
   current_avg, temperature_max, charge_duration_min -> soh_percent.
2. Export to TensorFlow Lite: tf.lite.TFLiteConverter.
3. Place the .tflite file at ml/model.tflite.
4. Replace the body of run_inference() below with:

    import numpy as np
    import tflite_runtime.interpreter as tflite

    interpreter = tflite.Interpreter(model_path="ml/model.tflite")
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    def run_inference(reading, history=None):
        x = np.array([[reading.voltage_avg, reading.current_avg,
                        reading.temperature_max,
                        reading.charge_duration_min or 0]], dtype=np.float32)
        interpreter.set_tensor(input_details[0]["index"], x)
        interpreter.invoke()
        soh = float(interpreter.get_tensor(output_details[0]["index"])[0][0])
        ...

The API contract (what it returns) stays identical either way, so nothing
else in the backend needs to change.
--------------------------------------------------------------------------
"""

from dataclasses import dataclass
from typing import List, Optional

NOMINAL_VOLTAGE = 370.0      # pack nominal voltage baseline, tune per vehicle
NOMINAL_TEMP = 35.0           # normal peak charge temperature (Celsius)
REPLACEMENT_THRESHOLD = 70.0  # SoH% below which a battery is due for replacement


@dataclass
class InferenceResult:
    soh_percent: float
    rul_cycles: int
    anomaly_flag: bool
    anomaly_reason: Optional[str]


def run_inference(reading, history: Optional[List[dict]] = None) -> InferenceResult:
    """
    reading: a SensorReading (or anything with voltage_avg, current_avg,
             temperature_max, charge_duration_min attributes)
    history: optional list of prior cycle dicts for this vehicle, most
             recent last, each with a 'soh_percent' key — used to estimate
             degradation rate for RUL and to catch sudden drops.
    """
    # --- Heuristic SoH estimate -------------------------------------------
    # Penalize voltage deviation and excess heat vs. nominal baselines.
    voltage_penalty = abs(reading.voltage_avg - NOMINAL_VOLTAGE) * 0.15
    temp_penalty = max(0.0, reading.temperature_max - NOMINAL_TEMP) * 0.35

    baseline_soh = history[-1]["soh_percent"] if history else 100.0
    cycle_wear = 0.3  # small per-cycle wear even under normal conditions

    soh = baseline_soh - cycle_wear - voltage_penalty - temp_penalty
    soh = max(20.0, min(100.0, round(soh, 1)))

    # --- Anomaly detection ---------------------------------------------
    anomaly_flag = False
    anomaly_reason = None

    if history:
        prev_soh = history[-1]["soh_percent"]
        drop = prev_soh - soh
        if drop > 4:
            anomaly_flag = True
            anomaly_reason = f"Sudden SoH drop of {drop:.1f}% in a single cycle"

    if reading.temperature_max > NOMINAL_TEMP + 12:
        anomaly_flag = True
        anomaly_reason = f"Abnormal peak temperature ({reading.temperature_max}°C) during charge"

    # --- Remaining Useful Life estimate ---------------------------------
    if history and len(history) >= 5:
        window = history[-5:] + [{"soh_percent": soh}]
        rate = max(0.05, (window[0]["soh_percent"] - window[-1]["soh_percent"]) / (len(window) - 1))
    else:
        rate = cycle_wear

    rul_cycles = max(0, int((soh - REPLACEMENT_THRESHOLD) / rate))

    return InferenceResult(
        soh_percent=soh,
        rul_cycles=rul_cycles,
        anomaly_flag=anomaly_flag,
        anomaly_reason=anomaly_reason,
    )
