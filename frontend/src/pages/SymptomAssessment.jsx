import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell.jsx";
import { mockPredict } from "../lib/mockData.js";
import { useBooking } from "../lib/BookingContext.jsx";

const COMMON_SYMPTOMS = ["Headache", "Fever", "Cough", "Nausea", "Sensitivity to light", "Fatigue", "Sore throat"];

export default function SymptomAssessment() {
  const [selected, setSelected] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const { setAssessment } = useBooking();
  const navigate = useNavigate();

  function toggleSymptom(symptom) {
    setResult(null);
    setSelected((prev) => (prev.includes(symptom) ? prev.filter((s) => s !== symptom) : [...prev, symptom]));
  }

  function handleCheck() {
    if (selected.length === 0) return;
    setLoading(true);
    // Simulates the AI service round-trip (mockPredict mirrors the real
    // /api/ai/predict contract exactly — see lib/mockData.js).
    setTimeout(() => {
      const prediction = mockPredict(selected);
      setResult(prediction);
      setAssessment(prediction);
      setLoading(false);
    }, 700);
  }

  return (
    <AppShell>
      <h1 className="font-display text-2xl text-ink mb-1">Symptom check</h1>
      <p className="text-muted text-sm mb-6">
        Select what you're experiencing. This is a preliminary check, not a diagnosis.
      </p>

      <div className="bg-white border border-line rounded-lg p-5 mb-6">
        <p className="text-sm font-medium text-ink mb-3">What are you feeling?</p>
        <div className="flex flex-wrap gap-2">
          {COMMON_SYMPTOMS.map((symptom) => {
            const active = selected.includes(symptom);
            return (
              <button
                key={symptom}
                onClick={() => toggleSymptom(symptom)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  active
                    ? "bg-teal text-white border-teal"
                    : "border-line text-muted hover:border-teal hover:text-teal"
                }`}
              >
                {symptom}
              </button>
            );
          })}
        </div>

        <button
          onClick={handleCheck}
          disabled={selected.length === 0 || loading}
          className="mt-5 bg-teal text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-teal-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Checking…" : "Get assessment"}
        </button>
      </div>

      {result?.emergencyFlag && (
        <div className="bg-danger-light border border-danger/30 rounded-lg p-5 animate-reveal">
          <p className="text-sm font-medium text-danger">This may need urgent attention</p>
          <p className="text-sm text-ink mt-1.5">
            Based on what you've selected, please seek emergency care immediately. This app is not a
            substitute for emergency services.
          </p>
        </div>
      )}

      {result && !result.emergencyFlag && (
        <div className="bg-amber-light border border-amber/30 rounded-lg p-5 animate-reveal">
          <p className="text-xs text-amber font-medium mb-2">AI-generated · preliminary, not a diagnosis</p>
          <p className="font-display text-lg text-ink">{result.predictions[0].condition}</p>
          <p className="text-sm text-muted mt-1">
            {Math.round(result.predictions[0].confidence * 100)}% confidence
          </p>
          <div className="h-px bg-amber/20 my-4" />
          <p className="text-sm text-ink">
            Recommended specialist: <span className="font-medium">{result.recommendedSpecialist}</span>
          </p>
          <button
            onClick={() => navigate(`/patient/doctors?specialty=${encodeURIComponent(result.recommendedSpecialist)}`)}
            className="mt-4 bg-ink text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-ink/90 transition-colors"
          >
            Find a {result.recommendedSpecialist}
          </button>
        </div>
      )}
    </AppShell>
  );
}
