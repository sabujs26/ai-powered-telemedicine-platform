import { useState, useMemo, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import AppShell from "../components/AppShell.jsx";
import { apiFetch } from "../lib/api.js";
import { formatCurrency } from "../lib/currency.js";
import { useAuth } from "../lib/AuthContext.jsx";

// Real backend data only: GET /api/doctors already filters to
// approvalStatus=APPROVED (Step 10) — pending/rejected/disabled doctors are
// never returned here, so no client-side filtering for that is needed.
//
// accessToken is read from useAuth() and passed explicitly to apiFetch,
// consistent with the fix applied to AdminDashboard/DoctorDashboard — see
// api.js for why relying on the module-level token alone is unsafe right
// after navigation.
export default function DoctorSearch() {
  const [searchParams] = useSearchParams();
  const { accessToken } = useAuth();
  const [specialty, setSpecialty] = useState(searchParams.get("specialty") || "");
  const [doctors, setDoctors] = useState([]);
  const [specializations, setSpecializations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([
      apiFetch("/api/doctors", {}, accessToken),
      apiFetch("/api/specializations", {}, accessToken),
    ])
      .then(([doctorList, specList]) => {
        setDoctors(doctorList);
        setSpecializations(specList);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [accessToken]);

  const filtered = useMemo(
    () => (specialty ? doctors.filter((d) => d.specialization?.name === specialty) : doctors),
    [specialty, doctors]
  );

  return (
    <AppShell>
      <h1 className="font-display text-2xl text-ink mb-1">Find a doctor</h1>
      <p className="text-muted text-sm mb-6">
        {specialty ? (
          <>
            Showing <span className="text-teal font-medium">{specialty}</span> matches from your symptom
            check.{" "}
            <button onClick={() => setSpecialty("")} className="text-teal hover:underline">
              Clear filter
            </button>
          </>
        ) : (
          "Browse by specialty or view everyone."
        )}
      </p>

      {error && <p className="text-sm text-danger mb-4">{error}</p>}

      <div className="flex flex-wrap gap-2 mb-6">
        <FilterChip label="All" active={specialty === ""} onClick={() => setSpecialty("")} />
        {specializations.map((s) => (
          <FilterChip key={s.id} label={s.name} active={specialty === s.name} onClick={() => setSpecialty(s.name)} />
        ))}
      </div>

      {loading && <p className="text-sm text-muted">Loading doctors…</p>}

      <div className="space-y-3">
        {!loading &&
          filtered.map((doc) => (
            <Link
              key={doc.id}
              to={`/patient/doctors/${doc.id}`}
              className="flex items-center justify-between border border-line bg-white rounded-lg p-5 hover:border-teal transition-colors"
            >
              <div>
                <p className="font-display text-lg text-ink">{doc.name}</p>
                <p className="text-sm text-teal">{doc.specialization?.name}</p>
                {doc.qualification && <p className="text-sm text-muted mt-1 max-w-md">{doc.qualification}</p>}
              </div>
              <div className="text-right shrink-0 ml-6">
                <p className="text-sm text-ink font-medium">
                  {formatCurrency(doc.consultationFee) || "Fee not set"}
                </p>
              </div>
            </Link>
          ))}
        {!loading && filtered.length === 0 && (
          <p className="text-sm text-muted border border-line rounded-lg p-5 bg-white">
            No doctors found for this specialty yet.
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
