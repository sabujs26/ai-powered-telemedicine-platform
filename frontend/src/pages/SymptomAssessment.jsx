import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell.jsx";
import { apiFetch } from "../lib/api.js";
import { useAuth } from "../lib/AuthContext.jsx";

const STRENGTH_LABEL = { strong: "Strong pattern match", moderate: "Moderate pattern match", weak: "Weak pattern match" };

/**
 * Symptom check - FR-05/06/07/08.
 *  - The selectable symptoms come from the model's own vocabulary via GET /api/ai/symptoms.
 *  - Results come from POST /api/ai/predict (Express -> local FastAPI model). There is NO mock fallback:
 *    if the service is down the page says so.
 *  - Emergency warnings come from the BACKEND's red-flag screening, which runs independently of the model,
 *    so they still appear when the AI is unavailable (see e.body.safety below).
 */
export default function SymptomAssessment() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();

  const [catalogue, setCatalogue] = useState([]);
  const [limits, setLimits] = useState({ min: 3, max: 20 });
  const [loadState, setLoadState] = useState("loading"); // loading | ready | unavailable
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]); // symptom keys, in the order picked

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null); // { message, safety }

  useEffect(() => {
    if (!accessToken) return;
    apiFetch("/api/ai/symptoms", {}, accessToken)
      .then((data) => {
        setCatalogue(data.symptoms);
        setLimits({ min: data.minSymptoms, max: data.maxSymptoms });
        setLoadState("ready");
      })
      .catch(() => setLoadState("unavailable"));
  }, [accessToken]);

  const labelByKey = useMemo(() => Object.fromEntries(catalogue.map((s) => [s.key, s.label])), [catalogue]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? catalogue.filter((s) => s.label.toLowerCase().includes(q)) : catalogue;
  }, [catalogue, query]);

  function toggle(key) {
    setResult(null);
    setError(null);
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : prev.length >= limits.max ? prev : [...prev, key]
    );
  }

  async function handleSubmit() {
    setSubmitting(true);
    setResult(null);
    setError(null);
    try {
      setResult(await apiFetch("/api/ai/predict", { method: "POST", body: { symptoms: selected } }, accessToken));
    } catch (err) {
      // The backend attaches its own emergency screening even to error responses.
      setError({ message: err.message, safety: err.body?.safety ?? null });
    } finally {
      setSubmitting(false);
    }
  }

  const safety = result?.safety ?? error?.safety ?? null;
  const canSubmit = selected.length >= limits.min && !submitting;

  return (
    <AppShell>
      <div className="flex items-center gap-3 mb-1">
        <h1 className="font-display text-2xl text-ink">Symptom check</h1>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-light text-amber">Experimental</span>
      </div>
      <p className="text-muted text-sm mb-5">Pick the symptoms you have. This is a pattern-matching aid, not a diagnosis.</p>

      {/* Always visible - does not depend on any model output. */}
      <div className="border border-danger/30 bg-danger-light rounded-lg p-4 mb-4 text-sm text-ink">
        <p className="font-medium text-danger mb-1">In an emergency, don't use this tool</p>
        Chest pain, difficulty breathing, confusion or fainting, heavy bleeding, or weakness on one side of the body:
        call <span className="font-medium">999</span> or go to the nearest hospital now.
      </div>
      <div className="border border-amber/30 bg-amber-light rounded-lg p-4 mb-6 text-sm text-ink">
        This uses a small research model trained on a public dataset. It has <span className="font-medium">not been
        clinically validated</span> and can be wrong. It only knows the symptoms listed below and does not replace a
        doctor.
      </div>

      {loadState === "loading" && <p className="text-sm text-muted">Loading symptoms…</p>}

      {loadState === "unavailable" && (
        <div className="border border-line bg-white rounded-lg p-5 text-sm">
          <p className="text-ink font-medium mb-1">The symptom check is not available right now.</p>
          <p className="text-muted mb-3">You can still search for a doctor yourself.</p>
          <Link to="/patient/doctors" className="text-teal hover:underline">Browse doctors →</Link>
        </div>
      )}

      {loadState === "ready" && (
        <>
          <div className="bg-white border border-line rounded-lg p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-ink">What are you experiencing?</p>
              <p className="text-xs text-muted">
                {selected.length} selected · choose {limits.min}–{limits.max}
              </p>
            </div>

            {selected.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3 pb-3 border-b border-line">
                {selected.map((key) => (
                  <button
                    key={key}
                    onClick={() => toggle(key)}
                    className="px-3 py-1 rounded-full text-sm bg-teal text-white border border-teal"
                    aria-label={`Remove ${labelByKey[key]}`}
                  >
                    {labelByKey[key]} ×
                  </button>
                ))}
              </div>
            )}

            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search symptoms (e.g. headache)"
              className="w-full border border-line rounded-md px-3 py-2 text-sm mb-3"
            />

            <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
              {visible.map((s) => {
                const active = selected.includes(s.key);
                const atMax = !active && selected.length >= limits.max;
                return (
                  <button
                    key={s.key}
                    onClick={() => toggle(s.key)}
                    disabled={atMax}
                    aria-pressed={active}
                    className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                      active
                        ? "bg-teal text-white border-teal"
                        : "border-line text-muted hover:border-teal hover:text-teal disabled:opacity-40 disabled:cursor-not-allowed"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
              {visible.length === 0 && <p className="text-sm text-muted">No symptoms match “{query}”.</p>}
            </div>

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="mt-5 bg-teal text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-teal-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Checking…" : "Check symptoms"}
            </button>
            {selected.length < limits.min && (
              <p className="text-xs text-muted mt-2">Select at least {limits.min} symptoms for a pattern match.</p>
            )}
          </div>
        </>
      )}

      {safety?.urgent && (
        <div role="alert" className="border-2 border-danger bg-danger-light rounded-lg p-5 mb-4 animate-reveal">
          <p className="font-medium text-danger mb-1">Seek urgent medical care</p>
          <p className="text-sm text-ink mb-2">{safety.guidance}</p>
          <p className="text-sm text-ink">Warning signs selected: {safety.reasons.join(", ")}.</p>
        </div>
      )}

      {error && (
        <div className="border border-line bg-white rounded-lg p-5 mb-4 text-sm animate-reveal">
          <p className="text-ink font-medium mb-1">{error.message}</p>
          <p className="text-muted mb-2">No assessment was made.</p>
          <Link to="/patient/doctors" className="text-teal hover:underline">Browse doctors instead →</Link>
        </div>
      )}

      {result && (
        <div className="bg-amber-light border border-amber/30 rounded-lg p-5 animate-reveal">
          <p className="text-xs text-amber font-medium mb-3">
            Experimental pattern match · not a diagnosis · not clinically validated
          </p>

          {result.status === "inconclusive" ? (
            <p className="text-sm text-ink mb-3">
              These symptoms did not match any pattern strongly enough to suggest a likely condition. That is not
              reassurance - a doctor can assess you properly.
            </p>
          ) : (
            <>
              <p className="text-sm text-ink mb-3">
                Patterns these symptoms resemble ({STRENGTH_LABEL[result.matchStrength] ?? "pattern match"}):
              </p>
              <ul className="space-y-2 mb-3">
                {result.predictions.map((p, i) => (
                  <li key={p.label} className="flex items-baseline justify-between border-b border-amber/20 pb-2">
                    <span className={i === 0 ? "font-display text-lg text-ink" : "text-sm text-ink"}>{p.displayName}</span>
                    <span
                      className="text-xs text-muted"
                      title="Raw model output. It is not a probability or a measure of how likely you are to have this."
                    >
                      model score {p.score.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted mb-3">{result.scoreNote}</p>
            </>
          )}

          <div className="h-px bg-amber/20 my-3" />
          <p className="text-sm text-ink">
            Suggested specialty: <span className="font-medium">{result.recommendedSpecialist}</span>{" "}
            <span className="text-xs text-muted">
              ({result.specialtySource === "model" ? "from the model's closest pattern" : "general starting point, not from the model"})
            </span>
          </p>

          {result.specialization ? (
            <button
              onClick={() => navigate(`/patient/doctors?specialty=${encodeURIComponent(result.specialization.name)}`)}
              className="mt-3 bg-ink text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-ink/90 transition-colors"
            >
              Find a {result.specialization.name} doctor
            </button>
          ) : (
            <p className="text-xs text-muted mt-2">No doctors are listed under this specialty yet.</p>
          )}
          <p className="text-xs mt-3">
            <Link to="/patient/doctors" className="text-teal hover:underline">Or browse all doctors →</Link>
          </p>

          <p className="text-xs text-muted mt-4">{result.disclaimer}</p>
          <p className="text-xs text-muted mt-1">
            Model: {result.modelInfo?.name} ({result.modelInfo?.revision}), experimental.
          </p>
        </div>
      )}
    </AppShell>
  );
}
