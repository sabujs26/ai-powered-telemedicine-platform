import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { createAiRouter } from "../src/routes/aiRouter.js";

const GOOD_RESULT = {
  modelInfo: { name: "NatiTs/Disease-Prediction-Model", revision: "c87dc2f", experimental: true, clinicallyValidated: false },
  status: "ok",
  matchStrength: "strong",
  predictions: [
    { label: "Migraine", displayName: "Migraine", score: 0.91, specialty: "Neurology" },
    { label: "Allergy", displayName: "Allergy", score: 0.05, specialty: "General Medicine" },
    { label: "Common Cold", displayName: "Common cold", score: 0.02, specialty: "General Medicine" },
  ],
  recommendedSpecialist: "Neurology",
  specialtySource: "model",
  scoreNote: "Scores are raw model outputs, not calibrated probabilities.",
};
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function harness({ fetchImpl, role = "PATIENT", specialization = { id: "s1", name: "Neurology" }, patient = { id: "p1" }, createImpl, timeoutMs = 150 } = {}) {
  const created = [];
  const logs = [];
  const prisma = {
    patient: { findUnique: async () => patient },
    specialization: { findFirst: async () => specialization },
    symptomAssessment: { create: createImpl ?? (async ({ data }) => (created.push(data), { id: "a1" })) },
  };
  const requireAuth = (req, _res, next) => ((req.user = { id: "u1", role }), next());
  const requireRole = (...roles) => (req, res, next) => (roles.includes(req.user.role) ? next() : res.status(403).json({ error: "forbidden" }));
  const logger = { error: (m) => logs.push(String(m)), log: (m) => logs.push(String(m)) };
  const calls = [];
  const wrapped = async (url, init) => (calls.push({ url, init }), fetchImpl(url, init));
  const app = express();
  app.use(express.json());
  app.use("/api/ai", createAiRouter({ requireAuth, requireRole, prisma, fetchImpl: wrapped, aiServiceUrl: () => "http://ai.test", timeoutMs, logger }));
  return { app, created, logs, calls };
}
const never = (_u, { signal }) => new Promise((_, rej) => signal.addEventListener("abort", () => rej(Object.assign(new Error("x"), { name: "AbortError" }))));
const THREE = ["headache", "nausea", "dizziness"];

test("success: passes deduped symptoms to the AI, adds safety + disclaimer, stores the assessment", async () => {
  const h = harness({ fetchImpl: async () => json(200, GOOD_RESULT) });
  const res = await request(h.app).post("/api/ai/predict").send({ symptoms: [...THREE, "headache"] });
  assert.equal(res.status, 200);
  assert.equal(res.body.safety.urgent, false);
  assert.match(res.body.disclaimer, /not a diagnosis/);
  assert.equal(res.body.modelInfo.experimental, true);
  assert.equal(res.body.specialization.name, "Neurology");
  assert.equal(res.body.assessmentId, "a1");
  assert.deepEqual(JSON.parse(h.calls[0].init.body), { symptoms: THREE });
  assert.equal(h.created[0].emergencyFlag, false);
  assert.equal(h.created[0].predictedCondition, "Migraine");
  assert.equal(h.created[0].confidence, 0.91);
});

test("inconclusive result stores NO predicted condition or score", async () => {
  const weak = { ...GOOD_RESULT, status: "inconclusive", matchStrength: "weak", recommendedSpecialist: "General Medicine", specialtySource: "default" };
  const h = harness({ fetchImpl: async () => json(200, weak) });
  const res = await request(h.app).post("/api/ai/predict").send({ symptoms: THREE });
  assert.equal(res.status, 200);
  assert.equal(h.created[0].predictedCondition, null);
  assert.equal(h.created[0].confidence, null);
});

test("red flag + AI success: urgent warning is returned alongside the result and stored", async () => {
  const h = harness({ fetchImpl: async () => json(200, GOOD_RESULT) });
  const res = await request(h.app).post("/api/ai/predict").send({ symptoms: ["chest_pain", "cough", "fatigue"] });
  assert.equal(res.status, 200);
  assert.equal(res.body.safety.urgent, true);
  assert.deepEqual(res.body.safety.reasons, ["chest pain"]);
  assert.equal(h.created[0].emergencyFlag, true);
});

test("red flag + AI DOWN: still 503 but the urgent warning is delivered", async () => {
  const h = harness({ fetchImpl: async () => { throw new TypeError("fetch failed"); } });
  const res = await request(h.app).post("/api/ai/predict").send({ symptoms: ["chest_pain", "cough", "fatigue"] });
  assert.equal(res.status, 503);
  assert.equal(res.body.error, "AI_UNAVAILABLE");
  assert.equal(res.body.safety.urgent, true);
});

test("AI timeout -> 504 with safety, within the configured timeout", async () => {
  const h = harness({ fetchImpl: never, timeoutMs: 100 });
  const t0 = Date.now();
  const res = await request(h.app).post("/api/ai/predict").send({ symptoms: ["coma", "cough", "fatigue"] });
  assert.equal(res.status, 504);
  assert.equal(res.body.error, "AI_TIMEOUT");
  assert.equal(res.body.safety.urgent, true);
  assert.ok(Date.now() - t0 < 1500);
});

test("AI model unavailable (503) is surfaced as unavailable - never mocked", async () => {
  const h = harness({ fetchImpl: async () => json(503, { error: "MODEL_UNAVAILABLE" }) });
  const res = await request(h.app).post("/api/ai/predict").send({ symptoms: THREE });
  assert.equal(res.status, 503);
  assert.equal(res.body.predictions, undefined);
  assert.equal(h.created.length, 0);
});

test("AI 422 maps to 400 with the AI's safe message; unexpected status maps to 502; malformed body to 502", async () => {
  let r = await request(harness({ fetchImpl: async () => json(422, { error: "INVALID_INPUT", message: "One or more symptoms are not recognised." }) }).app).post("/api/ai/predict").send({ symptoms: THREE });
  assert.equal(r.status, 400);
  assert.equal(r.body.message, "One or more symptoms are not recognised.");
  r = await request(harness({ fetchImpl: async () => json(500, {}) }).app).post("/api/ai/predict").send({ symptoms: THREE });
  assert.equal(r.status, 502);
  r = await request(harness({ fetchImpl: async () => json(200, { nope: true }) }).app).post("/api/ai/predict").send({ symptoms: THREE });
  assert.equal(r.status, 502);
});

test("input validation: wrong types, bad characters, too long, too many, too few", async () => {
  const h = harness({ fetchImpl: async () => json(200, GOOD_RESULT) });
  const post = (body) => request(h.app).post("/api/ai/predict").send(body);
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ symptoms: "headache" })).status, 400);
  assert.equal((await post({ symptoms: [1, 2, 3] })).status, 400);
  assert.equal((await post({ symptoms: ["a", "b", "<script>"] })).status, 400);
  assert.equal((await post({ symptoms: ["x".repeat(61), "b", "c"] })).status, 400);
  assert.equal((await post({ symptoms: Array.from({ length: 21 }, (_, i) => `s${i}`) })).status, 400);
  const few = await post({ symptoms: ["headache", "nausea"] });
  assert.equal(few.status, 400);
  assert.equal(h.calls.length, 0); // none of the invalid requests reached the AI service
});

test("too few symptoms but a red flag: the urgent warning is still returned", async () => {
  const h = harness({ fetchImpl: async () => json(200, GOOD_RESULT) });
  const res = await request(h.app).post("/api/ai/predict").send({ symptoms: ["chest_pain"] });
  assert.equal(res.status, 400);
  assert.equal(res.body.safety.urgent, true);
  assert.equal(h.calls.length, 0);
});

test("symptom keys that really contain spaces / dots / brackets are accepted", async () => {
  const h = harness({ fetchImpl: async () => json(200, GOOD_RESULT) });
  const res = await request(h.app).post("/api/ai/predict").send({ symptoms: ["spotting_ urination", "toxic_look_(typhos)", "fluid_overload.1"] });
  assert.equal(res.status, 200);
});

test("only patients may call it", async () => {
  for (const role of ["DOCTOR", "ADMIN"]) {
    const h = harness({ fetchImpl: async () => json(200, GOOD_RESULT), role });
    assert.equal((await request(h.app).post("/api/ai/predict").send({ symptoms: THREE })).status, 403);
    assert.equal((await request(h.app).get("/api/ai/symptoms")).status, 403);
  }
});

test("a database failure never hides the result: still 200, assessmentId null", async () => {
  const h = harness({ fetchImpl: async () => json(200, GOOD_RESULT), createImpl: async () => { throw Object.assign(new Error("db down"), { name: "PrismaClientKnownRequestError" }); } });
  const res = await request(h.app).post("/api/ai/predict").send({ symptoms: THREE });
  assert.equal(res.status, 200);
  assert.equal(res.body.assessmentId, null);
});

test("specialty missing from the system -> specialization null (frontend must handle)", async () => {
  const h = harness({ fetchImpl: async () => json(200, GOOD_RESULT), specialization: null });
  const res = await request(h.app).post("/api/ai/predict").send({ symptoms: THREE });
  assert.equal(res.body.specialization, null);
  assert.equal(h.created[0].recommendedSpecialistId, null);
});

test("PRIVACY: symptom values never appear in server logs, even on failures", async () => {
  const secret = ["spotting_ urination", "chest_pain", "scurring"];
  for (const fetchImpl of [async () => { throw new TypeError("fetch failed"); }, async () => json(500, {}), async () => json(200, GOOD_RESULT), never]) {
    const h = harness({ fetchImpl, createImpl: async () => { throw new Error("db"); }, timeoutMs: 50 });
    await request(h.app).post("/api/ai/predict").send({ symptoms: secret });
    const all = h.logs.join("\n");
    for (const s of secret) assert.ok(!all.includes(s), `log leaked '${s}': ${all}`);
  }
});

test("GET /symptoms proxies the model's list, and reports unavailable honestly", async () => {
  const list = { symptoms: [{ key: "itching", label: "Itching" }], minSymptoms: 3, maxSymptoms: 20 };
  let res = await request(harness({ fetchImpl: async () => json(200, list) }).app).get("/api/ai/symptoms");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, list);
  res = await request(harness({ fetchImpl: async () => json(503, {}) }).app).get("/api/ai/symptoms");
  assert.equal(res.status, 503);
  res = await request(harness({ fetchImpl: async () => { throw new TypeError("x"); } }).app).get("/api/ai/symptoms");
  assert.equal(res.status, 503);
});
