import { useEffect, useState, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { api } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import type { BadgeCounts } from "@/types/api";
import {
  LayoutDashboard,
  Lightbulb,
  AlertTriangle,
  Shield,
  Bot,
  Network,
  ScrollText,
  Cpu,
  BarChart3,
  Settings,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

const NAV_ITEMS_TOP = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/solutions", label: "Solutions", icon: Lightbulb },
  { to: "/problems", label: "Problems", icon: AlertTriangle, badgeKey: "problems" as const },
  { to: "/moderation", label: "Moderation", icon: Shield, badgeKey: "moderation" as const },
  { to: "/agents", label: "Agents", icon: Bot },
  { to: "/clusters", label: "Clusters", icon: Network, badgeKey: "clusters" as const },
];

const NAV_ITEMS_BOTTOM = [
  { to: "/audit", label: "Audit Log", icon: ScrollText },
  { to: "/jobs", label: "Scheduled Agent", icon: Cpu },
  { to: "/metrics", label: "Metrics", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const { theme, toggle: toggleTheme } = useTheme();
  const [counts, setCounts] = useState<BadgeCounts>({ problems: 0, moderation: 0, clusters: 0 });

  const fetchCounts = useCallback(() => {
    api.getBadgeCounts().then(setCounts).catch(() => {});
  }, []);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  usePolling(fetchCounts, 5000);

  const handleLogout = async () => {
    try {
      await api.logout();
    } finally {
      window.location.href = "/login";
    }
  };

  return (
    <nav className="w-[240px] min-h-screen bg-bg-surface border-r border-border flex flex-col shrink-0">
      {/* Brand */}
      <div className="px-5 pt-5 pb-4">
        <span className="text-[22px] font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
          <span className="text-text-primary">GRE</span>
          <span className="text-accent">X</span>
          <span className="text-text-primary">IS</span>
        </span>
      </div>

      <div className="h-px bg-border mx-4 mb-2" />

      {/* Top nav label */}
      <div className="px-5 pt-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-text-muted">
        Platform
      </div>

      {/* Top nav */}
      <div className="flex flex-col gap-0.5 px-3">
        {NAV_ITEMS_TOP.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-colors no-underline ${
                isActive
                  ? "bg-accent-muted text-accent border-l-2 border-l-accent -ml-[2px] pl-[14px]"
                  : "text-text-secondary hover:bg-[oklch(1_0_0/5%)] hover:text-text-primary"
              }`
            }
          >
            <item.icon size={16} className="shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.badgeKey && counts[item.badgeKey] > 0 && (
              <span className="bg-danger text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                {counts[item.badgeKey]}
              </span>
            )}
          </NavLink>
        ))}
      </div>

      <div className="h-px bg-border mx-4 my-3" />

      {/* Bottom nav label */}
      <div className="px-5 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-text-muted">
        System
      </div>

      {/* Bottom nav */}
      <div className="flex flex-col gap-0.5 px-3">
        {NAV_ITEMS_BOTTOM.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-colors no-underline ${
                isActive
                  ? "bg-accent-muted text-accent border-l-2 border-l-accent -ml-[2px] pl-[14px]"
                  : "text-text-secondary hover:bg-[oklch(1_0_0/5%)] hover:text-text-primary"
              }`
            }
          >
            <item.icon size={16} className="shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>

      {/* User section */}
      <div className="border-t border-border p-4 mt-3">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-7 h-7 rounded-full bg-bg-elevated flex items-center justify-center text-[11px] font-semibold text-text-secondary">
            A
          </div>
          <div>
            <div className="text-[12px] font-medium text-text-primary">Admin</div>
            <div className="text-[11px] text-text-muted">admin@local</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 px-3 py-1.5 text-[13px] text-text-secondary hover:text-accent bg-transparent border border-border hover:border-accent-muted rounded-md cursor-pointer transition-colors"
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            onClick={handleLogout}
            className="flex-1 flex items-center gap-2 px-3 py-1.5 text-[13px] text-text-secondary hover:text-danger bg-transparent border border-border hover:border-danger-muted rounded-md cursor-pointer transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
