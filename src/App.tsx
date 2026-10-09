import type { ReactNode } from "react";
import { HashRouter, NavLink, Route, Routes } from "react-router-dom";
import { AppProvider } from "./AppContext";
import Dashboard from "./pages/Dashboard";
import Nutrition from "./pages/Nutrition";
import Weight from "./pages/Weight";
import Lifts from "./pages/Lifts";
import Activities from "./pages/Activities";
import SettingsPage from "./pages/Settings";
import { BackupReminder } from "./components/BackupReminder";

// 24px stroke icons, drawn with currentColor so they follow the text colour.
const ic = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);
const ICONS = {
  home: ic(<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />),
  food: ic(<><path d="M7 3v8a2 2 0 0 0 2 2v8" /><path d="M11 3v8a2 2 0 0 1-2 2" /><path d="M17 21V3c-2 1-3 4-3 8h3" /></>),
  weight: ic(<><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M8 9a4 4 0 0 1 8 0z" /><path d="M12 9l1.5-2" /></>),
  lift: ic(<><path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12" /></>),
  run: ic(<><circle cx="15" cy="4.5" r="1.8" /><path d="M10 21l2.5-5.5L10 12l3-4 2.5 3.5H19" /><path d="M7 11l3-3" /><path d="M12.5 15.5L16 18v3" /></>),
  ride: ic(<><circle cx="5.5" cy="16.5" r="3.5" /><circle cx="18.5" cy="16.5" r="3.5" /><path d="M5.5 16.5L9 9h6l3.5 7.5M9 9l3 7.5h-6.5M14 6h2.5" /></>),
  swim: ic(<><path d="M2 18c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5" /><path d="M8 13l4-3.5 3 2.5 2-2" /><circle cx="17.5" cy="6.5" r="1.8" /></>),
  settings: ic(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1.7a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 3.3 8.6a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H8a1.6 1.6 0 0 0 1-1.5V2.7a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></>),
};

const NAV: { to: string; label: string; short: string; icon: keyof typeof ICONS }[] = [
  { to: "/", label: "Dashboard", short: "Home", icon: "home" },
  { to: "/nutrition", label: "Nutrition", short: "Food", icon: "food" },
  { to: "/weight", label: "Weight", short: "Weight", icon: "weight" },
  { to: "/lifts", label: "Lifts", short: "Lifts", icon: "lift" },
  { to: "/activities/run", label: "Runs", short: "Runs", icon: "run" },
  { to: "/activities/ride", label: "Rides", short: "Rides", icon: "ride" },
  { to: "/activities/swim", label: "Swims", short: "Swims", icon: "swim" },
  { to: "/settings", label: "Settings & data", short: "Settings", icon: "settings" },
];

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <div className="flex h-full">
          {/* Sidebar on wide screens (desktop, iPad landscape) */}
          <nav className="hidden w-48 shrink-0 flex-col gap-0.5 border-r border-line bg-surface p-3 pt-safe lg:flex">
            <div className="mb-4 px-2 pt-1 text-sm font-semibold">Health Tracker</div>
            {NAV.slice(0, -1).map((n) => (
              <SideItem key={n.to} {...n} />
            ))}
            <div className="mt-auto">
              <SideItem {...NAV[NAV.length - 1]} />
            </div>
          </nav>
          <main className="min-w-0 flex-1 overflow-y-auto pb-tabbar lg:pb-0">
            <div className="mx-auto max-w-6xl p-4 pt-safe sm:p-6">
              <BackupReminder />
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
          {/* Bottom tab bar on narrower screens (iPad portrait, phones) */}
          <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface pb-safe lg:hidden" aria-label="Main">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                className={({ isActive }) =>
                  `flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${isActive ? "font-semibold text-accent" : "text-ink-2"}`
                }
              >
                {ICONS[n.icon]}
                <span>{n.short}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </HashRouter>
    </AppProvider>
  );
}

function SideItem({ to, label }: { to: string; label: string }) {
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
