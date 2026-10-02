"""
Simulates an edge device streaming battery telemetry to the backend.
Use this for a live demo instead of real hardware:
    python edge_simulator.py <vehicle_id>

Get a vehicle_id by running seed.py first, or GET /vehicles.
"""

import sys
import time
import random
import requests

API_URL = "http://localhost:8000/ingest"


def simulate(vehicle_id: str, cycles: int = 20, delay_seconds: float = 2.0, degrade_from_cycle: int = 12):
    print(f"Streaming {cycles} simulated cycles for vehicle {vehicle_id}...\n")
    for i in range(1, cycles + 1):
        temp_spike = 14 if i == degrade_from_cycle else 0  # inject one anomaly
        reading = {
            "vehicle_id": vehicle_id,
            "cycle_number": i,
            "voltage_avg": round(370 + random.uniform(-2, 2), 1),
            "current_avg": round(15 + random.uniform(-1, 1), 1),
            "temperature_max": round(34 + temp_spike + random.uniform(0, 4), 1),
            "charge_duration_min": round(45 + random.uniform(-5, 5), 1),
        }
        try:
            res = requests.post(API_URL, json=reading, timeout=5)
            data = res.json()
            pred = data.get("prediction", {})
            flag = " ANOMALY" if pred.get("anomaly_flag") else ""
            print(f"Cycle {i:>2} | SoH {pred.get('soh_percent')}% | RUL {pred.get('rul_cycles')} cycles{flag}")
        except requests.exceptions.ConnectionError:
            print(f"Cycle {i:>2} | offline — queued locally (simulated)")
        time.sleep(delay_seconds)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python edge_simulator.py <vehicle_id>")
        sys.exit(1)
    simulate(sys.argv[1])
