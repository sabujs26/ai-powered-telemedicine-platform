import { Routes, Route } from "react-router-dom";
import { BookingProvider } from "./lib/BookingContext.jsx";
import Login from "./pages/Login.jsx";
import PatientDashboard from "./pages/PatientDashboard.jsx";
import SymptomAssessment from "./pages/SymptomAssessment.jsx";
import DoctorSearch from "./pages/DoctorSearch.jsx";
import DoctorProfile from "./pages/DoctorProfile.jsx";
import BookingConfirm from "./pages/BookingConfirm.jsx";
import Appointments from "./pages/Appointments.jsx";
import DoctorDashboard from "./pages/DoctorDashboard.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";

// NOTE: routes are not yet role-guarded (that's part of Phase 3 — Auth & RBAC
// in the roadmap). Right now every route is reachable directly for demo purposes.
export default function App() {
  return (
    <BookingProvider>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />

        <Route path="/patient" element={<PatientDashboard />} />
        <Route path="/patient/symptoms" element={<SymptomAssessment />} />
        <Route path="/patient/doctors" element={<DoctorSearch />} />
        <Route path="/patient/doctors/:id" element={<DoctorProfile />} />
        <Route path="/patient/book" element={<BookingConfirm />} />
        <Route path="/patient/appointments" element={<Appointments />} />

        <Route path="/doctor" element={<DoctorDashboard />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </BookingProvider>
  );
}
