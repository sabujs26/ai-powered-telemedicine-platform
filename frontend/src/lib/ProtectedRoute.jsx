import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

/**
 * Frontend route guard — this is UX convenience only (redirect logged-out
 * users to /login, keep a patient out of /admin in the UI). It is NOT a
 * security boundary: every protected backend endpoint independently
 * verifies the JWT and role via requireAuth/requireRole middleware, so
 * even if this component were bypassed, the API would still reject the
 * request.
 */
export default function ProtectedRoute({ allowedRoles, children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted text-sm">Loading…</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const fallback = user.role === "DOCTOR" ? "/doctor" : user.role === "ADMIN" ? "/admin" : "/patient";
    return <Navigate to={fallback} replace />;
  }
  return children;
}
