import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || "15m";
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  // Fail loudly at startup rather than silently signing tokens with `undefined`.
  throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set in .env");
}

export async function hashPassword(plain) {
  const saltRounds = 12;
  return bcrypt.hash(plain, saltRounds);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/**
 * Access token payload is intentionally minimal — user id + role only.
 * Never put email, medical data, or anything sensitive in here: it's
 * decodable (not encrypted) by anyone holding the token.
 */
export function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRES_IN,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET); // throws on invalid/expired
}

/**
 * Refresh tokens are signed JWTs too (so expiry/signature are cheap to check),
 * but we ALSO store a hash of each issued token in the RefreshToken table.
 * That's what makes revocation and rotation possible — a signature-valid
 * refresh token that isn't in the DB (or is marked revoked) is rejected.
 */
export function signRefreshToken(user) {
  return jwt.sign({ sub: user.id }, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN });
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET); // throws on invalid/expired
}

/** SHA-256 hash used as the DB lookup key for refresh tokens — we never store the raw token. */
export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function refreshExpiryDate() {
  // Mirrors JWT_REFRESH_EXPIRES_IN for the DB row's expiresAt column.
  const days = parseInt(REFRESH_EXPIRES_IN) || 7;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
