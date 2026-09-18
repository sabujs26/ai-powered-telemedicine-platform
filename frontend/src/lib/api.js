import { auth } from "./firebase";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

/**
 * Thin fetch wrapper that attaches the current Firebase ID token, matching
 * the Authorization: Bearer <token> scheme expected by backend/src/middleware/auth.js.
 */
export async function apiFetch(path, { method = "GET", body } = {}) {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : null;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}
