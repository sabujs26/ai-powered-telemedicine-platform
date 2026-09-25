import { useState, useEffect } from "react";
import { useAuth } from "../lib/AuthContext.jsx";
import { apiFetch } from "../lib/api.js";

// A doctor only ever reaches this page with an active session, and the
// backend only issues a session to an APPROVED doctor (see login's
// approval-status gate in backend/src/routes/auth.js) — so no extra
// "am I approved" check is needed here. Doctor availability, appointments,
// and prescriptions are later increments (not in scope for this one).
//
// IMPORTANT: the apiFetch call below explicitly passes `accessToken` (read
// synchronously from useAuth()) as the third argument — same fix pattern as
// AdminDashboard. See api.js for the root-cause explanation. Do not remove
// the explicit token argument.
export default function DoctorDashboard() {
  const { user, logout, accessToken } = useAuth();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch("/api/doctors/me", {}, accessToken)
      .then(setProfile)
      .catch((err) => setError(err.message));
  }, [accessToken]);

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-white border-b border-line px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl text-ink">Doctor</h1>
          <p className="text-xs text-muted mt-0.5">{user?.email}</p>
        </div>
        <button onClick={logout} className="text-sm text-muted hover:text-ink transition-colors">
          Log out
        </button>
      </header>

      <main className="px-8 py-8 max-w-2xl">
        <div className="bg-white border border-line rounded-lg p-6">
          <p className="font-display text-xl text-ink mb-1">
            {profile ? `Welcome back, ${profile.name}` : "Welcome back"}
          </p>
          <p className="text-sm text-muted mb-4">Your application status</p>

          {error && <p className="text-sm text-danger">{error}</p>}

          {profile && (
            <>
              <span className="inline-block text-xs px-2 py-1 rounded-full bg-teal-light text-teal-dark">
                {profile.approvalStatus}
              </span>

              <div className="h-px bg-line my-4" />

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted">Specialization</dt>
                <dd className="text-ink">{profile.specialization?.name || "—"}</dd>

                <dt className="text-muted">Qualification</dt>
                <dd className="text-ink">{profile.qualification || "—"}</dd>

                <dt className="text-muted">Registration / BM&amp;DC no.</dt>
                <dd className="text-ink">{profile.registrationNumber || "—"}</dd>

                <dt className="text-muted">Contact information</dt>
                <dd className="text-ink">{profile.contactInfo || "—"}</dd>

                <dt className="text-muted">Consultation fee</dt>
                <dd className="text-ink">
                  {profile.consultationFee === null || profile.consultationFee === undefined
                    ? "Not set"
                    : `$${profile.consultationFee}`}
                </dd>
              </dl>
            </>
          )}

          <div className="h-px bg-line my-4" />

          <p className="text-sm text-muted">
            Availability management, appointments, and prescriptions will appear here in a later
            increment.
          </p>
        </div>
      </main>
    </div>
  );
}
