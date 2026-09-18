"""
AI Symptom Assessment microservice — stub implementation.

This matches the POST /predict contract from Section 12 of the requirements
baseline (AI-05, AI-06, AI-09). Right now it returns a fixed placeholder
prediction plus an emergency-symptom check (decision #3, Section 18) so the
rest of the system (frontend, backend, DB) can be built and tested end to end
before the real trained model is ready.

WHEN YOU HAVE YOUR TRAINED MODEL:
  1. Load it once at startup (see the `# TODO: load model` marker below).
  2. Replace the body of `run_stub_prediction()` with a real
     `model.predict(...)` call that returns the same shape:
        { "condition": str, "confidence": float }
  3. Everything else in this file — the emergency check, the response
     schema, the specialist lookup — can stay exactly as is.
  No changes are needed in the Node backend or the React frontend.
"""

from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI(title="Telemed AI Service")

# --- Decision #3 (Section 18): fixed red-flag symptom list -----------------
# If any of these appear in the submitted symptoms, we short-circuit the
# normal prediction and flag it as an emergency instead (AI-09).
EMERGENCY_SYMPTOMS = {
    "chest pain",
    "difficulty breathing",
    "severe bleeding",
    "loss of consciousness",
    "stroke symptoms",
    "severe allergic reaction",
}

# --- Placeholder specialist mapping (decision #1, Section 18) --------------
# Replace this once your trained model's real output classes are known —
# the model's class list IS the taxonomy (no separate dataset needed).
CONDITION_TO_SPECIALIST = {
    "common cold": "General Physician",
    "migraine": "Neurologist",
    "gastritis": "Gastroenterologist",
    "skin rash": "Dermatologist",
}


class PredictRequest(BaseModel):
    symptoms: List[str]


class Prediction(BaseModel):
    condition: str
    confidence: float


class PredictResponse(BaseModel):
    predictions: List[Prediction]
    emergencyFlag: bool
    recommendedSpecialist: Optional[str] = None


# TODO: load model
# model = joblib.load("model.pkl")  # or however your trained model is saved


def check_emergency(symptoms: List[str]) -> bool:
    normalized = {s.strip().lower() for s in symptoms}
    return bool(normalized & EMERGENCY_SYMPTOMS)


def run_stub_prediction(symptoms: List[str]) -> List[Prediction]:
    """Placeholder logic — replace with a real model.predict() call."""
    return [Prediction(condition="common cold", confidence=0.62)]


@app.get("/health")
def health():
    return {"status": "ok", "service": "telemed-ai-service"}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    emergency = check_emergency(req.symptoms)

    if emergency:
        # Per decision #3: still return a response, but flagged — the
        # backend/frontend show an urgent-care warning; booking is not blocked.
        return PredictResponse(predictions=[], emergencyFlag=True, recommendedSpecialist=None)

    predictions = run_stub_prediction(req.symptoms)
    top_condition = predictions[0].condition if predictions else None
    specialist = CONDITION_TO_SPECIALIST.get(top_condition)

    return PredictResponse(
        predictions=predictions,
        emergencyFlag=False,
        recommendedSpecialist=specialist,
    )
