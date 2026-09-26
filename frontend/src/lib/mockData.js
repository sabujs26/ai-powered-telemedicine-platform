// Doctor/specialization/appointment mock data was removed in the "Doctor
// Availability + Real Appointment Scheduling" increment — the entire patient
// booking journey (DoctorSearch, DoctorProfile, BookingConfirm,
// PatientDashboard, Appointments) now calls the real backend.
//
// mockPredict remains: the AI symptom-assessment demo (SymptomAssessment.jsx)
// is a separate, unrelated feature — out of scope for this increment.

// Mirrors the AI service's real /predict response shape (Section 12 + ai-service/main.py).
export function mockPredict(symptoms) {
  const normalized = symptoms.map((s) => s.toLowerCase());
  const emergencyList = ["chest pain", "difficulty breathing", "loss of consciousness"];
  const emergencyFlag = normalized.some((s) => emergencyList.includes(s));

  if (emergencyFlag) {
    return { predictions: [], emergencyFlag: true, recommendedSpecialist: null };
  }

  if (normalized.some((s) => s.includes("headache") || s.includes("migraine") || s.includes("light"))) {
    return {
      predictions: [{ condition: "Migraine", confidence: 0.78 }],
      emergencyFlag: false,
      recommendedSpecialist: "Neurologist",
    };
  }

  return {
    predictions: [{ condition: "Common Cold", confidence: 0.64 }],
    emergencyFlag: false,
    recommendedSpecialist: "General Physician",
  };
}
