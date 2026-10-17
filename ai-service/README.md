# AI service (experimental symptom-pattern model)

Local FastAPI service wrapping `NatiTs/Disease-Prediction-Model`. No paid API, no API key.
Read `MODEL_CARD.md` first: this is **not** a diagnostic tool.

## Windows PowerShell - first time (from this folder)
```powershell
py -3.12 -m venv .venv            # Python 3.10-3.13 all work; use `python -m venv .venv` if `py` is missing
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass     # only for this window
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
powershell -ExecutionPolicy Bypass -File .\scripts\download_model.ps1
python scripts\inspect_model.py   # must finish with: READY
```

## Run
```powershell
.\.venv\Scripts\Activate.ps1
uvicorn main:app --host 127.0.0.1 --port 8000
```
Keep `--host 127.0.0.1`: only the Express backend should reach this service. Check
http://127.0.0.1:8000/health - `"status": "ok"` means the model loaded; `"degraded"` explains why not
(the service then answers 503 and never invents predictions).

## Tests
```powershell
pip install -r requirements-dev.txt
python -m pytest -q
```
The tests use a tiny synthetic stand-in model; they do not need the real files.
`tests/test_real_model_optional.py` runs automatically once the real files are present.

## Endpoints (called by the backend, not by the browser)
| Method | Path | Notes |
|---|---|---|
| GET | `/health` | status, reason if degraded, layer summary, file hashes |
| GET | `/symptoms` | selectable symptoms (`key` = exact model identifier, `label` = display text) |
| POST | `/predict` | body `{"symptoms": ["itching", ...]}` (3-20 exact keys) |
