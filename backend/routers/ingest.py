"""
This is the endpoint the edge device (or the simulator script) calls.
It accepts one raw sensor reading, runs it through the ML model
(ml/predict.py), and persists the cycle + prediction (+ alert if needed)
in a single request — this is what "edge inference synced to the cloud"
looks like end-to-end.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from ml.predict import run_inference
from routers.predictions import _maybe_create_alert

router = APIRouter(tags=["ingest"])


@router.post("/ingest")
def ingest_sensor_reading(payload: schemas.SensorReading, db: Session = Depends(get_db)):
    # 1. Store the raw cycle telemetry
    cycle = models.BatteryCycle(
        vehicle_id=payload.vehicle_id,
        cycle_number=payload.cycle_number,
        voltage_avg=payload.voltage_avg,
        current_avg=payload.current_avg,
        temperature_max=payload.temperature_max,
        charge_duration_min=payload.charge_duration_min,
    )
    db.add(cycle)
    db.commit()
    db.refresh(cycle)

    # 2. Pull prior predictions for this vehicle to give the model history/context
    history = (
        db.query(models.HealthPrediction)
        .filter(models.HealthPrediction.vehicle_id == payload.vehicle_id)
        .order_by(models.HealthPrediction.predicted_at.asc())
        .all()
    )
    history_dicts = [{"soh_percent": h.soh_percent} for h in history]

    # 3. Run inference (edge model — see ml/predict.py)
    result = run_inference(payload, history=history_dicts)

    # 4. Persist the prediction
    prediction = models.HealthPrediction(
        vehicle_id=payload.vehicle_id,
        soh_percent=result.soh_percent,
        rul_cycles=result.rul_cycles,
        anomaly_flag=result.anomaly_flag,
        anomaly_reason=result.anomaly_reason,
    )
    db.add(prediction)
    db.commit()
    db.refresh(prediction)

    # 5. Auto-generate an alert if warranted
    _maybe_create_alert(db, prediction)

    return {
        "cycle_id": cycle.id,
        "prediction": {
            "soh_percent": prediction.soh_percent,
            "rul_cycles": prediction.rul_cycles,
            "anomaly_flag": prediction.anomaly_flag,
            "anomaly_reason": prediction.anomaly_reason,
        },
    }
