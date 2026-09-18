import { Link } from "react-router-dom";
import AppShell from "../components/AppShell.jsx";
import { mockAppointments } from "../lib/mockData.js";

export default function PatientDashboard() {
  const upcoming = mockAppointments.find((a) => a.status !== "COMPLETED");

  return (
    <AppShell>
      <h1 className="font-display text-2xl text-ink mb-1">Good afternoon, Aisha</h1>
      <p className="text-muted text-sm mb-8">Here's what's next for your care.</p>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <Link
          to="/patient/symptoms"
          className="border border-line bg-white rounded-lg p-5 hover:border-teal transition-colors group"
        >
          <p className="text-xs text-muted mb-2">Not feeling well?</p>
          <p className="font-display text-lg text-ink group-hover:text-teal transition-colors">
            Check your symptoms
          </p>
          <p className="text-sm text-muted mt-1">Get a preliminary assessment and a specialist match.</p>
        </Link>
        <Link
          to="/patient/doctors"
          className="border border-line bg-white rounded-lg p-5 hover:border-teal transition-colors group"
        >
          <p className="text-xs text-muted mb-2">Know what you need?</p>
          <p className="font-display text-lg text-ink group-hover:text-teal transition-colors">
            Browse doctors directly
          </p>
          <p className="text-sm text-muted mt-1">Search by specialty and book a time that works.</p>
        </Link>
      </div>

      <div className="border border-line bg-white rounded-lg p-5">
        <p className="text-sm font-medium text-ink mb-3">Upcoming appointment</p>
        {upcoming ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-ink">{upcoming.doctorName}</p>
              <p className="text-xs text-muted">{upcoming.specialization}</p>
            </div>
            <p className="text-sm text-muted">
              {new Date(upcoming.startTime).toLocaleString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted">
            No upcoming appointments.{" "}
            <Link to="/patient/doctors" className="text-teal hover:underline">
              Book one
            </Link>
            .
          </p>
        )}
      </div>
    </AppShell>
  );
}
