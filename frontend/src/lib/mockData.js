// Mock data standing in for backend responses while the frontend is built
// ahead of full API wiring (per the "mock data now, wire up later" decision).
// Shapes intentionally match the real API contract in Section 12 of the
// requirements baseline, so swapping in real `apiFetch` calls later is a
// drop-in replacement — see lib/api.js.

export const specializations = [
  { id: "sp1", name: "General Physician" },
  { id: "sp2", name: "Neurologist" },
  { id: "sp3", name: "Dermatologist" },
  { id: "sp4", name: "Gastroenterologist" },
  { id: "sp5", name: "Cardiologist" },
];

export const doctors = [
  {
    id: "d1",
    name: "Dr. Farhana Rahman",
    specializationId: "sp2",
    specialization: "Neurologist",
    consultationFee: 25,
    bio: "12 years of experience treating migraine and neurological disorders.",
    availability: [
      { id: "a1", startTime: "2026-09-21T10:00:00", endTime: "2026-09-21T10:30:00" },
      { id: "a2", startTime: "2026-09-21T11:00:00", endTime: "2026-09-21T11:30:00" },
      { id: "a3", startTime: "2026-09-22T09:00:00", endTime: "2026-09-22T09:30:00" },
    ],
  },
  {
    id: "d2",
    name: "Dr. Imran Hossain",
    specializationId: "sp2",
    specialization: "Neurologist",
    consultationFee: 30,
    bio: "Specializes in chronic headache and sleep-related neurological conditions.",
    availability: [
      { id: "a4", startTime: "2026-09-21T14:00:00", endTime: "2026-09-21T14:30:00" },
      { id: "a5", startTime: "2026-09-23T10:00:00", endTime: "2026-09-23T10:30:00" },
    ],
  },
  {
    id: "d3",
    name: "Dr. Nusrat Jahan",
    specializationId: "sp1",
    specialization: "General Physician",
    consultationFee: 15,
    bio: "General checkups, colds, and preliminary assessments for all ages.",
    availability: [
      { id: "a6", startTime: "2026-09-21T09:00:00", endTime: "2026-09-21T09:30:00" },
      { id: "a7", startTime: "2026-09-21T09:30:00", endTime: "2026-09-21T10:00:00" },
    ],
  },
];

export const mockAppointments = [
  {
    id: "ap1",
    doctorName: "Dr. Farhana Rahman",
    specialization: "Neurologist",
    startTime: "2026-09-14T10:00:00",
    status: "COMPLETED",
    prescriptionAvailable: true,
  },
];

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
