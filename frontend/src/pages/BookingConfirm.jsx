import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import AppShell from "../components/AppShell.jsx";
import { useBooking } from "../lib/BookingContext.jsx";
import { useAuth } from "../lib/AuthContext.jsx";
import { apiFetch } from "../lib/api.js";
import { formatCurrency } from "../lib/currency.js";
import { formatTime12h } from "../lib/dateFormat.js";

/**
 * Books the REAL selected slot via POST /api/appointments. This step does
 * NOT simulate a payment — online payment (Stripe) isn't wired into this
 * screen yet, so the appointment is created and honestly shown in its real
 * PENDING_PAYMENT status rather than being presented as "confirmed." This
 * matches the current project architecture: Stripe checkout/webhook already
 * exist server-side (backend/src/routes/payments.js) for a future increment
 * to connect here.
 */
export default function BookingConfirm() {
  const { selectedDoctor, selectedSlot } = useBooking();
  const { accessToken } = useAuth();
  const [status, setStatus] = useState("review"); // review -> booking -> done
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  if (!selectedDoctor || !selectedSlot) {
    return <Navigate to="/patient/doctors" replace />;
  }

  async function handleBook() {
    setStatus("booking");
    setError(null);
    try {
      await apiFetch(
        "/api/appointments",
        { method: "POST", body: { doctorId: selectedDoctor.id, scheduledAt: selectedSlot.datetime } },
        accessToken
      );
      setStatus("done");
    } catch (err) {
      setError(
        err.message === "This appointment slot is no longer available."
          ? err.message // already a clear, human-readable message from the backend
          : `Couldn't book this appointment: ${err.message}`
      );
      setStatus("review");
    }
  }

  const slotDate = new Date(selectedSlot.datetime);

  if (status === "done") {
    return (
      <AppShell>
        <div className="max-w-md bg-white border border-line rounded-lg p-6 text-center animate-reveal">
          <p className="font-display text-xl text-ink mb-1">Appointment requested</p>
          <p className="text-sm text-muted mb-4">
            {selectedDoctor.name} ·{" "}
            {slotDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} ·{" "}
            {formatTime12h(selectedSlot.time)}
          </p>
          <span className="inline-block text-xs px-2.5 py-1 rounded-full bg-amber-light text-amber mb-4">
            PENDING PAYMENT
          </span>
          <p className="text-xs text-muted mb-5">
            Your slot is held. Online payment isn't connected to this screen yet — an admin or a future
            payment step will confirm it.
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
      <h1 className="font-display text-2xl text-ink mb-1">Confirm appointment</h1>
      <p className="text-muted text-sm mb-6">Review your appointment before requesting it.</p>

      <div className="bg-white border border-line rounded-lg p-6 max-w-md">
        <div className="space-y-3 text-sm">
          <Row label="Doctor" value={selectedDoctor.name} />
          <Row label="Specialty" value={selectedDoctor.specialization?.name} />
          <Row
            label="Date"
            value={slotDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          />
          <Row label="Time" value={formatTime12h(selectedSlot.time)} />
        </div>
        <div className="h-px bg-line my-4" />
        <div className="flex justify-between items-center mb-5">
          <p className="text-sm text-ink font-medium">Consultation fee</p>
          <p className="text-lg font-display text-ink">
            {formatCurrency(selectedDoctor.consultationFee) || "Not set"}
          </p>
        </div>

        {error && <p className="text-sm text-danger mb-4">{error}</p>}

        <button
          onClick={handleBook}
          disabled={status === "booking"}
          className="w-full bg-teal text-white text-sm font-medium px-4 py-2.5 rounded-md hover:bg-teal-dark disabled:opacity-60 transition-colors"
        >
          {status === "booking" ? "Booking…" : "Book appointment"}
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
