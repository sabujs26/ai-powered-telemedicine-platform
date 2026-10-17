import os
import pickle
from pathlib import Path

import pytest
from sklearn.preprocessing import LabelEncoder

import model_runtime as mr

HERE = Path(__file__).parent


def test_loads_label_encoder_pickled_by_current_numpy(tmp_path):
    p = tmp_path / "le.pkl"
    p.write_bytes(pickle.dumps(LabelEncoder().fit(["b", "a ", "C"])))
    assert mr.load_label_classes(p) == ["C", "a ", "b"]


def test_loads_label_encoder_pickled_by_numpy_1x_module_paths():
    """The real HF file refers to 'numpy.core.multiarray'; this fixture was generated with numpy 1.26."""
    f = HERE / "data" / "label_encoder_numpy1.pkl"
    if not f.exists():
        pytest.skip("numpy-1.x pickle fixture not present")
    assert mr.load_label_classes(f) == ["Diabetes ", "Migraine", "hepatitis A"]
    assert b"numpy.core.multiarray" in f.read_bytes()


def test_malicious_pickle_is_rejected_and_not_executed(tmp_path):
    marker = tmp_path / "pwned.txt"

    class Evil:
        def __reduce__(self):
            return (os.system, (f"echo owned > {marker}",))

    p = tmp_path / "evil.pkl"
    p.write_bytes(pickle.dumps(Evil()))
    with pytest.raises(mr.ModelLoadError, match="rejected"):
        mr.load_label_classes(p)
    assert not marker.exists()


def test_arbitrary_builtins_are_blocked(tmp_path):
    p = tmp_path / "x.pkl"
    p.write_bytes(pickle.dumps(eval))  # a global that is not on the allow-list
    with pytest.raises(mr.ModelLoadError):
        mr.load_label_classes(p)


def test_pickle_that_is_not_a_label_encoder_is_rejected(tmp_path):
    p = tmp_path / "list.pkl"
    p.write_bytes(pickle.dumps(["a", "b"]))
    with pytest.raises(mr.ModelLoadError, match="not a fitted LabelEncoder"):
        mr.load_label_classes(p)
