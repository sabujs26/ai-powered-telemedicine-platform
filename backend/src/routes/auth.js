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

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    // Deliberately identical error for "no such user" and "wrong password" —
    // avoids leaking which emails are registered.
    if (!user || !(await verifyPassword(password, user.password))) {
      return res.status(401).json({ error: "Invalid email or password" });
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
