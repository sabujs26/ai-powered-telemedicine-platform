# Model files

These files are **not** committed (see `../.gitignore`). Download them once:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\download_model.ps1
python scripts\inspect_model.py      # must end with "READY"
```

| File | Purpose |
|---|---|
| `disease_prediction_model.h5` | Keras network weights (read with h5py + numpy; TensorFlow is NOT needed) |
| `label_encoder.pkl` | Class names in output order (loaded with a restricted unpickler) |
| `symptoms_list.json` | The 132 input features, in the exact order the model expects |
| `SHA256SUMS.txt` | Created by the download script; the service refuses to start if a file changes |

Source: <https://huggingface.co/NatiTs/Disease-Prediction-Model>, pinned to commit
`c87dc2f5f8f96cfec3580fa4b739e8044398ad15`. Apache-2.0 (as stated in the model's README).
If you redistribute these files, keep the license and attribution - see `../MODEL_CARD.md`.
