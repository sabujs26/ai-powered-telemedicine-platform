import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  refreshExpiryDate,
} from "../lib/authTokens.js";

const router = Router();

const REFRESH_COOKIE_NAME = "refreshToken";
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production", // requires HTTPS in prod
  sameSite: "strict",
  path: "/api/auth", // only sent back to auth endpoints, not every request
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

async function issueTokenPair(user, res) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiryDate(),
    },
  });

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
  return accessToken;
}

/**
 * POST /api/auth/register
 * FR-01 — Patient self-registration only. Public registration always creates
 * a PATIENT account (role is never taken from the request body) — Doctor
 * accounts remain Admin-created per decision #2 in the requirements baseline,
 * and ADMIN accounts are never created through this public endpoint.
 */
router.post("/register", async (req, res) => {
  try {
    const { email, password, name, contactInfo } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: "email, password, and name are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        password: passwordHash,
        role: "PATIENT",
        patient: { create: { name, contactInfo } },
      },
    });

    const accessToken = await issueTokenPair(user, res);

    // Never return the password hash.
    res.status(201).json({ accessToken, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    res.status(400).json({ error: "Registration failed", detail: err.message });
  }
});

/**
 * POST /api/auth/register-doctor
 * Doctor self-registration → PENDING approval (MVP decision, supersedes the
 * earlier "Admin creates Doctor directly" approach — see schema.prisma
 * header comment). Role and approvalStatus are ALWAYS set by the backend;
 * neither is ever read from the request body.
 *
 * Deliberately does NOT issue an access/refresh token pair — an unapproved
 * doctor gets no session at all. This keeps "who can reach protected
 * doctor functionality" a single, simple rule enforced at /login (Step 4),
 * rather than juggling a partially-authenticated state.
 */
router.post("/register-doctor", async (req, res) => {
  try {
    const {
      email,
      password,
      name,
      contactInfo,
      qualification,
      registrationNumber,
      specializationId,
      consultationFee,
    } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: "email, password, and name are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    if (!specializationId) {
      return res.status(400).json({ error: "specializationId is required" });
    }
    if (!qualification || !registrationNumber) {
      return res
        .status(400)
        .json({ error: "qualification and registrationNumber are required for a doctor application" });
    }
    if (consultationFee !== undefined && consultationFee !== null) {
      const fee = Number(consultationFee);
      if (!Number.isFinite(fee) || fee < 0 || fee > 100000) {
        return res.status(400).json({ error: "consultationFee must be a reasonable non-negative amount" });
      }
    }

    const specialization = await prisma.specialization.findUnique({ where: { id: specializationId } });
    if (!specialization) {
      return res.status(400).json({ error: "Unknown specializationId" });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        password: passwordHash,
        role: "DOCTOR", // backend-forced — never trust a client-sent role
        doctor: {
          create: {
            name,
            contactInfo,
            qualification,
            registrationNumber,
            specializationId,
            consultationFee,
            approvalStatus: "PENDING", // backend-forced — never auto-approved
          },
        },
      },
      include: { doctor: true },
    });

    // No token pair issued. Never return the password hash.
    res.status(201).json({
      message: "Your doctor application has been submitted and is awaiting admin approval.",
      user: { id: user.id, email: user.email, role: user.role },
      doctor: { id: user.doctor.id, approvalStatus: user.doctor.approvalStatus },
    });
  } catch (err) {
    res.status(400).json({ error: "Doctor registration failed", detail: err.message });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const user = await prisma.user.findUnique({ where: { email }, include: { doctor: true } });
    // Deliberately identical error for "no such user" and "wrong password" —
    // avoids leaking which emails are registered.
    if (!user || !(await verifyPassword(password, user.password))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Doctor approval gate — patients and admins are unaffected (no `doctor`
    // relation on their User row, so this block is simply skipped for them).
    if (user.role === "DOCTOR") {
      if (user.doctor.approvalStatus === "PENDING") {
        return res.status(403).json({ error: "Your doctor application is still pending approval." });
      }
      if (user.doctor.approvalStatus === "REJECTED") {
        return res.status(403).json({ error: "Your doctor application has been rejected." });
      }
      if (user.doctor.approvalStatus === "DISABLED") {
        return res.status(403).json({ error: "Your doctor account has been disabled. Contact an admin." });
      }
      // Only "APPROVED" falls through to a normal session below.
    }

    const accessToken = await issueTokenPair(user, res);
    res.json({ accessToken, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: "Login failed", detail: err.message });
  }
});

/**
 * POST /api/auth/refresh
 * Rotation: the incoming refresh token is revoked and a new one issued on
 * every successful refresh, so a leaked-but-unused old token becomes useless
 * the next time the legitimate client refreshes.
 */
router.post("/refresh", async (req, res) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!token) {
      return res.status(401).json({ error: "No refresh token provided" });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    const tokenHash = hashToken(token);
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      return res.status(401).json({ error: "Refresh token has been revoked or expired" });
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user) {
      return res.status(401).json({ error: "Account no longer exists" });
    }

    // Rotate: revoke the used token, issue a fresh pair.
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });
    const accessToken = await issueTokenPair(user, res);

    res.json({ accessToken });
  } catch (err) {
    res.status(500).json({ error: "Token refresh failed", detail: err.message });
  }
});

// POST /api/auth/logout — revokes the current refresh session and clears the cookie.
router.post("/logout", async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (token) {
    const tokenHash = hashToken(token);
    await prisma.refreshToken.updateMany({ where: { tokenHash }, data: { revoked: true } });
  }
  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth" });
  res.json({ success: true });
});

// GET /api/auth/me — returns the authenticated user's own record.
router.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});

export default router;
