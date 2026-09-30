import { Router } from "express";
import crypto from "crypto";
import prisma from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { hashPassword } from "../lib/authTokens.js";
import {
  isValidTimeStr,
  timeRangesOverlap,
  isValidDateStr,
  isWithinBookingWindow,
  generateSlotsForDate,
  DEFAULT_SLOT_DURATION_MINUTES,
} from "../lib/scheduling.js";

const router = Router();

// ---------------------------------------------------------------------------
// Routes with a literal first path segment ("/me", "/me/availability", ...)
// are registered BEFORE any "/:id"-shaped routes below. Express matches
// routes in registration order for a given path shape, so this ordering is
// what makes "/me/availability" resolve correctly instead of being
// swallowed by "/:id/availability".
// ---------------------------------------------------------------------------

// GET /api/doctors/me — the logged-in doctor's own profile (specialization,
// fee, application info). Needed for the Doctor Dashboard (Step 8).
router.get("/me", requireAuth, requireRole("DOCTOR"), async (req, res) => {
  const doctor = await prisma.doctor.findUnique({
    where: { userId: req.user.id },
    include: { specialization: true, clinic: true },
  });
  if (!doctor) return res.status(404).json({ error: "Doctor profile not found" });
  res.json(doctor);
});

const EDITABLE_DOCTOR_FIELDS = ["consultationFee", "contactInfo", "experience", "bio", "languages", "consultationModes"];
const PROTECTED_DOCTOR_FIELDS = ["qualification", "registrationNumber", "specializationId", "specialization"];
const VALID_CONSULTATION_MODES = ["ONLINE", "PHYSICAL", "BOTH"];

/**
 * PATCH /api/doctors/me — Step 5: doctor edits their OWN normal profile
 * fields (bio, experience, fee, contact info, languages, consultation
 * modes, clinic). Protected professional credentials (qualification,
 * registrationNumber, specializationId) are explicitly rejected here with a
 * clear error, rather than silently ignored — a doctor cannot change these
 * by any request shape. A future "submit a credential change for admin
 * review" workflow can be added later without touching this endpoint's
 * editable-field logic.
 */
router.patch("/me", requireAuth, requireRole("DOCTOR"), async (req, res) => {
  const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id }, include: { clinic: true } });
  if (!doctor) return res.status(404).json({ error: "Doctor profile not found" });

  const attemptedProtectedFields = PROTECTED_DOCTOR_FIELDS.filter((f) => req.body[f] !== undefined);
  if (attemptedProtectedFields.length > 0) {
    return res.status(400).json({
      error: `These fields are protected professional credentials and cannot be self-edited: ${attemptedProtectedFields.join(", ")}`,
    });
  }

  const data = {};

  if (req.body.consultationFee !== undefined) {
    const fee = Number(req.body.consultationFee);
    if (!Number.isFinite(fee) || fee < 0 || fee > 100000) {
      return res.status(400).json({ error: "consultationFee must be a reasonable non-negative amount" });
    }
    data.consultationFee = fee;
  }
  if (req.body.contactInfo !== undefined) data.contactInfo = String(req.body.contactInfo);
  if (req.body.bio !== undefined) data.bio = String(req.body.bio);
  if (req.body.languages !== undefined) data.languages = String(req.body.languages);
  if (req.body.experience !== undefined) {
    const exp = Number(req.body.experience);
    if (!Number.isInteger(exp) || exp < 0 || exp > 70) {
      return res.status(400).json({ error: "experience must be a whole number of years (0-70)" });
    }
    data.experience = exp;
  }

  let finalConsultationModes = doctor.consultationModes;
  if (req.body.consultationModes !== undefined) {
    if (!VALID_CONSULTATION_MODES.includes(req.body.consultationModes)) {
      return res.status(400).json({ error: `consultationModes must be one of ${VALID_CONSULTATION_MODES.join(", ")}` });
    }
    data.consultationModes = req.body.consultationModes;
    finalConsultationModes = req.body.consultationModes;
  }

  // Clinic (Step 3): part of the same profile update. `clinic: null` removes
  // it (e.g. switching to ONLINE-only); an object upserts it.
  let clinicResult = doctor.clinic;
  if (req.body.clinic !== undefined) {
    if (req.body.clinic === null) {
      if (doctor.clinic) {
        await prisma.clinic.delete({ where: { doctorId: doctor.id } });
      }
      clinicResult = null;
    } else {
      const { name, area, address, city, contactInfo } = req.body.clinic;
      if (!name || typeof name !== "string") {
        return res.status(400).json({ error: "clinic.name is required when providing clinic information" });
      }
      clinicResult = await prisma.clinic.upsert({
        where: { doctorId: doctor.id },
        create: { doctorId: doctor.id, name, area, address, city, contactInfo },
        update: { name, area, address, city, contactInfo },
      });
    }
  }

  // A doctor offering PHYSICAL or BOTH needs clinic information for patients
  // to know where to go — validated here rather than at booking time.
  if ((finalConsultationModes === "PHYSICAL" || finalConsultationModes === "BOTH") && !clinicResult) {
    return res.status(400).json({
      error: "Clinic information is required to offer physical consultations",
    });
  }

  const updated = await prisma.doctor.update({
    where: { id: doctor.id },
    data,
    include: { specialization: true, clinic: true },
  });
  res.json(updated);
});

/**
 * POST /api/doctors/me/availability — doctor creates a recurring weekly
 * availability period for THEMSELVES ONLY. Doctor identity comes from the
 * authenticated JWT (req.user.id -> their own Doctor row); a doctorId is
 * never accepted from the request body, so a doctor cannot create
 * availability for another doctor by any client-supplied value.
 */
router.post("/me/availability", requireAuth, requireRole("DOCTOR"), async (req, res) => {
  const { dayOfWeek, startTime, endTime } = req.body;

  if (
    typeof dayOfWeek !== "number" ||
    !Number.isInteger(dayOfWeek) ||
    dayOfWeek < 0 ||
    dayOfWeek > 6
  ) {
    return res.status(400).json({ error: "dayOfWeek must be an integer 0-6 (0=Sunday..6=Saturday)" });
  }
  if (!isValidTimeStr(startTime) || !isValidTimeStr(endTime)) {
    return res.status(400).json({ error: "startTime and endTime must be valid 24-hour HH:mm times" });
  }
  if (startTime >= endTime) {
    return res.status(400).json({ error: "startTime must be before endTime" });
  }

  const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });
  if (!doctor) return res.status(404).json({ error: "Doctor profile not found" });

  // Prevent overlapping availability for the same doctor/day (Step 2).
  const existing = await prisma.doctorAvailability.findMany({
    where: { doctorId: doctor.id, dayOfWeek, active: true },
  });
  const overlaps = existing.some((row) => timeRangesOverlap(startTime, endTime, row.startTime, row.endTime));
  if (overlaps) {
    return res.status(409).json({ error: "This overlaps with an existing availability period for that day" });
  }

  const created = await prisma.doctorAvailability.create({
    data: { doctorId: doctor.id, dayOfWeek, startTime, endTime },
  });
  res.status(201).json(created);
});

/**
 * PATCH /api/doctors/me/availability/:id — doctor updates their OWN
 * availability period. Ownership is verified by checking the row's
 * doctorId against the authenticated doctor's own id — a doctor cannot
 * modify another doctor's availability by guessing/supplying a different id.
 */
router.patch("/me/availability/:id", requireAuth, requireRole("DOCTOR"), async (req, res) => {
  const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });
  if (!doctor) return res.status(404).json({ error: "Doctor profile not found" });

  const existingRow = await prisma.doctorAvailability.findUnique({ where: { id: req.params.id } });
  if (!existingRow || existingRow.doctorId !== doctor.id) {
    return res.status(404).json({ error: "Availability period not found" });
  }

  const { dayOfWeek, startTime, endTime, active } = req.body;
  const data = {};

  if (dayOfWeek !== undefined) {
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      return res.status(400).json({ error: "dayOfWeek must be an integer 0-6" });
    }
    data.dayOfWeek = dayOfWeek;
  }
  if (startTime !== undefined) {
    if (!isValidTimeStr(startTime)) return res.status(400).json({ error: "Invalid startTime" });
    data.startTime = startTime;
  }
  if (endTime !== undefined) {
    if (!isValidTimeStr(endTime)) return res.status(400).json({ error: "Invalid endTime" });
    data.endTime = endTime;
  }
  if (active !== undefined) data.active = Boolean(active);

  const merged = { ...existingRow, ...data };
  if (merged.startTime >= merged.endTime) {
    return res.status(400).json({ error: "startTime must be before endTime" });
  }

  if (merged.active) {
    const siblings = await prisma.doctorAvailability.findMany({
      where: { doctorId: doctor.id, dayOfWeek: merged.dayOfWeek, active: true, NOT: { id: existingRow.id } },
    });
    const overlaps = siblings.some((row) =>
      timeRangesOverlap(merged.startTime, merged.endTime, row.startTime, row.endTime)
    );
    if (overlaps) {
      return res.status(409).json({ error: "This overlaps with an existing availability period for that day" });
    }
  }

  const updated = await prisma.doctorAvailability.update({ where: { id: req.params.id }, data });
  res.json(updated);
});

// DELETE /api/doctors/me/availability/:id — doctor deletes their OWN availability period.
router.delete("/me/availability/:id", requireAuth, requireRole("DOCTOR"), async (req, res) => {
  const doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });
  if (!doctor) return res.status(404).json({ error: "Doctor profile not found" });

  const existingRow = await prisma.doctorAvailability.findUnique({ where: { id: req.params.id } });
  if (!existingRow || existingRow.doctorId !== doctor.id) {
    return res.status(404).json({ error: "Availability period not found" });
  }

  await prisma.doctorAvailability.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

/**
 * GET /api/doctors — Step 6/7: patient doctor discovery/search. Only
 * APPROVED doctors are ever returned — PENDING/REJECTED/DISABLED never
 * appear here, regardless of any filter combination.
 *
 * Filters (all optional, combinable): specializationId, area (clinic area,
 * partial match), qualification (partial match), minFee/maxFee,
 * minExperience, consultationMode (ONLINE|PHYSICAL — matches a doctor whose
 * consultationModes is that value OR "BOTH"), and date (YYYY-MM-DD) — the
 * availability filter, which reuses the EXISTING real slot-generation logic
 * (scheduling.js) rather than a second/fake availability check: a doctor is
 * only kept when they have at least one real, currently-bookable slot on
 * that exact date.
 */
router.get("/", requireAuth, async (req, res) => {
  const { specializationId, area, qualification, minFee, maxFee, minExperience, consultationMode, date } = req.query;

  const where = {
    approvalStatus: "APPROVED",
    ...(specializationId ? { specializationId } : {}),
    ...(qualification ? { qualification: { contains: qualification, mode: "insensitive" } } : {}),
    ...(area ? { clinic: { area: { contains: area, mode: "insensitive" } } } : {}),
    ...(minExperience ? { experience: { gte: Number(minExperience) } } : {}),
  };

  if (minFee || maxFee) {
    where.consultationFee = {};
    if (minFee) where.consultationFee.gte = Number(minFee);
    if (maxFee) where.consultationFee.lte = Number(maxFee);
  }

  if (consultationMode) {
    if (!VALID_CONSULTATION_MODES.includes(consultationMode) || consultationMode === "BOTH") {
      return res.status(400).json({ error: "consultationMode filter must be ONLINE or PHYSICAL" });
    }
    // A doctor matches if they offer exactly that mode, or offer BOTH.
    where.consultationModes = { in: [consultationMode, "BOTH"] };
  }

  let doctors = await prisma.doctor.findMany({
    where,
    include: { specialization: true, clinic: true },
  });

  // Availability filter: only kept if this doctor has at least one real,
  // currently-bookable slot on the requested date. Computed with the same
  // generateSlotsForDate used by GET /:id/slots — no duplicate logic.
  if (date) {
    if (!isValidDateStr(date)) {
      return res.status(400).json({ error: "date query parameter must be in YYYY-MM-DD format" });
    }
    if (!isWithinBookingWindow(date)) {
      return res.status(400).json({ error: "date is in the past or beyond the 30-day booking window" });
    }

    const filtered = [];
    for (const doc of doctors) {
      const availabilityRows = await prisma.doctorAvailability.findMany({
        where: { doctorId: doc.id, active: true },
      });
      if (availabilityRows.length === 0) continue;

      const existingAppointments = await prisma.appointment.findMany({
        where: { doctorId: doc.id, status: { not: "CANCELLED" } },
        select: { scheduledAt: true },
      });
      const bookedInstantsIso = new Set(existingAppointments.map((a) => a.scheduledAt.toISOString()));

      const slots = generateSlotsForDate(availabilityRows, date, bookedInstantsIso, DEFAULT_SLOT_DURATION_MINUTES);
      if (slots.length > 0) filtered.push(doc);
    }
    doctors = filtered;
  }

  res.json(doctors);
});

// GET /api/doctors/:id — FR-10: doctor profile detail.
router.get("/:id", requireAuth, async (req, res) => {
  const doctor = await prisma.doctor.findUnique({
    where: { id: req.params.id },
    include: { specialization: true, clinic: true },
  });
  if (!doctor || doctor.approvalStatus !== "APPROVED") {
    return res.status(404).json({ error: "Doctor not found" });
  }
  res.json(doctor);
});

// GET /api/doctors/:id/availability — the doctor's recurring weekly availability template.
// Used both by the doctor's own dashboard and by a patient viewing the doctor's profile.
router.get("/:id/availability", requireAuth, async (req, res) => {
  const rows = await prisma.doctorAvailability.findMany({
    where: { doctorId: req.params.id, active: true },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
  res.json(rows);
});

/**
 * GET /api/doctors/:id/slots?date=YYYY-MM-DD — Step 4/7: REAL dynamically
 * generated bookable slots for one specific real calendar date (Asia/Dhaka).
 * Nothing here is precomputed or stored — it is calculated fresh on every
 * request from the doctor's weekly availability template plus whichever
 * appointments already exist for that doctor.
 */
router.get("/:id/slots", requireAuth, async (req, res) => {
  const { date } = req.query;

  if (!isValidDateStr(date)) {
    return res.status(400).json({ error: "date query parameter must be in YYYY-MM-DD format" });
  }
  if (!isWithinBookingWindow(date)) {
    return res.status(400).json({ error: "date is in the past or beyond the 30-day booking window" });
  }

  const doctor = await prisma.doctor.findUnique({ where: { id: req.params.id } });
  if (!doctor || doctor.approvalStatus !== "APPROVED") {
    return res.status(404).json({ error: "Doctor not found or not currently accepting bookings" });
  }

  const availabilityRows = await prisma.doctorAvailability.findMany({
    where: { doctorId: doctor.id, active: true },
  });

  // Only count appointments that still hold the slot — a CANCELLED
  // appointment frees the slot back up.
  const existingAppointments = await prisma.appointment.findMany({
    where: { doctorId: doctor.id, status: { not: "CANCELLED" } },
    select: { scheduledAt: true },
  });
  const bookedInstantsIso = new Set(existingAppointments.map((a) => a.scheduledAt.toISOString()));

  const slots = generateSlotsForDate(availabilityRows, date, bookedInstantsIso, DEFAULT_SLOT_DURATION_MINUTES);
  res.json({ date, slots });
});

/**
 * POST /api/doctors — Admin-only Doctor account creation (decision #2, Section 18).
 * Since there is no self-registration path for doctors, Admin creates the
 * account directly here. A temporary password is generated (or optionally
 * supplied by the Admin) and returned ONCE in the response — it is never
 * stored or retrievable again — for the Admin to relay to the doctor, who
 * should change it on first login.
 */
router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { email, name, specializationId, consultationFee, temporaryPassword } = req.body;
  if (!email || !name || !specializationId) {
    return res.status(400).json({ error: "email, name, specializationId are required" });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  // Generate a random temporary password if the Admin didn't supply one.
  const plainPassword = temporaryPassword || crypto.randomBytes(9).toString("base64url");
  const passwordHash = await hashPassword(plainPassword);

  const user = await prisma.user.create({
    data: {
      email,
      password: passwordHash,
      role: "DOCTOR",
      doctor: {
        create: { name, specializationId, consultationFee, approvalStatus: "APPROVED" },
      },
    },
    include: { doctor: true },
  });

  res.status(201).json({
    id: user.id,
    email: user.email,
    role: user.role,
    doctor: user.doctor,
    temporaryPassword: plainPassword, // shown once — relay to the doctor out-of-band, then have them change it
  });
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
