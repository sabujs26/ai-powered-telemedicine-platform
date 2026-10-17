"""Runs only when the real downloaded model files are present in ai-service/model/."""
from pathlib import Path

import pytest

import model_runtime as mr

ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "model"
needs_model = pytest.mark.skipif(
    not all((MODEL_DIR / f).is_file() for f in mr.ARTIFACTS.values()), reason="real model files not downloaded"
)


@needs_model
def test_real_model_loads_and_outputs_are_sane():
    rt = mr.ModelRuntime.load(MODEL_DIR, ROOT / "data" / "disease_map.json")
    assert len(rt.symptoms) == 132 and len(rt.classes) == 41
    keys = [s["key"] for s in rt.catalogue()][:3]
    r = rt.assess(keys)
    assert abs(sum(p["score"] for p in r["predictions"])) <= 1.0001
    assert r["modelInfo"]["clinicallyValidated"] is False
