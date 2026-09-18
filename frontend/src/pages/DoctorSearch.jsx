import { useState, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import AppShell from "../components/AppShell.jsx";
import { doctors, specializations } from "../lib/mockData.js";

export default function DoctorSearch() {
  const [searchParams] = useSearchParams();
  const [specialty, setSpecialty] = useState(searchParams.get("specialty") || "");

  const filtered = useMemo(
    () => (specialty ? doctors.filter((d) => d.specialization === specialty) : doctors),
    [specialty]
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

      <div className="flex flex-wrap gap-2 mb-6">
        <FilterChip label="All" active={specialty === ""} onClick={() => setSpecialty("")} />
        {specializations.map((s) => (
          <FilterChip key={s.id} label={s.name} active={specialty === s.name} onClick={() => setSpecialty(s.name)} />
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((doc) => (
          <Link
            key={doc.id}
            to={`/patient/doctors/${doc.id}`}
            className="flex items-center justify-between border border-line bg-white rounded-lg p-5 hover:border-teal transition-colors"
          >
            <div>
              <p className="font-display text-lg text-ink">{doc.name}</p>
              <p className="text-sm text-teal">{doc.specialization}</p>
              <p className="text-sm text-muted mt-1 max-w-md">{doc.bio}</p>
            </div>
            <div className="text-right shrink-0 ml-6">
              <p className="text-sm text-ink font-medium">${doc.consultationFee}</p>
              <p className="text-xs text-muted mt-0.5">{doc.availability.length} slots open</p>
            </div>
          </Link>
        ))}
        {filtered.length === 0 && (
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
