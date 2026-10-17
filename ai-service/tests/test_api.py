import logging

import pytest
from fastapi.testclient import TestClient

from fixtures import build_model_dir
from main import create_app


@pytest.fixture()
def client(tmp_path):
    d = tmp_path / "m"
    build_model_dir(d)
    with TestClient(create_app(d, d / "disease_map.json")) as c:
        yield c


@pytest.fixture()
def degraded_client(tmp_path):
    (tmp_path / "none").mkdir()
    with TestClient(create_app(tmp_path / "none", tmp_path / "none" / "x.json")) as c:
        yield c


def test_health_ok(client):
    body = client.get("/health").json()
    assert body["status"] == "ok" and body["modelLoaded"] is True and body["model"]["experimental"] is True


def test_missing_model_is_degraded_never_mocked(degraded_client):
    h = degraded_client.get("/health").json()
    assert h["status"] == "degraded" and h["modelLoaded"] is False and "missing model file" in h["reason"]
    r = degraded_client.post("/predict", json={"symptoms": ["a", "b", "c"]})
    assert r.status_code == 503 and r.json()["error"] == "MODEL_UNAVAILABLE"
    assert degraded_client.get("/symptoms").status_code == 503


def test_symptom_catalogue(client):
    body = client.get("/symptoms").json()
    assert body["minSymptoms"] == 3 and body["maxSymptoms"] == 20
    assert all(set(s) == {"key", "label"} for s in body["symptoms"])
    assert "hidden_one" not in {s["key"] for s in body["symptoms"]}


def test_predict_ok_shape(client):
    r = client.post("/predict", json={"symptoms": ["sym_0", "sym_1", "sym_2"]})
    assert r.status_code == 200
    b = r.json()
    assert set(b) == {"modelInfo", "status", "matchStrength", "predictions", "recommendedSpecialist", "specialtySource", "scoreNote"}
    assert len(b["predictions"]) == 3 and b["modelInfo"]["experimental"] is True


@pytest.mark.parametrize("payload", [
    {"symptoms": ["sym_0", "sym_1"]},
    {"symptoms": ["sym_0", "sym_1", "bogus-private-xyz"]},
    {"symptoms": "not-a-list"},
    {},
    {"symptoms": [1, 2, 3]},
])
def test_invalid_input_is_422_and_never_echoed(client, payload):
    r = client.post("/predict", json=payload)
    assert r.status_code == 422
    assert r.json()["error"] == "INVALID_INPUT"
    assert "bogus-private-xyz" not in r.text and "not-a-list" not in r.text


def test_logs_contain_no_symptoms(client, caplog):
    with caplog.at_level(logging.DEBUG):
        client.post("/predict", json={"symptoms": ["sym_0", "sym_1", "sym_2"]})
        client.post("/predict", json={"symptoms": ["leak-me-123", "sym_1", "sym_2"]})
    assert "sym_0" not in caplog.text and "leak-me-123" not in caplog.text
