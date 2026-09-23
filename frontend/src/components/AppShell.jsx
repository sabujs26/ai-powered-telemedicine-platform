import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.jsx";

const navItems = [
  { to: "/patient", label: "Dashboard", icon: HomeIcon },
  { to: "/patient/symptoms", label: "Symptom check", icon: PulseIcon },
  { to: "/patient/doctors", label: "Find a doctor", icon: SearchIcon },
  { to: "/patient/appointments", label: "Appointments", icon: CalendarIcon },
];

export default function AppShell({ children }) {

  const { logout, user } = useAuth();
  const navigate = useNavigate();
  
  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 border-r border-line bg-white flex flex-col">
        <div className="px-6 py-6">
          <h1 className="font-display text-xl text-ink">Telemed</h1>
          <p className="text-xs text-muted mt-0.5">Patient portal</p>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/patient"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive ? "bg-teal-light text-teal-dark font-medium" : "text-muted hover:bg-bg hover:text-ink"
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-6 py-4 border-t border-line">
           <p className="text-xs text-muted">Signed in as</p>
           <p className="text-sm text-ink">{user?.email}</p>

            <button
              onClick={async () => {
              await logout();
              navigate("/login");
              }}
              className="mt-3 text-sm text-muted hover:text-ink transition-colors"
            >
             Logout
           </button>
        </div>
      </aside>
      <main className="flex-1 px-10 py-8 max-w-4xl">{children}</main>
    </div>
  );
}

function HomeIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M3 9.5 10 3l7 6.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 8.5V17h10V8.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PulseIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <path d="M2 10h3.5l1.8-5 3 10 2-7 1.2 2h4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function SearchIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="m17 17-4-4" strokeLinecap="round" />
    </svg>
  );
}
function CalendarIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <rect x="3" y="4.5" width="14" height="12" rx="1.5" />
      <path d="M3 8.5h14M7 2.5v3M13 2.5v3" strokeLinecap="round" />
    </svg>
  );
}
