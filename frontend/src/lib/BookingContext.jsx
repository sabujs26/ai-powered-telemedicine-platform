import { createContext, useContext, useState } from "react";

// Holds state across the Symptom Check -> Find a Doctor -> Book flow,
// so the recommended specialist carries forward without prop-drilling.
// This is in-memory only, per the "no localStorage in this stage" note —
// swap for real appointment records once the backend is wired up.
const BookingContext = createContext(null);

export function BookingProvider({ children }) {
  const [assessment, setAssessment] = useState(null); // AI result
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);

  return (
    <BookingContext.Provider
      value={{ assessment, setAssessment, selectedDoctor, setSelectedDoctor, selectedSlot, setSelectedSlot }}
    >
      {children}
    </BookingContext.Provider>
  );
}

export function useBooking() {
  return useContext(BookingContext);
}
