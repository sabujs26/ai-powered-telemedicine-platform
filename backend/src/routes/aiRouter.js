import { Router } from "express";
import { evaluateRedFlags } from "../lib/redFlags.js";

export const MIN_SYMPTOMS = 3;
export const MAX_SYMPTOMS = 20;
// Symptom keys are opaque identifiers from the model's vocabulary. A few contain spaces, dots or
// brackets (e.g. "toxic_look_(typhos)", "fluid_overload.1"), so those characters are allowed.
const SYMPTOM_KEY_RE = /^[A-Za-z0-9_ ().-]{1,60}$/;

export const DISCLAIMER =
  "Experimental symptom-pattern tool. It is not a diagnosis, has not been clinically validated, and " +
  "does not replace a qualified doctor. Never delay or ignore medical advice because of this result.";

/**
 * Factory so the router can be tested without Prisma, a database, or a running AI service.
 * Production wiring lives in ./ai.js.
 */
export function createAiRouter({
  requireAuth,
  requireRole,
  prisma,
  fetchImpl = fetch,
  aiServiceUrl = () => process.env.AI_SERVICE_URL,
  timeoutMs = 8000,
  logger = console,
}) {
  const router = Router();

  // NOTE: nothing below logs symptom values. Errors are logged by name only.
  async function callAi(path, init) {
    const base = aiServiceUrl();
    if (!base) throw Object.assign(new Error("AI_SERVICE_URL not configured"), { code: "NOT_CONFIGURED" });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(`${base}${path}`, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  function unavailable(res, err, safety) {
    const timedOut = err?.name === "AbortError";
    return res.status(timedOut ? 504 : 503).json({
      error: timedOut ? "AI_TIMEOUT" : "AI_UNAVAILABLE",
      message: timedOut
        ? "The symptom assessment took too long. Please try again."
        : "The symptom assessment service is not available right now.",
      ...(safety ? { safety } : {}),
    });
  }

  // GET /api/ai/symptoms - the selectable symptom list, straight from the model's own vocabulary.
  router.get("/symptoms", requireAuth, requireRole("PATIENT"), async (req, res) => {
    try {
      const aiRes = await callAi("/symptoms", { method: "GET" });
      if (!aiRes.ok) return unavailable(res, null, null);
      res.json(await aiRes.json());
    } catch (err) {
      logger.error(`[ai] symptoms fetch failed: ${err?.name}`);
      return unavailable(res, err, null);
    }
  });

  // POST /api/ai/predict
  router.post("/predict", requireAuth, requireRole("PATIENT"), async (req, res) => {
    try {
      const raw = req.body?.symptoms;
      if (!Array.isArray(raw) || raw.some((s) => typeof s !== "string" || !SYMPTOM_KEY_RE.test(s))) {
        return res.status(400).json({ error: "INVALID_INPUT", message: "symptoms must be a list of valid symptom identifiers." });
      }
      const symptoms = [...new Set(raw)];
      if (symptoms.length > MAX_SYMPTOMS) {
        return res.status(400).json({ error: "INVALID_INPUT", message: `Select at most ${MAX_SYMPTOMS} symptoms.` });
      }

      // 1) Safety screening FIRST and independent of the model.
      const safety = evaluateRedFlags(symptoms);

      if (symptoms.length < MIN_SYMPTOMS) {
        return res.status(400).json({
          error: "INVALID_INPUT",
          message: `Select at least ${MIN_SYMPTOMS} symptoms for a pattern match.`,
          safety,
        });
      }

      // 2) Ask the local model service.
      let aiRes;
      try {
        aiRes = await callAi("/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symptoms }),
        });
      } catch (err) {
        logger.error(`[ai] predict call failed: ${err?.name}`);
        return unavailable(res, err, safety);
      }

      if (aiRes.status === 422) {
        let message = "The selected symptoms could not be assessed.";
        try {
          const b = await aiRes.json();
          if (typeof b?.message === "string" && b.message.length <= 200) message = b.message;
        } catch {
          /* keep generic message */
        }
        return res.status(400).json({ error: "INVALID_INPUT", message, safety });
      }
      if (aiRes.status === 503) return unavailable(res, null, safety);
      if (!aiRes.ok) {
        logger.error(`[ai] unexpected status from AI service: ${aiRes.status}`);
        return res.status(502).json({ error: "AI_ERROR", message: "The assessment could not be completed.", safety });
      }

      let result;
      try {
        result = await aiRes.json();
      } catch {
        result = null;
      }
      if (!result || !Array.isArray(result.predictions) || typeof result.status !== "string") {
        logger.error("[ai] malformed response from AI service");
        return res.status(502).json({ error: "AI_ERROR", message: "The assessment could not be completed.", safety });
      }

      // 3) Map the suggested specialty onto a real Specialization row, if the system has it.
      let specialization = null;
      try {
        specialization = await prisma.specialization.findFirst({
          where: { name: { equals: String(result.recommendedSpecialist ?? ""), mode: "insensitive" } },
          select: { id: true, name: true },
        });
      } catch (err) {
        logger.error(`[ai] specialization lookup failed: ${err?.name}`);
      }

      // 4) Persist (best effort - a storage failure must never hide the result or the safety warning).
      let assessmentId = null;
      try {
        const patient = await prisma.patient.findUnique({ where: { userId: req.user.id } });
        if (patient) {
          const top = result.predictions[0];
          const conclusive = result.status === "ok" && top;
          const saved = await prisma.symptomAssessment.create({
            data: {
              patientId: patient.id,
              symptomsData: { symptoms, model: result.modelInfo ?? null, experimental: true },
              predictedCondition: conclusive ? top.label : null,
              confidence: conclusive ? top.score : null, // raw, uncalibrated model score
              recommendedSpecialistId: specialization?.id ?? null,
              emergencyFlag: safety.urgent,
            },
          });
          assessmentId = saved.id;
        }
      } catch (err) {
        logger.error(`[ai] could not save assessment: ${err?.name}`);
      }

      return res.json({
        ...result,
        safety,
        disclaimer: DISCLAIMER,
        specialization, // null when the system has no matching specialty yet
        assessmentId,
      });
    } catch (err) {
      logger.error(`[ai] unexpected error: ${err?.name}`);
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Something went wrong." });
    }
  });

  return router;
}
