const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

// Module-level reference set by AuthProvider so apiFetch can read/update the
// current access token without every call site needing useAuth(). Kept
// deliberately simple for this project's scope — a full app might use a
// request-interceptor pattern instead.
let currentAccessToken = null;
let onTokenRefreshed = null;

export function setAccessTokenRef(token) {
  currentAccessToken = token;
}
export function setTokenRefreshHandler(fn) {
  onTokenRefreshed = fn; // called with the new token after a silent refresh
}

async function refreshAccessToken() {
  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) return null;
  const data = await res.json();
  currentAccessToken = data.accessToken;
  onTokenRefreshed?.(data.accessToken);
  return data.accessToken;
}

/**
 * Thin fetch wrapper that attaches the current JWT access token. On a 401
 * (expired access token), it silently attempts one refresh using the
 * httpOnly refresh cookie and retries the request once before giving up —
 * this is what "handle expired access tokens" (Section 11) means in practice.
 */
export async function apiFetch(path, { method = "GET", body } = {}) {
  async function doFetch(token) {
    return fetch(`${API_BASE}${path}`, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  let res = await doFetch(currentAccessToken);

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await doFetch(newToken);
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}
