import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../lib/AuthContext.jsx";
import { apiFetch } from "../lib/api.js";
import { formatCurrency } from "../lib/currency.js";
import { formatTime12h, DAY_LABELS } from "../lib/dateFormat.js";

// A doctor only ever reaches this page with an active session, and the
// backend only issues a session to an APPROVED doctor (see login's
// approval-status gate in backend/src/routes/auth.js) — so no extra
// "am I approved" check is needed here.
//
// IMPORTANT: every apiFetch call below explicitly passes `accessToken` (read
// synchronously from useAuth()) as the third argument — same fix pattern as
// AdminDashboard. See api.js for the root-cause explanation. Do not remove
// the explicit token argument.
export default function DoctorDashboard() {
  const { user, logout, accessToken } = useAuth();
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch("/api/doctors/me", {}, accessToken)
      .then(setProfile)
      .catch((err) => setProfileError(err.message));
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

      <main className="px-8 py-8 max-w-2xl space-y-6">
        <div className="bg-white border border-line rounded-lg p-6">
          <p className="font-display text-xl text-ink mb-1">
            {profile ? `Welcome back, ${profile.name}` : "Welcome back"}
          </p>
          <p className="text-sm text-muted mb-4">Your application status</p>

          {profileError && <p className="text-sm text-danger">{profileError}</p>}

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
                <dd className="text-ink">{formatCurrency(profile.consultationFee) || "Not set"}</dd>
              </dl>
            </>
          )}
        </div>

        {profile && <AvailabilitySection doctorId={profile.id} accessToken={accessToken} />}

        <UpcomingAppointments accessToken={accessToken} />

        <div className="bg-white border border-line rounded-lg p-6">
          <p className="text-sm text-muted">Prescriptions will appear here in a later increment.</p>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Availability management (Step 2). Full CRUD against the real backend:
// GET /api/doctors/:id/availability, POST/PATCH/DELETE /api/doctors/me/availability[/:id]
// ---------------------------------------------------------------------------
function AvailabilitySection({ doctorId, accessToken }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ dayOfWeek: "1", startTime: "09:00", endTime: "13:00" });
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/api/doctors/${doctorId}/availability`, {}, accessToken);
      setRows(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [doctorId, accessToken]);

  useEffect(() => {
    if (accessToken) load();
  }, [accessToken, load]);

  function startEdit(row) {
    setEditingId(row.id);
    setForm({ dayOfWeek: String(row.dayOfWeek), startTime: row.startTime, endTime: row.endTime });
    setFormError(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm({ dayOfWeek: "1", startTime: "09:00", endTime: "13:00" });
    setFormError(null);
  }

  async function handleSave(e) {
    e.preventDefault();
    setFormError(null);

    if (form.startTime >= form.endTime) {
      setFormError("Start time must be before end time.");
      return;
    }

    setSaving(true);
    try {
      const body = { dayOfWeek: Number(form.dayOfWeek), startTime: form.startTime, endTime: form.endTime };
      if (editingId) {
        await apiFetch(`/api/doctors/me/availability/${editingId}`, { method: "PATCH", body }, accessToken);
      } else {
        await apiFetch("/api/doctors/me/availability", { method: "POST", body }, accessToken);
      }
      resetForm();
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(id) {
    try {
      await apiFetch(`/api/doctors/me/availability/${id}`, { method: "DELETE" }, accessToken);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleToggleActive(row) {
    try {
      await apiFetch(
        `/api/doctors/me/availability/${row.id}`,
        { method: "PATCH", body: { active: !row.active } },
        accessToken
      );
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const grouped = DAY_LABELS.map((label, dow) => ({
    label,
    dow,
    rows: rows.filter((r) => r.dayOfWeek === dow).sort((a, b) => a.startTime.localeCompare(b.startTime)),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="bg-white border border-line rounded-lg p-6">
      <p className="font-display text-lg text-ink mb-1">Availability</p>
      <p className="text-sm text-muted mb-4">Your recurring weekly schedule for patient bookings.</p>

      {loading && <p className="text-sm text-muted">Loading…</p>}
      {error && <p className="text-sm text-danger mb-3">{error}</p>}

      {!loading && grouped.length === 0 && (
        <p className="text-sm text-muted mb-4">You haven't set any availability yet — add your first period below.</p>
      )}

      <div className="space-y-3 mb-6">
        {grouped.map((group) => (
          <div key={group.dow}>
            <p className="text-xs text-muted uppercase tracking-wide mb-1">{group.label}</p>
            {group.rows.map((row) => (
              <div
                key={row.id}
                className={`flex items-center justify-between border border-line rounded-md px-3 py-2 mb-1.5 ${
                  row.active ? "" : "opacity-50"
                }`}
              >
                <span className="text-sm text-ink">
                  {formatTime12h(row.startTime)} — {formatTime12h(row.endTime)}
                  {!row.active && <span className="text-xs text-muted ml-2">(disabled)</span>}
                </span>
                <div className="flex gap-3 text-xs">
                  <button onClick={() => handleToggleActive(row)} className="text-muted hover:text-ink">
                    {row.active ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => startEdit(row)} className="text-teal hover:underline">
                    Edit
                  </button>
                  <button onClick={() => handleRemove(row.id)} className="text-danger hover:underline">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="h-px bg-line mb-4" />

      <p className="text-sm font-medium text-ink mb-3">{editingId ? "Edit availability" : "Add availability"}</p>
      <form onSubmit={handleSave} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-muted mb-1">Day</label>
          <select
            value={form.dayOfWeek}
            onChange={(e) => setForm((f) => ({ ...f, dayOfWeek: e.target.value }))}
            className="border border-line rounded-md px-2 py-1.5 text-sm bg-white"
          >
            {DAY_LABELS.map((label, i) => (
              <option key={i} value={i}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Start</label>
          <input
            type="time"
            value={form.startTime}
            onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
            className="border border-line rounded-md px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">End</label>
          <input
            type="time"
            value={form.endTime}
            onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
            className="border border-line rounded-md px-2 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="bg-teal text-white text-sm font-medium px-4 py-1.5 rounded-md hover:bg-teal-dark disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : editingId ? "Update availability" : "Save availability"}
        </button>
        {editingId && (
          <button type="button" onClick={resetForm} className="text-sm text-muted hover:text-ink">
            Cancel
          </button>
        )}
      </form>
      {formError && <p className="text-sm text-danger mt-2">{formError}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upcoming Appointments (Step 13/14). GET /api/appointments already scopes
// to this doctor's own appointments only (backend where-clause derived from
// the authenticated JWT, never a client-supplied doctorId) — no additional
// filtering needed here for ownership.
// ---------------------------------------------------------------------------
function UpcomingAppointments({ accessToken }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch("/api/appointments", {}, accessToken)
      .then((data) => {
        const upcoming = data
          .filter((a) => a.status !== "CANCELLED" && new Date(a.scheduledAt) > new Date())
          .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
        setAppointments(upcoming);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [accessToken]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  function dayLabel(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime()) return "Today";
    if (d.getTime() === tomorrow.getTime()) return "Tomorrow";
    return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  }

  return (
    <div className="bg-white border border-line rounded-lg p-6">
      <p className="font-display text-lg text-ink mb-1">Upcoming Appointments</p>
      <p className="text-sm text-muted mb-4">Patients booked with you.</p>

      {loading && <p className="text-sm text-muted">Loading…</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      {!loading && appointments.length === 0 && !error && (
        <p className="text-sm text-muted">No upcoming appointments yet.</p>
      )}

      <div className="space-y-2">
        {appointments.map((ap) => (
          <div key={ap.id} className="flex items-center justify-between border border-line rounded-md px-3 py-2.5">
            <div>
              <p className="text-xs text-muted">
                {dayLabel(ap.scheduledAt)} ·{" "}
                {new Date(ap.scheduledAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </p>
              <p className="text-sm text-ink mt-0.5">Patient: {ap.patient?.name || "—"}</p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full bg-teal-light text-teal-dark">{ap.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
