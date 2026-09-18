import admin from "../config/firebase.js";
import prisma from "../lib/prisma.js";

/**
 * requireAuth — verifies the Firebase ID token sent in the Authorization header
 * ("Bearer <token>"), then looks up the user's ROLE from our own database
 * (never trusts a role claimed by the client). Implements SEC-01.
 *
 * On success, attaches `req.user = { id, email, role }` for downstream handlers.
 */
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: "Missing or malformed Authorization header" });
    }

    const decoded = await admin.auth().verifyIdToken(token);

    const user = await prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
    });

    if (!user) {
      return res.status(401).json({ error: "No matching account found for this token" });
    }

    req.user = { id: user.id, email: user.email, role: user.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token", detail: err.message });
  }
}

/**
 * requireRole — role-gate middleware. Use AFTER requireAuth.
 * Implements SEC-02 (backend-enforced RBAC — frontend route guards alone
 * are never sufficient, per the proposal).
 *
 * Example: router.patch("/:id/approve", requireAuth, requireRole("ADMIN"), handler)
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions for this action" });
    }
    next();
  };
}
