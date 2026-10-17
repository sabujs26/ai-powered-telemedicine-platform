/**
 * Emergency "red flag" screening.
 *
 * This deliberately does NOT depend on the AI model: it runs on the symptoms
 * the patient selected, before the AI service is even called, so a patient
 * who ticks "chest pain" is warned even if the model is down, slow, wrong,
 * or the selection is too small for the model to accept.
 *
 * The list is a conservative set of commonly taught emergency warning signs
 * (heart/breathing/stroke/consciousness/bleeding). It is NOT a clinical
 * triage protocol and is not exhaustive - have a medical advisor review it.
 * Keys are the exact symptom identifiers from the model's symptoms_list.json
 * (checked by backend/tests/redFlags.test.js against a copy of that file).
 */

export const URGENT_SINGLE = {
  chest_pain: "chest pain",
  breathlessness: "difficulty breathing",
  coma: "loss of consciousness",
  altered_sensorium: "confusion or altered consciousness",
  slurred_speech: "slurred speech",
  weakness_of_one_body_side: "weakness on one side of the body",
  blood_in_sputum: "coughing up blood",
  stomach_bleeding: "bleeding from the stomach",
  bloody_stool: "blood in the stool",
  acute_liver_failure: "signs of acute liver failure",
};

export const URGENT_COMBOS = [{ all: ["stiff_neck", "high_fever"], reason: "high fever together with a stiff neck" }];

export const URGENT_GUIDANCE =
  "Your selection includes warning signs that can be serious. Seek emergency medical care now: " +
  "call 999 or go to the nearest hospital. Do not wait for an online appointment.";

export const GENERAL_GUIDANCE =
  "This tool cannot rule out an emergency. If you feel seriously unwell, or your symptoms are getting " +
  "worse quickly, call 999 or go to the nearest hospital.";

/** @param {string[]} symptoms exact symptom keys. @returns {{urgent:boolean, reasons:string[], guidance:string}} */
export function evaluateRedFlags(symptoms) {
  const selected = new Set(Array.isArray(symptoms) ? symptoms.filter((s) => typeof s === "string") : []);
  const reasons = [];

  for (const [key, reason] of Object.entries(URGENT_SINGLE)) {
    if (selected.has(key)) reasons.push(reason);
  }
  for (const combo of URGENT_COMBOS) {
    if (combo.all.every((k) => selected.has(k))) reasons.push(combo.reason);
  }

  const urgent = reasons.length > 0;
  return { urgent, reasons, guidance: urgent ? URGENT_GUIDANCE : GENERAL_GUIDANCE };
}
