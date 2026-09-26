import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import AppShell from "../components/AppShell.jsx";
import { apiFetch } from "../lib/api.js";
import { useAuth } from "../lib/AuthContext.jsx";

export default function PatientDashboard() {
  const { user, accessToken } = useAuth();
  const [upcoming, setUpcoming] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch("/api/appointments", {}, accessToken)
      .then((appointments) => {
        const next = appointments
          .filter((a) => a.status !== "CANCELLED" && a.status !== "COMPLETED" && new Date(a.scheduledAt) > new Date())
          .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0];
        setUpcoming(next || null);
      })
      .finally(() => setLoading(false));
  }, [accessToken]);

  return (
    <AppShell>
      <h1 className="font-display text-2xl text-ink mb-1">Welcome back</h1>
      <p className="text-muted text-sm mb-8">{user?.email} — here's what's next for your care.</p>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <Link
          to="/patient/symptoms"
          className="border border-line bg-white rounded-lg p-5 hover:border-teal transition-colors group"
        >
          <p className="text-xs text-muted mb-2">Not feeling well?</p>
          <p className="font-display text-lg text-ink group-hover:text-teal transition-colors">
            Check your symptoms
          </p>
          <p className="text-sm text-muted mt-1">Get a preliminary assessment and a specialist match.</p>
        </Link>
        <Link
          to="/patient/doctors"
          className="border border-line bg-white rounded-lg p-5 hover:border-teal transition-colors group"
        >
          <p className="text-xs text-muted mb-2">Know what you need?</p>
          <p className="font-display text-lg text-ink group-hover:text-teal transition-colors">
            Browse doctors directly
          </p>
          <p className="text-sm text-muted mt-1">Search by specialty and book a time that works.</p>
        </Link>
      </div>

      <div className="border border-line bg-white rounded-lg p-5">
        <p className="text-sm font-medium text-ink mb-3">Upcoming appointment</p>
        {loading && <p className="text-sm text-muted">Loading…</p>}
        {!loading && upcoming && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-ink">{upcoming.doctor?.name}</p>
              <p className="text-xs text-muted">{upcoming.doctor?.specialization?.name}</p>
            </div>
            <p className="text-sm text-muted">
              {new Date(upcoming.scheduledAt).toLocaleString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>
        )}
        {!loading && !upcoming && (
          <p className="text-sm text-muted">
            No upcoming appointments.{" "}
            <Link to="/patient/doctors" className="text-teal hover:underline">
              Book one
            </Link>
            .
          </p>
        )}
      </div>
    </AppShell>
  );
}
