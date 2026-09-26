import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../lib/api.js";
import { useAuth } from "../lib/AuthContext.jsx";
import { formatCurrency } from "../lib/currency.js";

// FR-22: Admin reviews pending doctor applications and approves/rejects them.
// Real backend calls — GET/PATCH /api/admin/doctors/* (admin.js, requireRole("ADMIN")).
//
// IMPORTANT: every apiFetch call below explicitly passes `accessToken` (read
// synchronously from useAuth()) as the third argument. This is the fix for
// the "Missing or malformed Authorization header" bug — see api.js for the
// root-cause explanation. Do not remove the explicit token argument.

// Maps low-level/technical error text into something a person can act on,
// without hiding real validation messages the backend already writes clearly.
function friendlyError(message) {
  if (!message) return "Something went wrong. Please try again.";
  const raw = message.toLowerCase();
  if (raw.includes("authorization") || raw.includes("token") || raw.includes("401")) {
    return "Your session has expired or you don't have permission to view this. Please log in again.";
  }
  if (raw.includes("failed to fetch") || raw.includes("networkerror")) {
    return "Could not reach the server. Please check your connection and try again.";
  }
  return message; // backend validation messages (e.g. "Doctor application not found") are already clear
}

export default function AdminDashboard() {
  const { user, logout, accessToken } = useAuth();
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actioningId, setActioningId] = useState(null);

  const loadPending = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/api/admin/doctors/pending", {}, accessToken);
      setPending(data);
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (accessToken) loadPending();
  }, [accessToken, loadPending]);

  async function handleDecision(id, action) {
    setActioningId(id);
    setError(null);
    try {
      await apiFetch(`/api/admin/doctors/${id}/${action}`, { method: "PATCH" }, accessToken);
      await loadPending(); // refresh the list after approve/reject
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setActioningId(null);
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="bg-white border-b border-line px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-ink">Admin Dashboard</h1>
          <p className="text-sm text-muted mt-0.5">Signed in as {user?.email}</p>
        </div>
        <button
          onClick={logout}
          className="text-sm text-muted hover:text-ink border border-line rounded-md px-3 py-1.5 transition-colors"
        >
          Log out
        </button>
      </header>

      <main className="px-8 py-8 max-w-4xl mx-auto">
        <p className="text-sm text-muted mb-8 max-w-2xl">
          Manage the telemedicine platform's doctor onboarding queue. Review each application's
          credentials before approving access to the Doctor Dashboard.
        </p>

        <section>
          <div className="flex items-baseline justify-between mb-1">
            <h2 className="font-display text-lg text-ink">Pending Doctor Applications</h2>
            {!loading && pending.length > 0 && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-light text-amber">
                {pending.length} awaiting review
              </span>
            )}
          </div>
          <p className="text-sm text-muted mb-6">
            New doctor sign-ups appear here until approved or rejected.
          </p>

          {loading && (
            <div className="border border-line bg-white rounded-lg p-8 text-center">
              <p className="text-sm text-muted">Loading pending applications…</p>
            </div>
          )}

          {error && !loading && (
            <div className="border border-danger/30 bg-danger-light rounded-lg p-4 mb-4">
              <p className="text-sm text-danger font-medium">Couldn't load applications</p>
              <p className="text-sm text-danger/90 mt-0.5">{error}</p>
            </div>
          )}

          {!loading && !error && pending.length === 0 && (
            <div className="border border-line bg-white rounded-lg p-8 text-center">
              <p className="text-sm text-ink font-medium">All caught up</p>
              <p className="text-sm text-muted mt-1">
                There are no pending doctor applications right now.
              </p>
            </div>
          )}

          <div className="space-y-4">
            {pending.map((doc) => (
              <article key={doc.id} className="border border-line bg-white rounded-lg p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-display text-lg text-ink">{doc.name}</p>
                    <p className="text-sm text-teal font-medium">{doc.specialization?.name}</p>
                    <p className="text-sm text-muted mt-1">{doc.user?.email}</p>
                  </div>
                  <span className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-light text-amber">
                    {doc.approvalStatus}
                  </span>
                </div>

                <div className="h-px bg-line my-4" />

                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <Row label="Qualification" value={doc.qualification || "—"} />
                  <Row label="Registration / BM&DC no." value={doc.registrationNumber || "—"} />
                  <Row label="Contact information" value={doc.contactInfo || "—"} />
                  <Row
                    label="Consultation fee"
                    value={formatCurrency(doc.consultationFee) || "Not set"}
                  />
                </dl>

                <div className="flex gap-3 mt-5">
                  <button
                    onClick={() => handleDecision(doc.id, "approve")}
                    disabled={actioningId === doc.id}
                    className="bg-teal text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-teal-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {actioningId === doc.id ? "Working…" : "Approve"}
                  </button>
                  <button
                    onClick={() => handleDecision(doc.id, "reject")}
                    disabled={actioningId === doc.id}
                    className="border border-line text-danger text-sm font-medium px-4 py-2 rounded-md hover:bg-danger-light hover:border-danger/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div>
      <dt className="text-muted text-xs uppercase tracking-wide">{label}</dt>
      <dd className="text-ink mt-0.5">{value}</dd>
    </div>
  );
}
