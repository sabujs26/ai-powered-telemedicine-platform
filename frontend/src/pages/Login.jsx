import { useState } from "react";
import { useNavigate } from "react-router-dom";

// FR-03: Login (all roles). Currently a mock submit that just navigates to
// the patient dashboard — swap handleSubmit for real Firebase auth in
// Phase 3 (frontend/src/lib/firebase.js already has the client set up).
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  function handleSubmit(e) {
    e.preventDefault();
    navigate("/patient");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-2xl text-ink">Telemed</h1>
          <p className="text-sm text-muted mt-1">Find the right specialist, from your symptoms.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-line rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-sm text-ink mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-line rounded-md px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal"
            />
          </div>
          <div>
            <label className="block text-sm text-ink mb-1.5">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-line rounded-md px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-teal text-white rounded-md px-3 py-2.5 text-sm font-medium hover:bg-teal-dark transition-colors"
          >
            Log in
          </button>
        </form>

        <p className="text-center text-xs text-muted mt-4">
          Demo mode — any email/password logs you in as a patient.
        </p>
      </div>
    </div>
  );
}
