import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { setAccessTokenRef, setTokenRefreshHandler } from "./api.js";

const AuthContext = createContext(null);

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

/**
 * Holds the access token and current user IN MEMORY ONLY (a page refresh
 * clears it — that's intentional, not a bug: storing a JWT in localStorage
 * is avoidable XSS exposure). On refresh, `bootstrapSession()` uses the
 * httpOnly refresh-token cookie (sent automatically) to get a new access
 * token without asking the user to log in again.
 */
export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const bootstrapSession = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        credentials: "include", // sends the httpOnly refresh cookie
      });
      if (!res.ok) throw new Error("no valid session");
      const data = await res.json();
      setAccessToken(data.accessToken);
      const meRes = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${data.accessToken}` },
      });
      if (meRes.ok) setUser(await meRes.json());
    } catch {
      setAccessToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Keep api.js's module-level token in sync with AuthContext state,
    // and let apiFetch's silent-refresh path update AuthContext back.
    setAccessTokenRef(accessToken);
  }, [accessToken]);

  useEffect(() => {
    setTokenRefreshHandler((newToken) => setAccessToken(newToken));
  }, []);

  useEffect(() => {
    bootstrapSession();
  }, [bootstrapSession]);

  async function login(email, password) {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Login failed");
    }
    const data = await res.json();
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }

  async function register({ email, password, name, contactInfo }) {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password, name, contactInfo }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Registration failed");
    }
    const data = await res.json();
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }

  async function logout() {
    await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
    setAccessToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ accessToken, setAccessToken, user, loading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
