import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import AppShell from "../components/AppShell.jsx";
import { useBooking } from "../lib/BookingContext.jsx";

export default function BookingConfirm() {
  const { selectedDoctor, selectedSlot } = useBooking();
  const [status, setStatus] = useState("review"); // review -> paying -> done
  const navigate = useNavigate();

  if (!selectedDoctor || !selectedSlot) {
    return <Navigate to="/patient/doctors" replace />;
  }

  function handlePay() {
    setStatus("paying");
    // Stands in for the real Stripe Checkout redirect (backend/src/routes/payments.js
    // already implements this server-side — see checkout + webhook handlers).
    setTimeout(() => setStatus("done"), 1200);
  }

  if (status === "done") {
    return (
      <AppShell>
        <div className="max-w-md bg-white border border-line rounded-lg p-6 text-center animate-reveal">
          <p className="font-display text-xl text-ink mb-1">Appointment confirmed</p>
          <p className="text-sm text-muted mb-5">
            {selectedDoctor.name} ·{" "}
            {new Date(selectedSlot.startTime).toLocaleString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
          <button
            onClick={() => navigate("/patient/appointments")}
            className="bg-teal text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-teal-dark transition-colors"
          >
            View appointments
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="font-display text-2xl text-ink mb-1">Confirm & pay</h1>
      <p className="text-muted text-sm mb-6">Review your appointment before paying.</p>

      <div className="bg-white border border-line rounded-lg p-6 max-w-md">
        <div className="space-y-3 text-sm">
          <Row label="Doctor" value={selectedDoctor.name} />
          <Row label="Specialty" value={selectedDoctor.specialization} />
          <Row
            label="Time"
            value={new Date(selectedSlot.startTime).toLocaleString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          />
        </div>
        <div className="h-px bg-line my-4" />
        <div className="flex justify-between items-center mb-5">
          <p className="text-sm text-ink font-medium">Total</p>
          <p className="text-lg font-display text-ink">${selectedDoctor.consultationFee}</p>
        </div>
        <button
          onClick={handlePay}
          disabled={status === "paying"}
          className="w-full bg-teal text-white text-sm font-medium px-4 py-2.5 rounded-md hover:bg-teal-dark disabled:opacity-60 transition-colors"
        >
          {status === "paying" ? "Processing payment…" : "Pay & confirm"}
        </button>
        <p className="text-xs text-muted text-center mt-3">
          Free cancellation up to 6 hours before your appointment.
        </p>
      </div>
    </AppShell>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  );
}
