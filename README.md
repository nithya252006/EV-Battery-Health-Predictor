# VoltGuard — Edge AI EV Battery Health Predictor

VoltGuard predicts EV battery **State of Health (SoH)** and **Remaining
Useful Life (RUL)** from charge-cycle telemetry, flags anomalies
(overheating, sudden degradation), and surfaces it all on a live fleet
dashboard.

## How it works

1. An edge device (or the included simulator) streams raw sensor readings
   (voltage, current, temperature, cycle count) to the backend.
2. The backend runs inference on each reading and stores the resulting
   SoH/RUL prediction.
3. If a vehicle's health drops below a safe threshold or an anomaly is
   detected, an alert is raised automatically.
4. The React dashboard polls the backend and shows fleet-wide health,
   per-vehicle trend charts, and active alerts.

## Tech stack

- **Backend:** FastAPI, SQLAlchemy, SQLite
- **Frontend:** React (Vite), Tailwind CSS, Recharts
- **ML:** currently a documented heuristic in `backend/ml/predict.py`
  (drop-in replaceable with a trained model — see that file's docstring)

## Project structure

```
backend/     FastAPI app, database models, routers, ML inference
frontend/    React dashboard (Vite)
```

## Running it locally

**Backend:**

```bash
cd backend
pip install -r requirements.txt
python seed.py                 # creates sample vehicles
uvicorn main:app --reload --port 8000
```

**Simulate live sensor data** (in a second terminal):

```bash
cd backend
python edge_simulator.py <vehicle_id>
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

Then open `http://localhost:5173`.

Full backend API reference: see [`backend/README.md`](backend/README.md).

## Current limitations / future work

- ML model is a rule-based heuristic, not yet trained on real battery
  degradation datasets (NASA/Oxford/CALCE) — see `ml/predict.py` for the
  planned upgrade path.
- No authentication on the API yet.
- Alerts are created per-reading rather than deduplicated per ongoing issue.
