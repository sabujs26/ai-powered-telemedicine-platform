import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

// Doctor self-registration → PENDING approval (see backend/src/routes/auth.js
// POST /api/auth/register-doctor). This is intentionally separate from
// Register.jsx (patient self-registration) — a doctor never gets an
// immediate session; they see a submitted/pending state instead.
export default function RegisterDoctor() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    contactInfo: "",
    qualification: "",
    registrationNumber: "",
    specializationId: "",
    consultationFee: "",
  });
  const [specializations, setSpecializations] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/specializations`)
      .then((res) => res.json())
      .then(setSpecializations)
      .catch(() => setError("Could not load specializations — is the backend running?"));
  }, []);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/register-doctor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          consultationFee: form.consultationFee ? Number(form.consultationFee) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Application failed");
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-6">
        <div className="max-w-sm w-full bg-white border border-line rounded-lg p-6 text-center animate-reveal">
          <p className="font-display text-xl text-ink mb-2">Application submitted</p>
          <p className="text-sm text-muted">
            Your doctor application has been submitted and is awaiting admin approval. You'll be able to
            log in once it's reviewed.
          </p>
          <Link to="/login" className="inline-block mt-5 text-sm text-teal hover:underline">
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-6 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-display text-2xl text-ink">Apply as a doctor</h1>
          <p className="text-sm text-muted mt-1">Your application will be reviewed by an admin before you can log in.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-line rounded-lg p-6 space-y-4">
          <Field label="Full name" value={form.name} onChange={update("name")} required />
          <Field label="Email" type="email" value={form.email} onChange={update("email")} required />
          <Field
            label="Password"
            type="password"
            value={form.password}
            onChange={update("password")}
            required
            minLength={8}
            hint="At least 8 characters"
          />

          <div>
            <label className="block text-sm text-ink mb-1.5">Specialization</label>
            <select
              value={form.specializationId}
              onChange={update("specializationId")}
              required
              className="w-full border border-line rounded-md px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal bg-white"
            >
              <option value="" disabled>
                Select a specialization
              </option>
              {specializations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <Field
            label="Qualification"
            value={form.qualification}
            onChange={update("qualification")}
            required
            placeholder="e.g. MBBS, FCPS (Medicine)"
          />
          <Field
            label="Registration number"
            value={form.registrationNumber}
            onChange={update("registrationNumber")}
            required
            placeholder="e.g. BM&DC registration number"
          />
          <Field
            label="Consultation fee (optional)"
            type="number"
            min="0"
            value={form.consultationFee}
            onChange={update("consultationFee")}
          />
          <Field
            label="Contact info (optional)"
            value={form.contactInfo}
            onChange={update("contactInfo")}
          />

          {error && <p className="text-danger text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-teal text-white rounded-md px-3 py-2.5 text-sm font-medium hover:bg-teal-dark disabled:opacity-60 transition-colors"
          >
            {loading ? "Submitting…" : "Submit application"}
          </button>
        </form>

        <p className="text-center text-xs text-muted mt-4">
          Not a doctor?{" "}
          <Link to="/register" className="text-teal hover:underline">
            Register as a patient
          </Link>
        </p>
      </div>
    </div>
  );
}

function Field({ label, hint, ...props }) {
  return (
    <div>
      <label className="block text-sm text-ink mb-1.5">{label}</label>
      <input
        {...props}
        className="w-full border border-line rounded-md px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal"
      />
      {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
    </div>
  );
}
