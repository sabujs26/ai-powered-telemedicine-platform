# Symptom-pattern model - model card (for this project)

**Status: experimental. Not clinically validated. Not a diagnostic tool.**

## What is used
- Model: `NatiTs/Disease-Prediction-Model` on Hugging Face, pinned to commit `c87dc2f5…`.
- License: Apache-2.0, as stated in the repository README text (the YAML metadata block is empty).
  Keep attribution to the author if you redistribute the files.
- Files used: `disease_prediction_model.h5`, `label_encoder.pkl`, `symptoms_list.json`.
- File deliberately **not** used: `disease_info.json`. Its `medications`, `diet` and `workout`
  fields are misaligned between diseases (e.g. Heart attack lists varicose-vein treatments,
  Hyperthyroidism lists hypoglycaemia treatments). It also contains bare `NaN` (invalid JSON).

## What the model does here
- Input: a 132-position vector of 0/1 in the exact order of `symptoms_list.json`.
- Output: a score for each of 41 conditions (softmax). We show the top 3.
- The service shows scores as **"model score"**, never as a probability or confidence.

## Facts checked from the public model page
- 132 symptom names, 41 condition names. Some names are misspelled or contain stray spaces
  (`spotting_ urination`, `dischromic _patches`, `fluid_overload.1`); they are used verbatim as identifiers.
- The model card gives no training data, metrics, intended use or limitations.

## Inference (not stated by the model card - treat as unverified)
- The vocabulary and labels match a widely circulated public "disease prediction from symptoms"
  dataset that is commonly described as synthetic and highly repetitive. If so, headline accuracy
  figures for models trained on it say little about real patients.

## Design choices made by this project
- Two vocabulary items are never shown in the UI: `fluid_overload.1` (duplicate column artefact) and
  `extra_marital_contacts` (not a symptom; inappropriate to ask here). They are always sent as 0.
- At least 3 and at most 20 symptoms must be selected. Weak matches (top score < 0.40) are reported as
  "inconclusive" and the General Medicine suggestion is labelled as a default, not model output.
  These thresholds are product-safety heuristics, **not** statistically derived.
- Emergency warnings come from a separate rule list in the backend (`backend/src/lib/redFlags.js`)
  and do not depend on the model.
- The condition -> specialty table (`data/disease_map.json`) is a first draft and has **not** been
  reviewed by a clinician.
- Some condition names are alarming (e.g. HIV/AIDS, heart attack). They are shown only as "patterns
  these symptoms resemble", with disclaimers, never as a diagnosis.

## Not suitable for
Diagnosis, treatment decisions, triage of real patients, or anything beyond a university demonstration.
