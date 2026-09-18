import { useParams, useNavigate, Link } from "react-router-dom";
import AppShell from "../components/AppShell.jsx";
import { doctors } from "../lib/mockData.js";
import { useBooking } from "../lib/BookingContext.jsx";

export default function DoctorProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { setSelectedDoctor, setSelectedSlot } = useBooking();
  const doctor = doctors.find((d) => d.id === id);

  if (!doctor) {
    return (
      <AppShell>
        <p className="text-sm text-muted">Doctor not found.</p>
      </AppShell>
    );
  }

  function handleSelectSlot(slot) {
    setSelectedDoctor(doctor);
    setSelectedSlot(slot);
    navigate("/patient/book");
  }

  const byDay = doctor.availability.reduce((acc, slot) => {
    const day = new Date(slot.startTime).toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    acc[day] = acc[day] || [];
    acc[day].push(slot);
    return acc;
  }, {});

  return (
    <AppShell>
      <Link to="/patient/doctors" className="text-sm text-muted hover:text-teal">
        ← Back to search
      </Link>

      <div className="mt-4 bg-white border border-line rounded-lg p-6 mb-6">
        <p className="font-display text-2xl text-ink">{doctor.name}</p>
        <p className="text-teal text-sm mt-1">{doctor.specialization}</p>
        <p className="text-sm text-muted mt-3 max-w-lg">{doctor.bio}</p>
        <p className="text-sm text-ink mt-4 font-medium">${doctor.consultationFee} per consultation</p>
      </div>

      <p className="text-sm font-medium text-ink mb-3">Available times</p>
      <div className="space-y-4">
        {Object.entries(byDay).map(([day, slots]) => (
          <div key={day}>
            <p className="text-xs text-muted mb-2">{day}</p>
            <div className="flex flex-wrap gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.id}
                  onClick={() => handleSelectSlot(slot)}
                  className="px-3 py-1.5 rounded-md text-sm border border-line text-ink hover:border-teal hover:bg-teal-light hover:text-teal-dark transition-colors"
                >
                  {new Date(slot.startTime).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
