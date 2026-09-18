import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

// POST /api/appointments — FR-12: book a slot. Created as PENDING_PAYMENT;
// only the Stripe webhook (see payments.js) is allowed to confirm it (NFR-04).
router.post("/", requireAuth, requireRole("PATIENT"), async (req, res) => {
  const { doctorId, slotId } = req.body;

  const slot = await prisma.doctorAvailability.findUnique({ where: { id: slotId } });
  if (!slot || slot.isBooked) {
    return res.status(409).json({ error: "Slot is no longer available" });
  }

  const patient = await prisma.patient.findUnique({ where: { userId: req.user.id } });

  const appointment = await prisma.$transaction(async (tx) => {
    await tx.doctorAvailability.update({ where: { id: slotId }, data: { isBooked: true } });
    return tx.appointment.create({
      data: { patientId: patient.id, doctorId, slotId, status: "PENDING_PAYMENT" },
    });
  });

  res.status(201).json(appointment);
});

// GET /api/appointments — list current user's own appointments (any role sees their own).
router.get("/", requireAuth, async (req, res) => {
  const where =
    req.user.role === "PATIENT"
      ? { patient: { userId: req.user.id } }
      : req.user.role === "DOCTOR"
      ? { doctor: { userId: req.user.id } }
      : {}; // ADMIN sees all

  const appointments = await prisma.appointment.findMany({
    where,
    include: { doctor: true, patient: true, slot: true, payment: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(appointments);
});

// PATCH /api/appointments/:id/cancel — FR-13, decision #6 (Section 18):
// free cancellation >=6h before the slot start, else requires Admin override.
router.patch("/:id/cancel", requireAuth, async (req, res) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: req.params.id },
    include: { slot: true },
  });
  if (!appointment) return res.status(404).json({ error: "Appointment not found" });

  const hoursUntilStart = (new Date(appointment.slot.startTime) - new Date()) / 36e5;
  if (hoursUntilStart < 6 && req.user.role !== "ADMIN") {
    return res.status(409).json({
      error: "Cancellation window has passed (must cancel at least 6 hours in advance). Contact an admin for exceptions.",
    });
  }

  await prisma.$transaction([
    prisma.appointment.update({ where: { id: appointment.id }, data: { status: "CANCELLED" } }),
    prisma.doctorAvailability.update({ where: { id: appointment.slotId }, data: { isBooked: false } }),
  ]);

  res.json({ status: "CANCELLED" });
});

export default router;
