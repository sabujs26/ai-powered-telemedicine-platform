"""
AI symptom-pattern service (FastAPI).

Replaces the earlier hard-coded stub. There is NO mock/fallback predictor:
if the model files are missing or inconsistent the service starts in a
"degraded" state, /health explains why, and /predict + /symptoms answer 503.

Privacy: symptom values are never logged and never echoed back in errors.
Run it bound to localhost only (see README/start instructions) - it has no
authentication of its own because only the Express backend should call it.
"""

import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from model_runtime import (
    MAX_SYMPTOMS,
    MIN_SYMPTOMS,
    MODEL_NAME,
    MODEL_REVISION,
    InvalidInput,
    ModelLoadError,
    ModelRuntime,
)

BASE_DIR = Path(__file__).resolve().parent
log = logging.getLogger("ai.service")


class PredictRequest(BaseModel):
    symptoms: list[str]


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": code, "message": message})


def create_app(model_dir: Path | None = None, disease_map_path: Path | None = None) -> FastAPI:
    model_dir = Path(model_dir or os.environ.get("MODEL_DIR") or BASE_DIR / "model")
    disease_map_path = Path(disease_map_path or BASE_DIR / "data" / "disease_map.json")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.runtime = None
        app.state.reason = None
        try:
            app.state.runtime = ModelRuntime.load(model_dir, disease_map_path)
        except ModelLoadError as exc:
            app.state.reason = str(exc)
            log.error("model unavailable: %s", exc)
        yield

    app = FastAPI(title="Telemed AI symptom-pattern service (experimental)", lifespan=lifespan)

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(request: Request, exc: RequestValidationError):
        # FastAPI's default 422 body echoes the offending input - which here is
        # patient health data. Return a generic message instead.
        return _error(422, "INVALID_INPUT", "Request body is invalid.")

    @app.get("/health")
    def health():
        rt: ModelRuntime | None = app.state.runtime
        return {
            "status": "ok" if rt else "degraded",
            "modelLoaded": rt is not None,
            "reason": None if rt else app.state.reason,
            "model": {"name": MODEL_NAME, "revision": MODEL_REVISION[:7], "experimental": True},
            "layers": rt.summary if rt else None,
            "artifactSha256": rt.hashes if rt else None,
        }

    @app.get("/symptoms")
    def symptoms():
        rt: ModelRuntime | None = app.state.runtime
        if rt is None:
            return _error(503, "MODEL_UNAVAILABLE", "The symptom model is not available.")
        return {"symptoms": rt.catalogue(), "minSymptoms": MIN_SYMPTOMS, "maxSymptoms": MAX_SYMPTOMS}

    @app.post("/predict")
    def predict(body: PredictRequest):
        rt: ModelRuntime | None = app.state.runtime
        if rt is None:
            return _error(503, "MODEL_UNAVAILABLE", "The symptom model is not available.")
        started = time.perf_counter()
        try:
            result = rt.assess(body.symptoms)
        except InvalidInput as exc:
            return _error(422, "INVALID_INPUT", str(exc))
        # Counts/timing only - never the symptom values.
        log.info(
            "predict ok n=%d strength=%s ms=%d",
            len(set(body.symptoms)),
            result["matchStrength"],
            (time.perf_counter() - started) * 1000,
        )
        return result

    return app


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
app = create_app()
