import json
import logging
import pickle

import numpy as np
import pytest

import model_runtime as mr
from fixtures import DISEASE_MAP, LABELS, SYMPTOMS, build_model_dir, make_weights, reference_forward


@pytest.fixture()
def model_dir(tmp_path):
    weights = build_model_dir(tmp_path / "m")
    return tmp_path / "m", weights


def load(d):
    return mr.ModelRuntime.load(d, d / "disease_map.json")


def test_loads_and_matches_independent_reference(model_dir):
    d, weights = model_dir
    rt = load(d)
    keys = ["sym_0", "sym_3", "sym_7"]
    vec = np.zeros(len(SYMPTOMS), dtype=np.float32)
    for k in keys:
        vec[SYMPTOMS.index(k)] = 1
    expected = reference_forward(weights, vec)
    got = mr._forward(rt._ops, vec)
    assert np.allclose(got, expected, atol=1e-5)
    result = rt.assess(keys)
    # 3 classes and TOP_K=3, so the reported scores must add up to ~1.
    assert abs(sum(p["score"] for p in result["predictions"]) - 1.0) < 1e-3
    assert result["predictions"][0]["score"] == pytest.approx(float(expected.max()), abs=1e-4)


@pytest.mark.parametrize("keys", [
    ["sym_0", "sym_1", "sym_2"],
    ["sym_9", "sym_4", "sym_6", "sym_2"],
    ["sym_5", "hidden_one", "sym_8"],
])
def test_each_symptom_is_encoded_at_its_exact_list_position(model_dir, keys):
    """The one-hot position of every symptom must equal its index in symptoms_list.json."""
    d, weights = model_dir
    rt = load(d)
    vec = np.zeros(len(SYMPTOMS), dtype=np.float32)
    for k in keys:
        vec[SYMPTOMS.index(k)] = 1
    expected = reference_forward(weights, vec)  # independent, uses SYMPTOMS.index directly
    got = {p["label"]: p["score"] for p in rt.assess(keys)["predictions"]}
    for i, label in enumerate(LABELS):
        assert got[label.strip()] == pytest.approx(float(expected[i]), abs=1e-4)


def test_encoding_is_exact_index_order(model_dir):
    d, weights = model_dir
    rt = load(d)
    # Same keys in a different order and with duplicates must give the same answer.
    a = rt.assess(["sym_1", "sym_4", "sym_9"])
    b = rt.assess(["sym_9", "sym_1", "sym_4", "sym_1"])
    assert a["predictions"] == b["predictions"]


def test_results_are_always_labelled_experimental(model_dir):
    rt = load(model_dir[0])
    r = rt.assess(["sym_0", "sym_1", "sym_2"])
    assert r["modelInfo"]["experimental"] is True and r["modelInfo"]["clinicallyValidated"] is False
    assert "not calibrated" in r["scoreNote"]


def test_rejects_unknown_too_few_too_many_and_wrong_types(model_dir):
    rt = load(model_dir[0])
    with pytest.raises(mr.InvalidInput):
        rt.assess(["sym_0", "sym_1"])  # fewer than MIN_SYMPTOMS
    with pytest.raises(mr.InvalidInput):
        rt.assess(["sym_0", "sym_1", "not a symptom"])
    with pytest.raises(mr.InvalidInput):
        rt.assess([f"sym_{i}" for i in range(10)] * 3 + [f"x{i}" for i in range(30)])
    with pytest.raises(mr.InvalidInput):
        rt.assess(["sym_0", 5, None])


def test_invalid_input_message_never_echoes_values(model_dir):
    rt = load(model_dir[0])
    with pytest.raises(mr.InvalidInput) as e:
        rt.assess(["secret-symptom-xyz", "sym_0", "sym_1"])
    assert "secret-symptom-xyz" not in str(e.value)


def test_hidden_symptoms_not_in_catalogue_but_accepted(model_dir):
    rt = load(model_dir[0])
    keys = {s["key"] for s in rt.catalogue()}
    assert "hidden_one" not in keys and "sym_0" in keys
    assert {"sym_0": "Zero symptom"}.items() <= {s["key"]: s["label"] for s in rt.catalogue()}.items()
    rt.assess(["hidden_one", "sym_0", "sym_1"])  # still a valid model input


def test_weak_match_is_inconclusive_and_uses_labelled_default(model_dir, monkeypatch):
    rt = load(model_dir[0])
    monkeypatch.setattr(mr, "WEAK_BELOW", 0.99999)
    r = rt.assess(["sym_0", "sym_1", "sym_2"])
    assert r["status"] == "inconclusive" and r["matchStrength"] == "weak"
    assert r["recommendedSpecialist"] == "General Medicine" and r["specialtySource"] == "default"


def test_confident_match_uses_model_specialty(model_dir, monkeypatch):
    rt = load(model_dir[0])
    monkeypatch.setattr(mr, "WEAK_BELOW", 0.0)
    r = rt.assess(["sym_0", "sym_1", "sym_2"])
    assert r["status"] == "ok" and r["specialtySource"] == "model"
    assert r["recommendedSpecialist"] == r["predictions"][0]["specialty"]


# ---- fail-closed loading ------------------------------------------------
def test_missing_files_fail_closed(tmp_path):
    (tmp_path / "empty").mkdir()
    with pytest.raises(mr.ModelLoadError, match="missing model file"):
        mr.ModelRuntime.load(tmp_path / "empty", tmp_path / "x.json")


def test_input_size_mismatch_fails(tmp_path):
    d = tmp_path / "m"
    build_model_dir(d)
    (d / "symptoms_list.json").write_text(json.dumps(SYMPTOMS + ["extra"]))
    with pytest.raises(mr.ModelLoadError, match="expects 11 inputs"):
        load(d)


def test_label_set_must_match_disease_map(tmp_path):
    d = tmp_path / "m"
    build_model_dir(d)
    bad = json.loads((d / "disease_map.json").read_text())
    bad["labels"]["delta disease"] = {"display": "D", "specialty": "X"}
    (d / "disease_map.json").write_text(json.dumps(bad))
    with pytest.raises(mr.ModelLoadError, match="label set differs"):
        load(d)


def test_unsupported_layer_fails_instead_of_guessing(tmp_path):
    d = tmp_path / "m"
    build_model_dir(d, extra_layer={"class_name": "Conv1D", "config": {"name": "conv"}})
    with pytest.raises(mr.ModelLoadError, match="unsupported layer type 'Conv1D'"):
        load(d)


def test_non_softmax_output_fails(tmp_path):
    d = tmp_path / "m"
    build_model_dir(d, final_activation="linear")
    with pytest.raises(mr.ModelLoadError, match="expected 'softmax'"):
        load(d)


def test_duplicate_symptom_names_fail(tmp_path):
    d = tmp_path / "m"
    build_model_dir(d)
    (d / "symptoms_list.json").write_text(json.dumps(SYMPTOMS[:-1] + ["sym_0"]))
    with pytest.raises(mr.ModelLoadError, match="duplicate"):
        load(d)


def test_checksum_pin_detects_tampering(tmp_path):
    d = tmp_path / "m"
    build_model_dir(d)
    (d / "SHA256SUMS.txt").write_text("0" * 64 + "  disease_prediction_model.h5\n")
    with pytest.raises(mr.ModelLoadError, match="checksum mismatch"):
        load(d)


def test_no_symptom_values_in_logs(model_dir, caplog):
    rt = load(model_dir[0])
    with caplog.at_level(logging.DEBUG):
        rt.assess(["sym_0", "sym_1", "sym_2"])
        with pytest.raises(mr.InvalidInput):
            rt.assess(["private-thing", "sym_0", "sym_1"])
    text = caplog.text
    assert "sym_0" not in text and "private-thing" not in text
