import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

/**
 * POST /api/ai/predict — FR-06/07/08, AI-01..AI-12.
 *
 * This backend never contains ML logic itself — it forwards the symptom
 * payload to the separate Python AI service (see /ai-service) and stores
 * the result as a SymptomAssessment. Today that service returns a stub
 * response; when the trained model is plugged in there (Section 18 /
 * roadmap step 9), NOTHING in this file needs to change.
 */
router.post("/predict", requireAuth, requireRole("PATIENT"), async (req, res) => {
  const { symptoms } = req.body;
  if (!Array.isArray(symptoms) || symptoms.length === 0) {
    return res.status(400).json({ error: "symptoms must be a non-empty array" });
  }

  let aiResponse;
  try {
    const aiRes = await fetch(`${process.env.AI_SERVICE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symptoms }),
    });
    if (!aiRes.ok) throw new Error(`AI service responded ${aiRes.status}`);
    aiResponse = await aiRes.json();
  } catch (err) {
    return res.status(502).json({ error: "AI service unavailable", detail: err.message });
  }

  const patient = await prisma.patient.findUnique({ where: { userId: req.user.id } });

  // Resolve the AI service's specialist name to a Specialization row, if it exists.
  const specialization = await prisma.specialization.findFirst({
    where: { name: aiResponse.recommendedSpecialist },
  });

  const assessment = await prisma.symptomAssessment.create({
    data: {
      patientId: patient.id,
      symptomsData: symptoms,
      predictedCondition: aiResponse.predictions?.[0]?.condition ?? null,
      confidence: aiResponse.predictions?.[0]?.confidence ?? null,
      recommendedSpecialistId: specialization?.id ?? null,
      emergencyFlag: Boolean(aiResponse.emergencyFlag),
    },
  });

  res.status(201).json({ ...aiResponse, assessmentId: assessment.id });
});

export default router;
