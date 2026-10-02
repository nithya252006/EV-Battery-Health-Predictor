# VoltGuard Backend

FastAPI backend for the Edge AI EV Battery Health Predictor (InnoVent-27).

## Setup

```bash
pip install -r requirements.txt
```

## Run

```bash
uvicorn main:app --reload --port 8000
```

API docs (auto-generated): http://localhost:8000/docs

## Seed sample data

```bash
python seed.py
```

Copy one of the printed vehicle IDs for the next step.

## Demo the live edge → cloud flow

In a second terminal:

```bash
python edge_simulator.py <vehicle_id>
```

This streams simulated sensor readings to `/ingest`, which runs them through
the ML model (`ml/predict.py`) and stores the resulting SoH/RUL predictions —
this is the same call path a real Raspberry Pi/Jetson edge device would make.

## Enable the GenAI chat endpoint

```bash
export ANTHROPIC_API_KEY=your_key_here   # Windows: set ANTHROPIC_API_KEY=...
```

Then POST to `/chat` with `{"vehicle_id": "...", "question": "why is this flagged?"}`.

## Key endpoints

| Method | Route | Purpose |
|---|---|---|
| POST | `/vehicles` | register a vehicle |
| GET | `/vehicles` | list vehicles |
| POST | `/ingest` | edge device sends a raw reading → runs inference → stores everything |
| GET | `/vehicles/{id}/predictions/history` | data for the frontend's SoH trend chart |
| GET | `/vehicles/{id}/predictions/latest` | current health snapshot |
| GET | `/alerts?resolved=false` | active alerts for the dashboard |
| POST | `/alerts/{id}/resolve` | mark an alert resolved |
| POST | `/chat` | GenAI explain-the-alert endpoint |

## Connecting the React frontend

The frontend (`voltguard_frontend.jsx`) currently uses mock data. To wire it
to this backend, replace the `FLEET` mock array with `fetch` calls to
`http://localhost:8000/vehicles` and
`http://localhost:8000/vehicles/{id}/predictions/history`.

## Swapping in a real trained ML model

See the docstring at the top of `ml/predict.py` — it currently uses a
documented heuristic so the backend runs with zero setup. Swapping in a
real TensorFlow Lite model trained on the NASA/Oxford/CALCE battery
datasets is a drop-in replacement; the function signature stays the same.
