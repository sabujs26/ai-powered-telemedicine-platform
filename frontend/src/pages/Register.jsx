import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.jsx";

// FR-01: Patient self-registration. Role is never sent from the client —
// the backend always creates PATIENT accounts through this endpoint
// (see backend/src/routes/auth.js).
export default function Register() {
  const [form, setForm] = useState({ name: "", email: "", password: "", contactInfo: "" });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(form);
      navigate("/patient");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-2xl text-ink">Create your account</h1>
          <p className="text-sm text-muted mt-1">Patient registration only — doctors are added by an admin.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-line rounded-lg p-6 space-y-4">
          <Field label="Full name" type="text" value={form.name} onChange={update("name")} required />
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
          <Field
            label="Contact info (optional)"
            type="text"
            value={form.contactInfo}
            onChange={update("contactInfo")}
          />
          {error && <p className="text-danger text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-teal text-white rounded-md px-3 py-2.5 text-sm font-medium hover:bg-teal-dark disabled:opacity-60 transition-colors"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="text-center text-xs text-muted mt-4">
          Already have an account?{" "}
          <Link to="/login" className="text-teal hover:underline">
            Log in
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
