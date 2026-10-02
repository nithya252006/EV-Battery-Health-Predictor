from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db

router = APIRouter(tags=["predictions"])


def _maybe_create_alert(db: Session, prediction: models.HealthPrediction):
    """Auto-generate an alert when a prediction indicates trouble."""
    if prediction.anomaly_flag or prediction.soh_percent < 70:
        severity = "high" if prediction.soh_percent < 60 or prediction.anomaly_flag else "medium"
        message = (
            prediction.anomaly_reason
            if prediction.anomaly_flag and prediction.anomaly_reason
            else f"SoH at {prediction.soh_percent}% — approaching replacement threshold"
        )
        alert = models.Alert(
            vehicle_id=prediction.vehicle_id,
            severity=severity,
            message=message,
        )
        db.add(alert)
        db.commit()


@router.post("/predictions", response_model=schemas.PredictionOut)
def create_prediction(payload: schemas.PredictionCreate, db: Session = Depends(get_db)):
    """
    Direct ingestion endpoint — use this if inference already ran on the
    edge device and you just need to sync the result to the backend.
    For raw sensor readings that still need inference, use /ingest instead.
    """
    prediction = models.HealthPrediction(**payload.model_dump())
    db.add(prediction)
    db.commit()
    db.refresh(prediction)

    _maybe_create_alert(db, prediction)
    return prediction


@router.get("/vehicles/{vehicle_id}/predictions/latest", response_model=schemas.PredictionOut)
def latest_prediction(vehicle_id: str, db: Session = Depends(get_db)):
    prediction = (
        db.query(models.HealthPrediction)
        .filter(models.HealthPrediction.vehicle_id == vehicle_id)
        .order_by(models.HealthPrediction.predicted_at.desc())
        .first()
    )
    if not prediction:
        raise HTTPException(status_code=404, detail="No predictions yet for this vehicle")
    return prediction


@router.get("/vehicles/{vehicle_id}/predictions/history", response_model=List[schemas.PredictionOut])
def prediction_history(vehicle_id: str, db: Session = Depends(get_db)):
    return (
        db.query(models.HealthPrediction)
        .filter(models.HealthPrediction.vehicle_id == vehicle_id)
        .order_by(models.HealthPrediction.predicted_at.asc())
        .all()
    )
