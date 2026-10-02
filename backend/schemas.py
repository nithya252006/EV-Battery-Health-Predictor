from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


# ---------------------------------------------------------------------------
# Vehicle
# ---------------------------------------------------------------------------
class VehicleCreate(BaseModel):
    name: str
    model: Optional[str] = None
    battery_capacity_kwh: Optional[float] = None


class VehicleOut(VehicleCreate):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Battery cycle (raw telemetry pushed from the edge device)
# ---------------------------------------------------------------------------
class CycleCreate(BaseModel):
    vehicle_id: str
    cycle_number: int
    voltage_avg: float
    current_avg: float
    temperature_max: float
    charge_duration_min: Optional[float] = None
    capacity_measured_kwh: Optional[float] = None


class CycleOut(CycleCreate):
    model_config = ConfigDict(from_attributes=True)
    id: str
    recorded_at: datetime


# ---------------------------------------------------------------------------
# Health prediction (edge model output)
# ---------------------------------------------------------------------------
class PredictionCreate(BaseModel):
    vehicle_id: str
    soh_percent: float
    rul_cycles: Optional[int] = None
    anomaly_flag: bool = False
    anomaly_reason: Optional[str] = None


class PredictionOut(PredictionCreate):
    model_config = ConfigDict(from_attributes=True)
    id: str
    predicted_at: datetime


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------
class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    vehicle_id: str
    severity: str
    message: str
    resolved: bool
    created_at: datetime


# ---------------------------------------------------------------------------
# Chat (GenAI explainability layer)
# ---------------------------------------------------------------------------
class ChatRequest(BaseModel):
    vehicle_id: str
    question: str


class ChatResponse(BaseModel):
    answer: str


# ---------------------------------------------------------------------------
# Edge ingest — raw sensor reading straight from the vehicle/simulator,
# runs through the ML model server-side and creates both a prediction + cycle
# ---------------------------------------------------------------------------
class SensorReading(BaseModel):
    vehicle_id: str
    cycle_number: int
    voltage_avg: float
    current_avg: float
    temperature_max: float
    charge_duration_min: Optional[float] = None
