import prisma from "../lib/prisma.js";
import { verifyAccessToken } from "../lib/authTokens.js";

/**
 * requireAuth — verifies the JWT access token sent in the Authorization header
 * ("Bearer <token>"). The role in the token payload is trusted ONLY because
 * it was signed by our own backend at login time (see routes/auth.js) — it is
 * never accepted from the client as a plain claim.
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

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (err) {
      return res.status(401).json({ error: "Invalid or expired access token" });
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user) {
      return res.status(401).json({ error: "No matching account found for this token" });
    }

    req.user = { id: user.id, email: user.email, role: user.role };
    next();
  } catch (err) {
    return res.status(401).json({ error: "Authentication failed", detail: err.message });
  }
}

/**
 * requireRole — role-gate middleware. Use AFTER requireAuth.
 * Backend-enforced RBAC — frontend route guards alone are never sufficient.
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

/**
 * requireOwnershipOrRole — for routes like GET /api/patients/:id/history where
 * a user must be either the owner of the resource or hold an override role
 * (e.g. ADMIN). Prevents "change the ID in the URL" access to someone else's
 * data (Section 10 of the auth spec).
 *
 * `getOwnerId(req)` should return the userId that owns the requested resource.
 */
export function requireOwnershipOrRole(getOwnerId, ...overrideRoles) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (overrideRoles.includes(req.user.role)) {
      return next();
    }
    try {
      const ownerId = await getOwnerId(req);
      if (ownerId && ownerId === req.user.id) {
        return next();
      }
      return res.status(403).json({ error: "You do not have access to this resource" });
    } catch (err) {
      return res.status(404).json({ error: "Resource not found" });
    }
  };
}
