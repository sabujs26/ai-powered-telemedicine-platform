import { Routes, Route } from "react-router-dom";
import { BookingProvider } from "./lib/BookingContext.jsx";
import ProtectedRoute from "./lib/ProtectedRoute.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import PatientDashboard from "./pages/PatientDashboard.jsx";
import SymptomAssessment from "./pages/SymptomAssessment.jsx";
import DoctorSearch from "./pages/DoctorSearch.jsx";
import DoctorProfile from "./pages/DoctorProfile.jsx";
import BookingConfirm from "./pages/BookingConfirm.jsx";
import Appointments from "./pages/Appointments.jsx";
import DoctorDashboard from "./pages/DoctorDashboard.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";

export default function App() {
  return (
    <BookingProvider>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route
          path="/patient"
          element={
            <ProtectedRoute allowedRoles={["PATIENT"]}>
              <PatientDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/patient/symptoms"
          element={
            <ProtectedRoute allowedRoles={["PATIENT"]}>
              <SymptomAssessment />
            </ProtectedRoute>
          }
        />
        <Route
          path="/patient/doctors"
          element={
            <ProtectedRoute allowedRoles={["PATIENT"]}>
              <DoctorSearch />
            </ProtectedRoute>
          }
        />
        <Route
          path="/patient/doctors/:id"
          element={
            <ProtectedRoute allowedRoles={["PATIENT"]}>
              <DoctorProfile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/patient/book"
          element={
            <ProtectedRoute allowedRoles={["PATIENT"]}>
              <BookingConfirm />
            </ProtectedRoute>
          }
        />
        <Route
          path="/patient/appointments"
          element={
            <ProtectedRoute allowedRoles={["PATIENT"]}>
              <Appointments />
            </ProtectedRoute>
          }
        />

        <Route
          path="/doctor"
          element={
            <ProtectedRoute allowedRoles={["DOCTOR"]}>
              <DoctorDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={["ADMIN"]}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BookingProvider>
  );
}
