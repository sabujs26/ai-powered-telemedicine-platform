"""Contract tests against the REAL upstream symptom vocabulary (tests/data/symptoms_list.upstream.json)."""
import json
from pathlib import Path

import pytest

import model_runtime as mr
from fixtures import DISEASE_MAP, build_model_dir

DATA = Path(__file__).parent / "data" / "symptoms_list.upstream.json"
REAL_MAP = json.loads((Path(__file__).resolve().parents[1] / "data" / "disease_map.json").read_text(encoding="utf-8"))
VOCAB = json.loads(DATA.read_text(encoding="utf-8"))


def test_vocabulary_shape():
    assert len(VOCAB) == 132 and len(set(VOCAB)) == 132


def test_every_hidden_symptom_and_label_override_exists_in_vocabulary():
    for key in list(REAL_MAP["hidden_symptoms"]) + list(REAL_MAP["symptom_labels"]):
        assert key in VOCAB, key


def test_disease_map_is_complete_and_well_formed():
    labels = REAL_MAP["labels"]
    assert len(labels) == 41
    for key, entry in labels.items():
        assert key == mr.normalise_label(key), f"map key not normalised: {key!r}"
        assert entry["display"].strip() and entry["specialty"].strip()
    assert REAL_MAP["default_specialty"] in {e["specialty"] for e in labels.values()}


def test_catalogue_with_real_vocabulary_hides_only_the_two_declared_items(tmp_path):
    d = tmp_path / "m"
    build_model_dir(d, symptoms=VOCAB)
    custom = dict(DISEASE_MAP, hidden_symptoms=REAL_MAP["hidden_symptoms"], symptom_labels=REAL_MAP["symptom_labels"])
    (d / "disease_map.json").write_text(json.dumps(custom), encoding="utf-8")
    rt = mr.ModelRuntime.load(d, d / "disease_map.json")
    cat = {s["key"]: s["label"] for s in rt.catalogue()}
    assert len(cat) == 130
    assert "fluid_overload.1" not in cat and "extra_marital_contacts" not in cat
    assert cat["spotting_ urination"] == "Spotting during urination"
    assert cat["skin_rash"] == "Skin rash"
    # hidden symptoms are still valid model inputs (always encoded as 0 by the UI)
    rt.assess(["fluid_overload.1", "itching", "skin_rash"])
