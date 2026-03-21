import { useEffect, useState, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { api } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import type { BadgeCounts } from "@/types/api";

const NAV_ITEMS_TOP = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/solutions", label: "Solutions" },
  { to: "/problems", label: "Problems", badgeKey: "problems" as const },
  { to: "/moderation", label: "Moderation", badgeKey: "moderation" as const },
  { to: "/agents", label: "Agents" },
  { to: "/clusters", label: "Clusters", badgeKey: "clusters" as const },
];

const NAV_ITEMS_BOTTOM = [
  { to: "/audit", label: "Audit log" },
  { to: "/jobs", label: "Scheduled agent" },
  { to: "/metrics", label: "Metrics" },
  { to: "/settings", label: "Settings" },
];

const linkStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 16px",
  color: "#a0a0b8",
  textDecoration: "none",
  fontSize: "0.9rem",
  borderRadius: "4px",
  transition: "background-color 0.15s",
};

const activeLinkStyle: React.CSSProperties = {
  ...linkStyle,
  backgroundColor: "#0f3460",
  color: "#e0e0e0",
};

export function Sidebar() {
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

  const renderBadge = (count: number, label: string) => {
    if (count === 0) return null;
    return (
      <span
        aria-label={`${count} ${label}`}
        style={{
          backgroundColor: "#d62828",
          color: "#fff",
          fontSize: "0.7rem",
          fontWeight: 700,
          padding: "1px 6px",
          borderRadius: "8px",
          minWidth: "18px",
          textAlign: "center",
        }}
      >
        {count}
      </span>
    );
  };

  return (
    <nav
      style={{
        width: "220px",
        minHeight: "100vh",
        backgroundColor: "#16213e",
        borderRight: "1px solid #0f3460",
        display: "flex",
        flexDirection: "column",
        padding: "16px 0",
        flexShrink: 0,
      }}
    >
      <div style={{ padding: "0 16px 16px", fontSize: "1.1rem", fontWeight: 700, color: "#e0e0e0" }}>
        GREXIS admin
      </div>

      <div style={{ borderBottom: "1px solid #0f3460", margin: "0 12px 8px" }} />

      {NAV_ITEMS_TOP.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          style={({ isActive }) => (isActive ? activeLinkStyle : linkStyle)}
        >
          <span>{item.label}</span>
          {item.badgeKey && renderBadge(counts[item.badgeKey], `items in ${item.label.toLowerCase()}`)}
        </NavLink>
      ))}

      <div style={{ borderBottom: "1px solid #0f3460", margin: "8px 12px" }} />

      {NAV_ITEMS_BOTTOM.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          style={({ isActive }) => (isActive ? activeLinkStyle : linkStyle)}
        >
          {item.label}
        </NavLink>
      ))}

      <div style={{ flex: 1 }} />

      <div style={{ borderBottom: "1px solid #0f3460", margin: "8px 12px" }} />

      <div style={{ padding: "8px 16px", color: "#777", fontSize: "0.8rem" }}>
        Logged in as admin
      </div>
      <button
        onClick={handleLogout}
        style={{
          margin: "4px 16px",
          padding: "6px 12px",
          backgroundColor: "transparent",
          color: "#a0a0b8",
          border: "1px solid #555",
          borderRadius: "4px",
          cursor: "pointer",
          fontSize: "0.85rem",
          textAlign: "left",
        }}
      >
        Sign out
      </button>
    </nav>
  );
}
