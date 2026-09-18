import { Router } from "express";
import prisma from "../lib/prisma.js";
import admin from "../config/firebase.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

/**
 * POST /api/auth/register
 * FR-01 — Patient self-registration. The client first creates the account
 * in Firebase Auth, then calls this endpoint with the resulting ID token to
 * create the matching Patient/User row in our own database.
 *
 * NOTE: Per decision #2 (Section 18), Doctor accounts are Admin-created only
 * — there is no self-registration path for Doctors. See /api/doctors (admin).
 */
router.post("/register", async (req, res) => {
  try {
    const { idToken, name, contactInfo } = req.body;
    if (!idToken || !name) {
      return res.status(400).json({ error: "idToken and name are required" });
    }

    const decoded = await admin.auth().verifyIdToken(idToken);

    const existing = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (existing) {
      return res.status(409).json({ error: "Account already exists" });
    }

    const user = await prisma.user.create({
      data: {
        email: decoded.email,
        firebaseUid: decoded.uid,
        role: "PATIENT",
        patient: {
          create: { name, contactInfo },
        },
      },
      include: { patient: true },
    });

    res.status(201).json({ id: user.id, email: user.email, role: user.role });
  } catch (err) {
    res.status(400).json({ error: "Registration failed", detail: err.message });
  }
});

// GET /api/auth/me — returns the authenticated user's own record.
router.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});

export default router;
