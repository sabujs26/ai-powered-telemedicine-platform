"""
Local inference runtime for the *experimental* symptom-pattern model
NatiTs/Disease-Prediction-Model (Apache-2.0, pinned revision below).

Design rules (deliberate):
  * NO TensorFlow. The .h5 is read with h5py and evaluated with numpy, so the
    service installs quickly on Windows and cannot be broken by a TF/Keras
    version mismatch. Only the layer types listed in _SUPPORTED are accepted;
    anything else makes loading FAIL (we never guess what a layer does).
  * NO unrestricted unpickling. label_encoder.pkl is read with an allow-list
    unpickler that can only build the four classes the file legitimately
    needs. Anything else (e.g. os.system) is rejected.
  * FAIL CLOSED. If the files are missing, the shapes do not line up, or the
    label set differs from data/disease_map.json, ModelLoadError is raised and
    the HTTP layer reports "model unavailable". There is no fallback predictor.
  * NO PATIENT DATA IN LOGS. Nothing in this module logs symptom values.

The model is NOT clinically validated. Scores are raw model outputs, not
calibrated probabilities.
"""

from __future__ import annotations

import hashlib
import importlib
import json
import logging
import pickle
from dataclasses import dataclass
from pathlib import Path

import h5py
import numpy as np

log = logging.getLogger("ai.runtime")

MODEL_NAME = "NatiTs/Disease-Prediction-Model"
MODEL_REVISION = "c87dc2f5f8f96cfec3580fa4b739e8044398ad15"

ARTIFACTS = {
    "model": "disease_prediction_model.h5",
    "labels": "label_encoder.pkl",
    "symptoms": "symptoms_list.json",
}

# Product-safety heuristics (NOT statistically derived - see MODEL_CARD.md).
MIN_SYMPTOMS = 3
MAX_SYMPTOMS = 20
WEAK_BELOW = 0.40
STRONG_FROM = 0.75
TOP_K = 3

_MAX_BYTES = {"model": 20_000_000, "labels": 1_000_000, "symptoms": 1_000_000}


class ModelLoadError(Exception):
    """The model cannot be used. The message never contains patient data."""


class InvalidInput(ValueError):
    """Caller supplied unusable symptoms. The message never echoes the input."""


def normalise_label(label: str) -> str:
    return " ".join(str(label).split()).lower()


# --------------------------------------------------------------------------
# Restricted unpickler for label_encoder.pkl
# --------------------------------------------------------------------------
class _LabelEncoderStub:
    """Stands in for sklearn's LabelEncoder so scikit-learn is not required."""

    def __setstate__(self, state):  # pickle calls this with the object's __dict__
        self.state = state


def _numpy_reconstruct():
    for mod in ("numpy._core.multiarray", "numpy.core.multiarray"):
        try:
            return getattr(importlib.import_module(mod), "_reconstruct")
        except Exception:  # noqa: BLE001 - try the next spelling
            continue
    raise ModelLoadError("numpy is missing the array reconstruct helper")


class _RestrictedUnpickler(pickle.Unpickler):
    _SIMPLE = {
        ("sklearn.preprocessing._label", "LabelEncoder"): _LabelEncoderStub,
        ("numpy", "ndarray"): np.ndarray,
        ("numpy", "dtype"): np.dtype,
    }
    _RECONSTRUCT_MODULES = ("numpy.core.multiarray", "numpy._core.multiarray")

    def find_class(self, module, name):
        if (module, name) in self._SIMPLE:
            return self._SIMPLE[(module, name)]
        if name == "_reconstruct" and module in self._RECONSTRUCT_MODULES:
            return _numpy_reconstruct()
        raise pickle.UnpicklingError(f"blocked unpickle of {module}.{name}")


def load_label_classes(path: Path) -> list[str]:
    try:
        with open(path, "rb") as fh:
            obj = _RestrictedUnpickler(fh).load()
    except pickle.UnpicklingError as exc:
        raise ModelLoadError(f"label_encoder.pkl rejected: {exc}") from exc
    except Exception as exc:  # noqa: BLE001
        raise ModelLoadError(f"label_encoder.pkl unreadable ({type(exc).__name__})") from exc
    state = getattr(obj, "state", None)
    if not isinstance(state, dict) or "classes_" not in state:
        raise ModelLoadError("label_encoder.pkl is not a fitted LabelEncoder (no classes_)")
    classes = [str(c) for c in np.asarray(state["classes_"]).tolist()]
    if not classes:
        raise ModelLoadError("label encoder has zero classes")
    return classes


# --------------------------------------------------------------------------
# Keras HDF5 reader + numpy forward pass
# --------------------------------------------------------------------------
_SUPPORTED = {
    "InputLayer", "Dense", "Dropout", "GaussianNoise", "GaussianDropout",
    "BatchNormalization", "Activation", "ReLU", "Softmax",
}


def _act(name: str):
    def softmax(x):
        z = x - np.max(x, axis=-1, keepdims=True)
        e = np.exp(z)
        return e / np.sum(e, axis=-1, keepdims=True)

    table = {
        "linear": lambda x: x,
        "relu": lambda x: np.maximum(x, 0),
        "sigmoid": lambda x: 1.0 / (1.0 + np.exp(-x)),
        "tanh": np.tanh,
        "softmax": softmax,
    }
    if name not in table:
        raise ModelLoadError(f"unsupported activation '{name}'")
    return table[name], name


@dataclass
class _Op:
    kind: str
    fn: object
    final_activation: str | None = None


def _weight(group: h5py.Group, suffix: str):
    names = [n.decode() if isinstance(n, bytes) else str(n) for n in group.attrs.get("weight_names", [])]
    for n in names:
        if n.split("/")[-1].split(":")[0] == suffix:
            return np.asarray(group[n], dtype=np.float32)
    return None


def read_keras_h5(path: Path):
    """Returns (ops, input_dim, output_dim, summary). Raises ModelLoadError on anything unsupported."""
    try:
        f = h5py.File(path, "r")
    except Exception as exc:  # noqa: BLE001
        raise ModelLoadError(f"model file is not a readable HDF5 file ({type(exc).__name__})") from exc
    with f:
        raw = f.attrs.get("model_config")
        if raw is None:
            raise ModelLoadError("HDF5 file has no model_config (weights-only or not a Keras model)")
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        try:
            cfg = json.loads(raw)
        except Exception as exc:  # noqa: BLE001
            raise ModelLoadError("model_config is not valid JSON") from exc

        if cfg.get("class_name") not in {"Sequential", "Functional", "Model"}:
            raise ModelLoadError(f"unsupported model class '{cfg.get('class_name')}'")
        inner = cfg.get("config")
        layers = inner.get("layers") if isinstance(inner, dict) else inner
        if not layers:
            raise ModelLoadError("model has no layers")

        outs = inner.get("output_layers") if isinstance(inner, dict) else None
        if outs and (len(outs) != 1 or outs[0][0] != layers[-1]["config"].get("name")):
            raise ModelLoadError("model is not a simple linear stack (multiple/odd outputs)")

        weights_root = f["model_weights"] if "model_weights" in f else f

        ops: list[_Op] = []
        summary: list[str] = []
        input_dim = None
        last_dense_out = None

        for layer in layers:
            kind = layer.get("class_name")
            lc = layer.get("config", {})
            name = lc.get("name")
            if kind not in _SUPPORTED:
                raise ModelLoadError(f"unsupported layer type '{kind}' (supported: {sorted(_SUPPORTED)})")

            if kind == "InputLayer":
                shape = lc.get("batch_input_shape") or lc.get("batch_shape")
                if not shape or len(shape) != 2 or not shape[1]:
                    raise ModelLoadError("input must be a flat vector (batch, features)")
                input_dim = int(shape[1])
                summary.append(f"InputLayer({input_dim})")
                continue

            if kind == "Dense":
                if name not in weights_root:
                    raise ModelLoadError(f"no weights found for layer '{name}'")
                g = weights_root[name]
                kernel, bias = _weight(g, "kernel"), _weight(g, "bias")
                if kernel is None or kernel.ndim != 2:
                    raise ModelLoadError(f"layer '{name}' has no 2-D kernel")
                if lc.get("use_bias", True):
                    if bias is None or bias.shape != (kernel.shape[1],):
                        raise ModelLoadError(f"layer '{name}' bias shape mismatch")
                else:
                    bias = np.zeros(kernel.shape[1], dtype=np.float32)
                if input_dim is None:
                    shp = lc.get("batch_input_shape")
                    input_dim = int(shp[1]) if shp and len(shp) == 2 and shp[1] else int(kernel.shape[0])
                if last_dense_out is not None and kernel.shape[0] != last_dense_out:
                    raise ModelLoadError(f"layer '{name}' input size {kernel.shape[0]} != previous output {last_dense_out}")
                if last_dense_out is None and kernel.shape[0] != input_dim:
                    raise ModelLoadError(f"first Dense input {kernel.shape[0]} != declared input {input_dim}")
                activation = lc.get("activation", "linear")
                if not isinstance(activation, str):
                    raise ModelLoadError(f"layer '{name}' has a non-string activation")
                fn, act_name = _act(activation)
                ops.append(_Op("dense", (lambda x, k=kernel, b=bias, a=fn: a(x @ k + b)), act_name))
                last_dense_out = int(kernel.shape[1])
                summary.append(f"Dense({kernel.shape[0]}->{kernel.shape[1]}, {act_name})")
                continue

            if kind in {"Dropout", "GaussianNoise", "GaussianDropout"}:
                summary.append(f"{kind}(identity at inference)")
                continue

            if kind == "BatchNormalization":
                if name not in weights_root:
                    raise ModelLoadError(f"no weights found for layer '{name}'")
                g = weights_root[name]
                mean, var = _weight(g, "moving_mean"), _weight(g, "moving_variance")
                gamma = _weight(g, "gamma") if lc.get("scale", True) else None
                beta = _weight(g, "beta") if lc.get("center", True) else None
                axis = lc.get("axis", -1)
                axis = axis[0] if isinstance(axis, (list, tuple)) else axis
                if mean is None or var is None or axis not in (-1, 1):
                    raise ModelLoadError(f"unsupported BatchNormalization configuration in '{name}'")
                eps = float(lc.get("epsilon", 1e-3))
                gm = gamma if gamma is not None else np.ones_like(mean)
                bt = beta if beta is not None else np.zeros_like(mean)
                ops.append(_Op("bn", (lambda x, m=mean, v=var, g_=gm, b_=bt, e=eps: g_ * (x - m) / np.sqrt(v + e) + b_)))
                summary.append("BatchNormalization")
                continue

            if kind == "Activation":
                fn, act_name = _act(lc.get("activation", "linear"))
                ops.append(_Op("act", fn, act_name))
                summary.append(f"Activation({act_name})")
                continue

            if kind == "ReLU":
                if lc.get("max_value") is not None or lc.get("negative_slope", 0) != 0 or lc.get("threshold", 0) != 0:
                    raise ModelLoadError("only plain ReLU layers are supported")
                ops.append(_Op("act", lambda x: np.maximum(x, 0), "relu"))
                summary.append("ReLU")
                continue

            if kind == "Softmax":
                if lc.get("axis", -1) not in (-1, 1):
                    raise ModelLoadError("Softmax axis not supported")
                fn, act_name = _act("softmax")
                ops.append(_Op("act", fn, act_name))
                summary.append("Softmax")
                continue

        if input_dim is None or last_dense_out is None:
            raise ModelLoadError("could not determine model input/output sizes")

        final = next((o.final_activation for o in reversed(ops) if o.final_activation), None)
        if final != "softmax":
            raise ModelLoadError(f"final activation is '{final}', expected 'softmax' (single-label classifier)")
        return ops, input_dim, last_dense_out, summary


def _forward(ops: list[_Op], vec: np.ndarray) -> np.ndarray:
    x = vec.astype(np.float32).reshape(1, -1)
    for op in ops:
        x = op.fn(x)
    return x.reshape(-1)


# --------------------------------------------------------------------------
# Public runtime
# --------------------------------------------------------------------------
def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


class ModelRuntime:
    def __init__(self, ops, symptoms, classes, disease_map, summary, hashes):
        self._ops = ops
        self.symptoms: list[str] = symptoms
        self._index = {s: i for i, s in enumerate(symptoms)}
        self.classes: list[str] = classes
        self._map = disease_map["labels"]
        self._default_specialty = disease_map.get("default_specialty", "General Medicine")
        self._hidden = set(disease_map.get("hidden_symptoms", {}))
        self._symptom_labels = disease_map.get("symptom_labels", {})
        self.summary = summary
        self.hashes = hashes

    # ---- loading ---------------------------------------------------------
    @classmethod
    def load(cls, model_dir: Path, disease_map_path: Path) -> "ModelRuntime":
        model_dir = Path(model_dir)
        paths = {}
        for key, fname in ARTIFACTS.items():
            p = model_dir / fname
            if not p.is_file():
                raise ModelLoadError(f"missing model file: {fname} (see model/README.md)")
            if p.stat().st_size > _MAX_BYTES[key]:
                raise ModelLoadError(f"{fname} is unexpectedly large; refusing to load")
            paths[key] = p

        hashes = {fname: _sha256(paths[key]) for key, fname in ARTIFACTS.items()}
        sums = model_dir / "SHA256SUMS.txt"
        if sums.is_file():
            expected = {}
            for line in sums.read_text(encoding="utf-8").splitlines():
                parts = line.split()
                if len(parts) == 2:
                    expected[parts[1].lstrip("*")] = parts[0].lower()
            for fname, digest in hashes.items():
                if fname in expected and expected[fname] != digest:
                    raise ModelLoadError(f"checksum mismatch for {fname}; file changed since it was pinned")

        try:
            disease_map = json.loads(Path(disease_map_path).read_text(encoding="utf-8"))
            map_keys = set(disease_map["labels"])
        except Exception as exc:  # noqa: BLE001
            raise ModelLoadError(f"disease_map.json unreadable ({type(exc).__name__})") from exc

        try:
            symptoms = json.loads(paths["symptoms"].read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            raise ModelLoadError("symptoms_list.json is not valid JSON") from exc
        if not isinstance(symptoms, list) or not symptoms or not all(isinstance(s, str) for s in symptoms):
            raise ModelLoadError("symptoms_list.json must be a non-empty list of strings")
        if len(set(symptoms)) != len(symptoms):
            raise ModelLoadError("symptoms_list.json contains duplicate names")

        classes = load_label_classes(paths["labels"])
        norm = [normalise_label(c) for c in classes]
        if len(set(norm)) != len(norm):
            raise ModelLoadError("label encoder has duplicate labels after normalisation")
        if set(norm) != map_keys:
            missing = sorted(map_keys - set(norm))
            extra = sorted(set(norm) - map_keys)
            raise ModelLoadError(
                f"label set differs from data/disease_map.json (only in map: {missing[:5]}, only in model: {extra[:5]})"
            )

        ops, in_dim, out_dim, summary = read_keras_h5(paths["model"])
        if in_dim != len(symptoms):
            raise ModelLoadError(f"model expects {in_dim} inputs but symptoms_list.json has {len(symptoms)}")
        if out_dim != len(classes):
            raise ModelLoadError(f"model outputs {out_dim} classes but label encoder has {len(classes)}")

        probe = _forward(ops, np.zeros(in_dim, dtype=np.float32))
        if not np.all(np.isfinite(probe)) or abs(float(probe.sum()) - 1.0) > 1e-3:
            raise ModelLoadError("model output is not a valid probability vector")

        log.info("model loaded: %d inputs, %d classes, layers=%s", in_dim, out_dim, summary)
        return cls(ops, symptoms, classes, disease_map, summary, hashes)

    # ---- catalogue for the UI -------------------------------------------
    def catalogue(self) -> list[dict]:
        out = []
        for key in self.symptoms:
            if key in self._hidden:
                continue
            label = self._symptom_labels.get(key) or key.replace("_", " ").strip().capitalize()
            out.append({"key": key, "label": label})
        return sorted(out, key=lambda d: d["label"].lower())

    # ---- inference -------------------------------------------------------
    def assess(self, symptom_keys: list[str]) -> dict:
        if not isinstance(symptom_keys, list) or not all(isinstance(s, str) for s in symptom_keys):
            raise InvalidInput("symptoms must be a list of text values")
        unique = list(dict.fromkeys(symptom_keys))
        if not (MIN_SYMPTOMS <= len(unique) <= MAX_SYMPTOMS):
            raise InvalidInput(f"Select between {MIN_SYMPTOMS} and {MAX_SYMPTOMS} symptoms.")
        unknown = [s for s in unique if s not in self._index]
        if unknown:
            raise InvalidInput("One or more symptoms are not recognised.")  # never echo the values

        vec = np.zeros(len(self.symptoms), dtype=np.float32)
        for s in unique:
            vec[self._index[s]] = 1.0
        probs = _forward(self._ops, vec)

        order = np.argsort(-probs)[:TOP_K]
        predictions = []
        for i in order:
            entry = self._map[normalise_label(self.classes[i])]
            predictions.append(
                {
                    "label": self.classes[i].strip(),
                    "displayName": entry["display"],
                    "score": round(float(probs[i]), 4),
                    "specialty": entry["specialty"],
                }
            )

        top = predictions[0]["score"]
        strength = "weak" if top < WEAK_BELOW else ("strong" if top >= STRONG_FROM else "moderate")
        if strength == "weak":
            status, specialist, source = "inconclusive", self._default_specialty, "default"
        else:
            status, specialist, source = "ok", predictions[0]["specialty"], "model"

        return {
            "modelInfo": {
                "name": MODEL_NAME,
                "revision": MODEL_REVISION[:7],
                "experimental": True,
                "clinicallyValidated": False,
            },
            "status": status,
            "matchStrength": strength,
            "predictions": predictions,
            "recommendedSpecialist": specialist,
            "specialtySource": source,
            "scoreNote": "Scores are raw model outputs, not calibrated probabilities.",
        }
