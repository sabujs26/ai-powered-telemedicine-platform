import AppShell from "../components/AppShell.jsx";
import { mockAppointments } from "../lib/mockData.js";

export default function Appointments() {
  return (
    <AppShell>
      <h1 className="font-display text-2xl text-ink mb-1">Appointments</h1>
      <p className="text-muted text-sm mb-6">Your consultation history.</p>

      <div className="space-y-3">
        {mockAppointments.map((ap) => (
          <div key={ap.id} className="flex items-center justify-between border border-line bg-white rounded-lg p-5">
            <div>
              <p className="text-sm text-ink font-medium">{ap.doctorName}</p>
              <p className="text-sm text-muted">{ap.specialization}</p>
              <p className="text-xs text-muted mt-1">
                {new Date(ap.startTime).toLocaleString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <div className="text-right">
              <span className="inline-block text-xs px-2 py-1 rounded-full bg-teal-light text-teal-dark">
                {ap.status}
              </span>
              {ap.prescriptionAvailable && (
                <p className="text-xs text-teal mt-2 cursor-pointer hover:underline">View prescription</p>
              )}
            </div>
          </div>
        ))}
        {mockAppointments.length === 0 && (
          <p className="text-sm text-muted border border-line rounded-lg p-5 bg-white">
            No appointments yet.
          </p>
        )}
      </div>
    </AppShell>
  );
}
