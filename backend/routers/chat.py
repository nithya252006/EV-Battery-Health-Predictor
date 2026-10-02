import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db

router = APIRouter(tags=["chat"])

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")


@router.post("/chat", response_model=schemas.ChatResponse)
def chat(payload: schemas.ChatRequest, db: Session = Depends(get_db)):
    """
    Explains the current health status of a vehicle in plain language.
    Requires ANTHROPIC_API_KEY to be set in the environment.
    """
    if not ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="ANTHROPIC_API_KEY is not set. Set it as an environment variable to enable chat.",
        )

    prediction = (
        db.query(models.HealthPrediction)
        .filter(models.HealthPrediction.vehicle_id == payload.vehicle_id)
        .order_by(models.HealthPrediction.predicted_at.desc())
        .first()
    )
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == payload.vehicle_id).first()

    if not prediction or not vehicle:
        raise HTTPException(status_code=404, detail="No prediction data found for this vehicle yet")

    context = f"""Vehicle: {vehicle.name} ({vehicle.model or 'unknown model'})
State of Health: {prediction.soh_percent}%
Remaining Useful Life: {prediction.rul_cycles} cycles
Anomaly flag: {prediction.anomaly_flag}
Anomaly reason: {prediction.anomaly_reason or 'none'}"""

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=300,
            messages=[{
                "role": "user",
                "content": (
                    f"Battery diagnostic data:\n{context}\n\n"
                    f"Question from fleet manager: {payload.question}\n\n"
                    "Answer in 2-4 short, plain-language sentences for a non-technical reader."
                ),
            }],
        )
        answer = "".join(block.text for block in response.content if hasattr(block, "text"))
        return schemas.ChatResponse(answer=answer.strip())

    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Chat request failed: {e}")
