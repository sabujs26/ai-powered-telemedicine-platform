import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import AppShell from "../components/AppShell.jsx";
import Calendar from "../components/Calendar.jsx";
import { apiFetch } from "../lib/api.js";
import { formatCurrency } from "../lib/currency.js";
import { formatTime12h, toDateKey } from "../lib/dateFormat.js";
import { useBooking } from "../lib/BookingContext.jsx";
import { useAuth } from "../lib/AuthContext.jsx";

const MAX_BOOKING_WINDOW_DAYS = 30; // mirrors backend/src/lib/scheduling.js — display-only, backend re-enforces this

// Real doctor profile + real recurring weekly availability + REAL dynamically
// generated slots for whatever date the patient actually picks (Step 4/11).
// Nothing here is a static/demo time list — every slot shown came back from
// GET /api/doctors/:id/slots?date=... for that exact date.
export default function DoctorProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { setSelectedDoctor, setSelectedSlot } = useBooking();

  const [doctor, setDoctor] = useState(null);
  const [weeklyAvailability, setWeeklyAvailability] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [slots, setSlots] = useState(null); // null = not yet fetched for the current date
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [slotsError, setSlotsError] = useState(null);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([
      apiFetch(`/api/doctors/${id}`, {}, accessToken),
      apiFetch(`/api/doctors/${id}/availability`, {}, accessToken),
    ])
      .then(([doc, availability]) => {
        setDoctor(doc);
        setWeeklyAvailability(availability);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, accessToken]);

  const availableDaysOfWeek = useMemo(
    () => new Set(weeklyAvailability.map((row) => row.dayOfWeek)),
    [weeklyAvailability]
  );

  const maxDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + MAX_BOOKING_WINDOW_DAYS);
    return d;
  }, []);

  useEffect(() => {
    if (!selectedDate || !accessToken) return;
    setSlots(null);
    setSlotsError(null);
    setSlotsLoading(true);
    const dateStr = toDateKey(selectedDate);
    apiFetch(`/api/doctors/${id}/slots?date=${dateStr}`, {}, accessToken)
      .then((data) => setSlots(data.slots))
      .catch((err) => setSlotsError(err.message))
      .finally(() => setSlotsLoading(false));
  }, [selectedDate, id, accessToken]);

  function handleSelectSlot(slot) {
    setSelectedDoctor(doctor);
    setSelectedSlot(slot); // { time: "HH:mm", datetime: ISO string } — exactly as returned by the backend
    navigate("/patient/book");
  }

  if (loading) {
    return (
      <AppShell>
        <p className="text-sm text-muted">Loading doctor profile…</p>
      </AppShell>
    );
  }

  if (error || !doctor) {
    return (
      <AppShell>
        <Link to="/patient/doctors" className="text-sm text-muted hover:text-teal">
          ← Back to search
        </Link>
        <p className="text-sm text-danger mt-4">{error || "Doctor not found."}</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link to="/patient/doctors" className="text-sm text-muted hover:text-teal">
        ← Back to search
      </Link>

      <div className="mt-4 bg-white border border-line rounded-lg p-6 mb-6">
        <p className="font-display text-2xl text-ink">{doctor.name}</p>
        <p className="text-teal text-sm mt-1">{doctor.specialization?.name}</p>
        {doctor.qualification && <p className="text-sm text-muted mt-3 max-w-lg">{doctor.qualification}</p>}
        <p className="text-sm text-ink mt-4 font-medium">
          {formatCurrency(doctor.consultationFee) || "Consultation fee not set"} per consultation
        </p>
      </div>

      {weeklyAvailability.length === 0 ? (
        <div className="border border-line bg-white rounded-lg p-5 text-sm text-muted">
          This doctor hasn't set their availability yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6 items-start">
          <div>
            <p className="text-sm font-medium text-ink mb-3">Select a date</p>
            <Calendar
              selectedDate={selectedDate}
              onSelect={setSelectedDate}
              availableDaysOfWeek={availableDaysOfWeek}
              minDate={new Date()}
              maxDate={maxDate}
            />
          </div>

          <div>
            <p className="text-sm font-medium text-ink mb-3">
              {selectedDate
                ? `Available times — ${selectedDate.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}`
                : "Available times"}
            </p>

            {!selectedDate && (
              <div className="border border-line bg-white rounded-lg p-5 text-sm text-muted">
                Pick a date on the calendar to see real available times.
              </div>
            )}

            {selectedDate && slotsLoading && (
              <div className="border border-line bg-white rounded-lg p-5 text-sm text-muted">
                Loading available times…
              </div>
            )}

            {selectedDate && slotsError && (
              <div className="border border-danger/30 bg-danger-light rounded-lg p-4 text-sm text-danger">
                {slotsError}
              </div>
            )}

            {selectedDate && !slotsLoading && !slotsError && slots && slots.length === 0 && (
              <div className="border border-line bg-white rounded-lg p-5 text-sm text-muted">
                No available times on this date — every slot is already booked.
              </div>
            )}

            {selectedDate && !slotsLoading && slots && slots.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {slots.map((slot) => (
                  <button
                    key={slot.datetime}
                    onClick={() => handleSelectSlot(slot)}
                    className="px-3 py-1.5 rounded-md text-sm border border-line text-ink hover:border-teal hover:bg-teal-light hover:text-teal-dark transition-colors"
                  >
                    {formatTime12h(slot.time)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
