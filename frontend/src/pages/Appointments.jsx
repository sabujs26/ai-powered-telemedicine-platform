import { useState, useEffect } from "react";
import AppShell from "../components/AppShell.jsx";
import { apiFetch } from "../lib/api.js";
import { useAuth } from "../lib/AuthContext.jsx";

export default function Appointments() {
  const { accessToken } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch("/api/appointments", {}, accessToken)
      .then(setAppointments)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [accessToken]);

  return (
    <AppShell>
      <h1 className="font-display text-2xl text-ink mb-1">Appointments</h1>
      <p className="text-muted text-sm mb-6">Your consultation history.</p>

      {loading && <p className="text-sm text-muted">Loading…</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="space-y-3">
        {!loading &&
          appointments.map((ap) => (
            <div key={ap.id} className="flex items-center justify-between border border-line bg-white rounded-lg p-5">
              <div>
                <p className="text-sm text-ink font-medium">{ap.doctor?.name}</p>
                <p className="text-sm text-muted">{ap.doctor?.specialization?.name}</p>
                <p className="text-xs text-muted mt-1">
                  {new Date(ap.scheduledAt).toLocaleString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <span className="inline-block text-xs px-2 py-1 rounded-full bg-teal-light text-teal-dark">
                {ap.status}
              </span>
            </div>
          ))}
        {!loading && appointments.length === 0 && (
          <p className="text-sm text-muted border border-line rounded-lg p-5 bg-white">No appointments yet.</p>
        )}
      </div>
    </AppShell>
  );
}
