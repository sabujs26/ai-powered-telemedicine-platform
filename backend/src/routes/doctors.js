import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

// GET /api/doctors — FR-09: search/list doctors, optionally filtered by specialization.
router.get("/", requireAuth, async (req, res) => {
  const { specializationId } = req.query;
  const doctors = await prisma.doctor.findMany({
    where: {
      approvalStatus: "APPROVED",
      ...(specializationId ? { specializationId } : {}),
    },
    include: { specialization: true },
  });
  res.json(doctors);
});

// GET /api/doctors/:id — FR-10: doctor profile detail.
router.get("/:id", requireAuth, async (req, res) => {
  const doctor = await prisma.doctor.findUnique({
    where: { id: req.params.id },
    include: { specialization: true, availability: { where: { isBooked: false } } },
  });
  if (!doctor) return res.status(404).json({ error: "Doctor not found" });
  res.json(doctor);
});

// GET /api/doctors/:id/availability — FR-11 read side.
router.get("/:id/availability", requireAuth, async (req, res) => {
  const slots = await prisma.doctorAvailability.findMany({
    where: { doctorId: req.params.id, isBooked: false },
    orderBy: { startTime: "asc" },
  });
  res.json(slots);
});

// POST /api/doctors/:id/availability — FR-11: doctor creates their own slot.
router.post("/:id/availability", requireAuth, requireRole("DOCTOR"), async (req, res) => {
  const { startTime, endTime } = req.body;
  if (!startTime || !endTime) {
    return res.status(400).json({ error: "startTime and endTime are required" });
  }
  const slot = await prisma.doctorAvailability.create({
    data: { doctorId: req.params.id, startTime, endTime },
  });
  res.status(201).json(slot);
});

// POST /api/doctors — Admin-only Doctor account creation (decision #2, Section 18).
// In practice this runs AFTER the Doctor's Firebase Auth account is created
// (e.g. by an Admin invite flow) — this endpoint links that Firebase user to
// a new Doctor profile in our database.
router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { firebaseUid, email, name, specializationId, consultationFee } = req.body;
  if (!firebaseUid || !email || !name || !specializationId) {
    return res.status(400).json({ error: "firebaseUid, email, name, specializationId are required" });
  }
  const user = await prisma.user.create({
    data: {
      email,
      firebaseUid,
      role: "DOCTOR",
      doctor: {
        create: { name, specializationId, consultationFee, approvalStatus: "APPROVED" },
      },
    },
    include: { doctor: true },
  });
  res.status(201).json(user);
});

// PATCH /api/doctors/:id/approve — FR-22: Admin approves/rejects/disables a doctor.
router.patch("/:id/approve", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { status } = req.body; // "APPROVED" | "REJECTED" | "DISABLED"

  if (status === "DISABLED") {
    // Decision #10 (Section 18): block disabling if upcoming confirmed appointments exist.
    const upcoming = await prisma.appointment.count({
      where: { doctorId: req.params.id, status: "CONFIRMED" },
    });
    if (upcoming > 0) {
      return res.status(409).json({
        error: `Cannot disable: doctor has ${upcoming} upcoming confirmed appointment(s). Reassign or cancel them first.`,
      });
    }
  }

  const doctor = await prisma.doctor.update({
    where: { id: req.params.id },
    data: { approvalStatus: status },
  });
  res.json(doctor);
});

export default router;
