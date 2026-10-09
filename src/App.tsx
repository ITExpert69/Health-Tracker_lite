import { HashRouter, NavLink, Route, Routes } from "react-router-dom";
import { AppProvider } from "./AppContext";
import Dashboard from "./pages/Dashboard";
import Nutrition from "./pages/Nutrition";
import Weight from "./pages/Weight";
import Lifts from "./pages/Lifts";
import Activities from "./pages/Activities";
import SettingsPage from "./pages/Settings";

const NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/nutrition", label: "Nutrition" },
  { to: "/weight", label: "Weight" },
  { to: "/lifts", label: "Lifts" },
  { to: "/activities/run", label: "Runs" },
  { to: "/activities/ride", label: "Rides" },
  { to: "/activities/swim", label: "Swims" },
];

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <div className="flex h-full">
          <nav className="flex w-48 shrink-0 flex-col gap-0.5 border-r border-line bg-surface p-3">
            <div className="mb-4 px-2 pt-1 text-sm font-semibold">Health Tracker</div>
            {NAV.map((n) => (
              <NavItem key={n.to} to={n.to} label={n.label} />
            ))}
            <div className="mt-auto">
              <NavItem to="/settings" label="Settings & data" />
            </div>
          </nav>
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-6xl p-6">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/nutrition" element={<Nutrition />} />
                <Route path="/weight" element={<Weight />} />
                <Route path="/lifts" element={<Lifts />} />
                <Route path="/activities/:sport" element={<Activities />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </div>
          </main>
        </div>
      </HashRouter>
    </AppProvider>
  );
}

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `rounded-lg px-2 py-1.5 text-sm ${isActive ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface-2"}`
      }
    >
      {label}
    </NavLink>
  );
}
