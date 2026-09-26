import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  dayOfWeekForDate,
  isWithinBookingWindow,
  generateSlotsForDate,
  DEFAULT_SLOT_DURATION_MINUTES,
} from "../lib/scheduling.js";

const router = Router();

/**
 * POST /api/appointments — Step 7/9/11: books a REAL appointment slot.
 * FR-12: book a slot. Created as PENDING_PAYMENT; only the Stripe webhook
 * (see payments.js) is allowed to confirm it (NFR-04) — this increment
 * does not pretend a payment happened just because a booking succeeded.
 *
 * The frontend sends back the exact `scheduledAt` ISO string it received
 * from GET /api/doctors/:id/slots — but that value is NEVER trusted at face
 * value. It is re-derived and re-validated here: we recompute the doctor's
 * real slots for that date server-side and confirm the requested instant is
 * still among them. This defends against a tampered/stale client value and
 * is also where "the doctor became unavailable/unapproved since the patient
 * loaded the page" gets caught.
 *
 * Double booking (Step 9): the database has a unique constraint on
 * (doctorId, scheduledAt). Even with the pre-check above, two concurrent
 * requests can both pass it before either commits — the DB constraint is
 * the actual race-condition guard; a unique-violation on insert is caught
 * below and turned into a clear error.
 */
router.post("/", requireAuth, requireRole("PATIENT"), async (req, res) => {
  const { doctorId, scheduledAt } = req.body;

  if (!doctorId || !scheduledAt) {
    return res.status(400).json({ error: "doctorId and scheduledAt are required" });
  }

  const requestedInstant = new Date(scheduledAt);
  if (Number.isNaN(requestedInstant.getTime())) {
    return res.status(400).json({ error: "scheduledAt must be a valid ISO date-time" });
  }
  if (requestedInstant <= new Date()) {
    return res.status(400).json({ error: "That time has already passed" });
  }

  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor || doctor.approvalStatus !== "APPROVED") {
    return res.status(404).json({ error: "Doctor not found or not currently accepting bookings" });
  }

  // Re-derive the Dhaka calendar date from the requested UTC instant, purely
  // to re-run the same slot generation the patient's UI used — never trust
  // a client-supplied "date" separately from the instant itself.
  const dhakaShifted = new Date(requestedInstant.getTime() + 6 * 60 * 60 * 1000);
  const dateStr = `${dhakaShifted.getUTCFullYear()}-${String(dhakaShifted.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dhakaShifted.getUTCDate()
  ).padStart(2, "0")}`;

  if (!isWithinBookingWindow(dateStr)) {
    return res.status(400).json({ error: "That date is outside the allowed booking window" });
  }

  const availabilityRows = await prisma.doctorAvailability.findMany({
    where: { doctorId: doctor.id, active: true },
  });
  const existingAppointments = await prisma.appointment.findMany({
    where: { doctorId: doctor.id, status: { not: "CANCELLED" } },
    select: { scheduledAt: true },
  });
  const bookedInstantsIso = new Set(existingAppointments.map((a) => a.scheduledAt.toISOString()));

  const validSlots = generateSlotsForDate(
    availabilityRows,
    dateStr,
    bookedInstantsIso,
    DEFAULT_SLOT_DURATION_MINUTES
  );
  const matchesAValidSlot = validSlots.some((s) => s.datetime === requestedInstant.toISOString());

  if (!matchesAValidSlot) {
    return res.status(409).json({ error: "This appointment slot is no longer available." });
  }

  const patient = await prisma.patient.findUnique({ where: { userId: req.user.id } });

  try {
    const appointment = await prisma.appointment.create({
      data: {
        patientId: patient.id,
        doctorId: doctor.id,
        scheduledAt: requestedInstant,
        durationMinutes: DEFAULT_SLOT_DURATION_MINUTES,
        status: "PENDING_PAYMENT",
      },
    });
    res.status(201).json(appointment);
  } catch (err) {
    // Prisma P2002 = unique constraint violation on (doctorId, scheduledAt) —
    // another request booked this exact instant in the tiny window between
    // our validity check above and this insert.
    if (err.code === "P2002") {
      return res.status(409).json({ error: "This appointment slot is no longer available." });
    }
    throw err;
  }
});

// GET /api/appointments — list current user's own appointments (any role sees their own).
router.get("/", requireAuth, async (req, res) => {
  const where =
    req.user.role === "PATIENT"
      ? { patient: { userId: req.user.id } }
      : req.user.role === "DOCTOR"
      ? { doctor: { userId: req.user.id } } // Step 14: only ever this doctor's own appointments
      : {}; // ADMIN sees all

  const appointments = await prisma.appointment.findMany({
    where,
    include: {
      doctor: { include: { specialization: true } },
      patient: true,
      payment: true,
    },
    orderBy: { scheduledAt: "asc" },
  });
  res.json(appointments);
});

// PATCH /api/appointments/:id/cancel — FR-13, decision #6 (Section 18):
// free cancellation >=6h before the appointment, else requires Admin override.
// Cancelling simply changes status — the slot becomes bookable again
// automatically, since slot generation excludes CANCELLED appointments.
router.patch("/:id/cancel", requireAuth, async (req, res) => {
  const appointment = await prisma.appointment.findUnique({ where: { id: req.params.id } });
  if (!appointment) return res.status(404).json({ error: "Appointment not found" });

  const hoursUntilStart = (appointment.scheduledAt.getTime() - Date.now()) / 36e5;
  if (hoursUntilStart < 6 && req.user.role !== "ADMIN") {
    return res.status(409).json({
      error: "Cancellation window has passed (must cancel at least 6 hours in advance). Contact an admin for exceptions.",
    });
  }

  const updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: "CANCELLED" },
  });
  res.json(updated);
});

export default router;
