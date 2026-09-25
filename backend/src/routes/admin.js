import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

// All routes below require a valid JWT AND role === ADMIN — enforced on the
// backend regardless of what the frontend shows/hides.
router.use(requireAuth, requireRole("ADMIN"));

// GET /api/admin/doctors/pending — list doctor applications awaiting review.
router.get("/doctors/pending", async (req, res) => {
  const pending = await prisma.doctor.findMany({
    where: { approvalStatus: "PENDING" },
    include: { user: { select: { email: true } }, specialization: true },
    orderBy: { id: "asc" },
  });
  res.json(pending);
});

// PATCH /api/admin/doctors/:id/approve
router.patch("/doctors/:id/approve", async (req, res) => {
  const doctor = await prisma.doctor.findUnique({ where: { id: req.params.id } });
  if (!doctor) return res.status(404).json({ error: "Doctor application not found" });

  const updated = await prisma.doctor.update({
    where: { id: req.params.id },
    data: { approvalStatus: "APPROVED" },
  });
  res.json(updated);
});

// PATCH /api/admin/doctors/:id/reject
router.patch("/doctors/:id/reject", async (req, res) => {
  const doctor = await prisma.doctor.findUnique({ where: { id: req.params.id } });
  if (!doctor) return res.status(404).json({ error: "Doctor application not found" });

  const updated = await prisma.doctor.update({
    where: { id: req.params.id },
    data: { approvalStatus: "REJECTED" },
  });
  res.json(updated);
});

export default router;
