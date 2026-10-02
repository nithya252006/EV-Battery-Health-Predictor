"""
Run this once after starting the app to populate sample vehicles:
    python seed.py
"""

from database import SessionLocal, Base, engine
import models

Base.metadata.create_all(bind=engine)
db = SessionLocal()

sample_vehicles = [
    {"name": "Fleet Van 04", "model": "Tata Ace EV", "battery_capacity_kwh": 21.5},
    {"name": "Fleet Van 11", "model": "Tata Ace EV", "battery_capacity_kwh": 21.5},
    {"name": "Cab 27", "model": "Tigor EV", "battery_capacity_kwh": 26.0},
    {"name": "Cab 09", "model": "Tigor EV", "battery_capacity_kwh": 26.0},
]

for v in sample_vehicles:
    exists = db.query(models.Vehicle).filter(models.Vehicle.name == v["name"]).first()
    if not exists:
        db.add(models.Vehicle(**v))

db.commit()
print(f"Seeded {len(sample_vehicles)} vehicles.")

for v in db.query(models.Vehicle).all():
    print(f"  {v.id}  {v.name}  ({v.model})")

db.close()
