import { Router } from "express";
import prisma from "../lib/prisma.js";

const router = Router();

/**
 * GET /api/specializations — intentionally PUBLIC (no requireAuth).
 * Added for this increment: the doctor self-registration form needs to let
 * an unauthenticated applicant pick a specialization. Returns only
 * non-sensitive reference data (id + name), nothing tied to a specific user.
 */
router.get("/", async (req, res) => {
  const specializations = await prisma.specialization.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  res.json(specializations);
});

export default router;
