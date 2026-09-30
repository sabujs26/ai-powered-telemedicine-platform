import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import AppShell from "../components/AppShell.jsx";
import { apiFetch } from "../lib/api.js";
import { formatCurrency } from "../lib/currency.js";
import { useAuth } from "../lib/AuthContext.jsx";

/**
 * Step 6/7: patient doctor discovery. Every filter here is a real backend
 * query parameter (see GET /api/doctors in doctors.js) — nothing is
 * filtered fake-locally, and the availability filter reuses the existing
 * real slot-generation logic server-side rather than duplicating it here.
 *
 * accessToken passed explicitly to apiFetch, consistent with the fix
 * applied elsewhere in this app — see api.js for why the module-level
 * token alone is unsafe right after navigation.
 */
export default function DoctorSearch() {
  const [urlParams] = useSearchParams();
  const { accessToken } = useAuth();

  // The AI symptom-check flow can arrive here with a suggested specialty
  // preselected (Step 10) — but it's just a starting filter, never locked:
  // the patient can change or clear it like any other filter below.
  const [filters, setFilters] = useState({
    specializationId: "",
    specialtyName: urlParams.get("specialty") || "", // display-only label carried from the AI suggestion
    area: "",
    qualification: "",
    minFee: "",
    maxFee: "",
    minExperience: "",
    consultationMode: "",
    date: "",
  });

  const [doctors, setDoctors] = useState([]);
  const [specializations, setSpecializations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Resolve the AI's suggested specialty NAME into a specializationId once
  // the real specialization list has loaded (the AI only knows names).
  useEffect(() => {
    if (!accessToken) return;
    apiFetch("/api/specializations", {}, accessToken)
      .then((list) => {
        setSpecializations(list);
        if (filters.specialtyName) {
          const match = list.find((s) => s.name === filters.specialtyName);
          if (match) setFilters((f) => ({ ...f, specializationId: match.id }));
        }
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function runSearch() {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.specializationId) params.set("specializationId", filters.specializationId);
      if (filters.area) params.set("area", filters.area);
      if (filters.qualification) params.set("qualification", filters.qualification);
      if (filters.minFee) params.set("minFee", filters.minFee);
      if (filters.maxFee) params.set("maxFee", filters.maxFee);
      if (filters.minExperience) params.set("minExperience", filters.minExperience);
      if (filters.consultationMode) params.set("consultationMode", filters.consultationMode);
      if (filters.date) params.set("date", filters.date);

      const list = await apiFetch(`/api/doctors?${params.toString()}`, {}, accessToken);
      setDoctors(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, filters.specializationId]);

  function update(field) {
    return (e) => setFilters((f) => ({ ...f, [field]: e.target.value }));
  }

  function clearSpecialty() {
    setFilters((f) => ({ ...f, specializationId: "", specialtyName: "" }));
  }

  return (
    <AppShell>
      <h1 className="font-display text-2xl text-ink mb-1">Find a doctor</h1>
      <p className="text-muted text-sm mb-6">
        {filters.specialtyName ? (
          <>
            Showing <span className="text-teal font-medium">{filters.specialtyName}</span> matches from your
            symptom check.{" "}
            <button onClick={clearSpecialty} className="text-teal hover:underline">
              Clear filter
            </button>
          </>
        ) : (
          "Search and filter approved doctors, or browse everyone."
        )}
      </p>

      {error && <p className="text-sm text-danger mb-4">{error}</p>}

      <div className="flex flex-wrap gap-2 mb-4">
        <FilterChip
          label="All specialties"
          active={filters.specializationId === ""}
          onClick={() => setFilters((f) => ({ ...f, specializationId: "", specialtyName: "" }))}
        />
        {specializations.map((s) => (
          <FilterChip
            key={s.id}
            label={s.name}
            active={filters.specializationId === s.id}
            onClick={() => setFilters((f) => ({ ...f, specializationId: s.id, specialtyName: s.name }))}
          />
        ))}
      </div>

      <div className="border border-line bg-white rounded-lg p-4 mb-6">
        <div className="grid grid-cols-4 gap-3">
          <Field label="Area" value={filters.area} onChange={update("area")} placeholder="e.g. Dhanmondi" />
          <Field
            label="Qualification"
            value={filters.qualification}
            onChange={update("qualification")}
            placeholder="e.g. FCPS"
          />
          <Field label="Min fee (৳)" type="number" value={filters.minFee} onChange={update("minFee")} />
          <Field label="Max fee (৳)" type="number" value={filters.maxFee} onChange={update("maxFee")} />
          <Field
            label="Min experience (yrs)"
            type="number"
            value={filters.minExperience}
            onChange={update("minExperience")}
          />
          <div>
            <label className="block text-xs text-muted mb-1">Consultation</label>
            <select
              value={filters.consultationMode}
              onChange={update("consultationMode")}
              className="w-full border border-line rounded-md px-2 py-1.5 text-sm bg-white"
            >
              <option value="">Any</option>
              <option value="ONLINE">Online</option>
              <option value="PHYSICAL">Physical</option>
            </select>
          </div>
          <Field label="Available on" type="date" value={filters.date} onChange={update("date")} />
        </div>
        <button
          onClick={runSearch}
          className="mt-3 bg-teal text-white text-sm font-medium px-4 py-1.5 rounded-md hover:bg-teal-dark transition-colors"
        >
          Search
        </button>
      </div>

      {loading && <p className="text-sm text-muted">Loading doctors…</p>}

      <div className="space-y-3">
        {!loading &&
          doctors.map((doc) => (
            <Link
              key={doc.id}
              to={`/patient/doctors/${doc.id}`}
              className="flex items-center justify-between border border-line bg-white rounded-lg p-5 hover:border-teal transition-colors"
            >
              <div>
                <p className="font-display text-lg text-ink">{doc.name}</p>
                <p className="text-sm text-teal">{doc.specialization?.name}</p>
                {doc.qualification && <p className="text-sm text-muted mt-1">{doc.qualification}</p>}
                <div className="flex gap-2 mt-1.5">
                  {(doc.consultationModes === "ONLINE" || doc.consultationModes === "BOTH") && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-teal-light text-teal-dark">Online</span>
                  )}
                  {(doc.consultationModes === "PHYSICAL" || doc.consultationModes === "BOTH") && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-light text-amber">
                      Physical{doc.clinic?.area ? ` · ${doc.clinic.area}` : ""}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0 ml-6">
                <p className="text-sm text-ink font-medium">{formatCurrency(doc.consultationFee) || "Fee not set"}</p>
                {doc.experience !== null && doc.experience !== undefined && (
                  <p className="text-xs text-muted mt-0.5">{doc.experience} yrs experience</p>
                )}
              </div>
            </Link>
          ))}
        {!loading && doctors.length === 0 && (
          <p className="text-sm text-muted border border-line rounded-lg p-5 bg-white">
            No doctors match these filters.
          </p>
        )}
      </div>
    </AppShell>
  );
}

function FilterChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
        active ? "bg-teal text-white border-teal" : "border-line text-muted hover:border-teal hover:text-teal"
      }`}
    >
      {label}
    </button>
  );
}

function Field({ label, ...props }) {
  return (
    <div>
      <label className="block text-xs text-muted mb-1">{label}</label>
      <input {...props} className="w-full border border-line rounded-md px-2 py-1.5 text-sm" />
    </div>
  );
}
