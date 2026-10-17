"""
TEST-ONLY synthetic model. It is a tiny random network written in the same
HDF5 layout Keras uses, so the runtime's parser is exercised. It makes NO
medical claims and is never used by the running application.
"""
import json
import pickle
from pathlib import Path

import h5py
import numpy as np
from sklearn.preprocessing import LabelEncoder

SYMPTOMS = [f"sym_{i}" for i in range(10)] + ["hidden_one"]
LABELS = ["Alpha disease", "Beta disease ", "Gamma disease"]  # trailing space on purpose (like 'Diabetes ')
DISEASE_MAP = {
    "labels": {
        "alpha disease": {"display": "Alpha", "specialty": "Neurology"},
        "beta disease": {"display": "Beta", "specialty": "Dermatology"},
        "gamma disease": {"display": "Gamma", "specialty": "Cardiology"},
    },
    "default_specialty": "General Medicine",
    "hidden_symptoms": {"hidden_one": "test"},
    "symptom_labels": {"sym_0": "Zero symptom"},
}


def reference_forward(weights, x):
    """Independent numpy implementation used to check the runtime."""
    h = np.maximum(x @ weights["k1"] + weights["b1"], 0)
    h = weights["gamma"] * (h - weights["mean"]) / np.sqrt(weights["var"] + 1e-3) + weights["beta"]
    z = h @ weights["k2"] + weights["b2"]
    z = z - z.max()
    e = np.exp(z)
    return e / e.sum()


def make_weights(n_in=11, hidden=8, n_out=3, seed=7):
    r = np.random.default_rng(seed)
    f = lambda *s: r.normal(0, 1.2, s).astype(np.float32)  # noqa: E731
    return {
        "k1": f(n_in, hidden), "b1": f(hidden), "gamma": np.abs(f(hidden)) + 0.5, "beta": f(hidden),
        "mean": f(hidden) * 0.1, "var": np.abs(f(hidden)) + 0.5, "k2": f(hidden, n_out), "b2": f(n_out),
    }


def _layer(cls, **cfg):
    return {"class_name": cls, "config": cfg}


def write_keras_h5(path: Path, weights, *, final_activation="softmax", extra_layer=None):
    layers = [
        _layer("InputLayer", name="input_1", batch_input_shape=[None, weights["k1"].shape[0]]),
        _layer("Dense", name="dense", activation="relu", use_bias=True),
        _layer("Dropout", name="dropout", rate=0.3),
        _layer("BatchNormalization", name="batch_normalization", axis=[1], epsilon=0.001, center=True, scale=True),
        _layer("Dense", name="dense_1", activation=final_activation, use_bias=True),
    ]
    if extra_layer:
        layers.insert(2, extra_layer)
    cfg = {"class_name": "Sequential", "config": {"name": "sequential", "layers": layers}}
    with h5py.File(path, "w") as f:
        f.attrs["model_config"] = json.dumps(cfg)
        f.attrs["keras_version"] = "2.15.0"
        f.attrs["backend"] = "tensorflow"
        mw = f.create_group("model_weights")
        mw.attrs["layer_names"] = np.array([b"dense", b"batch_normalization", b"dense_1"])

        def put(layer, items):
            g = mw.create_group(layer)
            g.attrs["weight_names"] = np.array([f"{layer}/{n}".encode() for n, _ in items])
            sub = g.create_group(layer)
            for n, arr in items:
                sub.create_dataset(n, data=arr)

        put("dense", [("kernel:0", weights["k1"]), ("bias:0", weights["b1"])])
        put("batch_normalization", [("gamma:0", weights["gamma"]), ("beta:0", weights["beta"]),
                                    ("moving_mean:0", weights["mean"]), ("moving_variance:0", weights["var"])])
        put("dense_1", [("kernel:0", weights["k2"]), ("bias:0", weights["b2"])])


def build_model_dir(directory: Path, *, labels=LABELS, symptoms=SYMPTOMS, weights=None, **h5_kwargs):
    directory.mkdir(parents=True, exist_ok=True)
    weights = weights or make_weights(n_in=len(symptoms), n_out=len(labels))
    write_keras_h5(directory / "disease_prediction_model.h5", weights, **h5_kwargs)
    (directory / "symptoms_list.json").write_text(json.dumps(symptoms), encoding="utf-8")
    le = LabelEncoder().fit(labels)
    with open(directory / "label_encoder.pkl", "wb") as fh:
        pickle.dump(le, fh)
    (directory / "disease_map.json").write_text(json.dumps(DISEASE_MAP), encoding="utf-8")
    return weights
