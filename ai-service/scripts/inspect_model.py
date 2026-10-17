"""
Prints verified facts about the downloaded model files and says whether the service can use them.
Nothing here contains patient data, so the output is safe to paste into a chat or a bug report.

Run from the ai-service folder (virtual environment active):
    python scripts\\inspect_model.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import model_runtime as mr  # noqa: E402

MODEL_DIR = ROOT / "model"
MAP_PATH = ROOT / "data" / "disease_map.json"


def section(title):
    print(f"\n=== {title}")


section("Files")
for key, name in mr.ARTIFACTS.items():
    p = MODEL_DIR / name
    print(f"  {name:32s} {'%d bytes' % p.stat().st_size if p.is_file() else 'MISSING'}")

section("Symptom vocabulary (symptoms_list.json)")
try:
    vocab = json.loads((MODEL_DIR / mr.ARTIFACTS["symptoms"]).read_text(encoding="utf-8"))
    print(f"  entries: {len(vocab)}  unique: {len(set(vocab))}")
except Exception as exc:  # noqa: BLE001
    vocab = None
    print(f"  UNREADABLE: {type(exc).__name__}")

section("Label encoder (label_encoder.pkl, read with the restricted unpickler)")
classes = None
try:
    classes = mr.load_label_classes(MODEL_DIR / mr.ARTIFACTS["labels"])
    print(f"  classes: {len(classes)}")
    disease_map = json.loads(MAP_PATH.read_text(encoding="utf-8"))["labels"]
    norm = {mr.normalise_label(c) for c in classes}
    print(f"  only in data/disease_map.json : {sorted(set(disease_map) - norm)}")
    print(f"  only in the model's encoder   : {sorted(norm - set(disease_map))}")
except mr.ModelLoadError as exc:
    print(f"  REJECTED: {exc}")

section("Network (model_config inside the .h5)")
try:
    _ops, in_dim, out_dim, summary = mr.read_keras_h5(MODEL_DIR / mr.ARTIFACTS["model"])
    print(f"  input size: {in_dim}   output size: {out_dim}")
    for line in summary:
        print(f"    - {line}")
except mr.ModelLoadError as exc:
    print(f"  NOT SUPPORTED: {exc}")

section("Verdict")
try:
    rt = mr.ModelRuntime.load(MODEL_DIR, MAP_PATH)
    print("  READY - the service can load this model.")
    for name, digest in rt.hashes.items():
        print(f"  sha256 {digest}  {name}")
except mr.ModelLoadError as exc:
    print(f"  NOT READY - {exc}")
    sys.exit(1)
