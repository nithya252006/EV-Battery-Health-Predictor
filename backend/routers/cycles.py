from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db

router = APIRouter(tags=["cycles"])


@router.post("/cycles", response_model=schemas.CycleOut)
def create_cycle(payload: schemas.CycleCreate, db: Session = Depends(get_db)):
    cycle = models.BatteryCycle(**payload.model_dump())
    db.add(cycle)
    db.commit()
    db.refresh(cycle)
    return cycle


@router.get("/vehicles/{vehicle_id}/cycles", response_model=List[schemas.CycleOut])
def get_vehicle_cycles(vehicle_id: str, db: Session = Depends(get_db)):
    return (
        db.query(models.BatteryCycle)
        .filter(models.BatteryCycle.vehicle_id == vehicle_id)
        .order_by(models.BatteryCycle.cycle_number.asc())
        .all()
    )
