import uuid
from datetime import datetime

from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from database import Base


def gen_uuid():
    return str(uuid.uuid4())


class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(String, primary_key=True, default=gen_uuid)
    name = Column(String, nullable=False)
    model = Column(String, nullable=True)
    battery_capacity_kwh = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    cycles = relationship("BatteryCycle", back_populates="vehicle", cascade="all, delete-orphan")
    predictions = relationship("HealthPrediction", back_populates="vehicle", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="vehicle", cascade="all, delete-orphan")


class BatteryCycle(Base):
    __tablename__ = "battery_cycles"

    id = Column(String, primary_key=True, default=gen_uuid)
    vehicle_id = Column(String, ForeignKey("vehicles.id"), nullable=False, index=True)
    cycle_number = Column(Integer, nullable=False)
    voltage_avg = Column(Float, nullable=False)
    current_avg = Column(Float, nullable=False)
    temperature_max = Column(Float, nullable=False)
    charge_duration_min = Column(Float, nullable=True)
    capacity_measured_kwh = Column(Float, nullable=True)
    recorded_at = Column(DateTime, default=datetime.utcnow, index=True)

    vehicle = relationship("Vehicle", back_populates="cycles")


class HealthPrediction(Base):
    __tablename__ = "health_predictions"

    id = Column(String, primary_key=True, default=gen_uuid)
    vehicle_id = Column(String, ForeignKey("vehicles.id"), nullable=False, index=True)
    soh_percent = Column(Float, nullable=False)
    rul_cycles = Column(Integer, nullable=True)
    anomaly_flag = Column(Boolean, default=False)
    anomaly_reason = Column(String, nullable=True)
    predicted_at = Column(DateTime, default=datetime.utcnow, index=True)

    vehicle = relationship("Vehicle", back_populates="predictions")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String, primary_key=True, default=gen_uuid)
    vehicle_id = Column(String, ForeignKey("vehicles.id"), nullable=False, index=True)
    severity = Column(String, nullable=False)  # low / medium / high
    message = Column(String, nullable=False)
    resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    vehicle = relationship("Vehicle", back_populates="alerts")
