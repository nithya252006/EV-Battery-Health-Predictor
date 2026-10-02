from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine
from routers import vehicles, cycles, predictions, alerts, chat, ingest

# Create tables on startup (fine for SQLite/demo; use Alembic migrations for production)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="VoltGuard API",
    description="Backend for the Edge AI EV Battery Health Predictor (InnoVent-27)",
    version="1.0.0",
)

# Allow the React frontend (any origin, fine for a hackathon demo — restrict in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(vehicles.router)
app.include_router(cycles.router)
app.include_router(predictions.router)
app.include_router(alerts.router)
app.include_router(chat.router)
app.include_router(ingest.router)


@app.get("/")
def root():
    return {"status": "VoltGuard API is running", "docs": "/docs"}
