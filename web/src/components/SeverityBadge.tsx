interface SeverityBadgeProps {
  severity: string;
}

const SEVERITY_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  blocking: { bg: "#d62828", color: "#fff", label: "blocking" },
  degraded: { bg: "#e09f3e", color: "#1a1a2e", label: "degraded" },
  cosmetic: { bg: "#555", color: "#ccc", label: "cosmetic" },
};

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const s = SEVERITY_STYLES[severity] || { bg: "#555", color: "#ccc", label: severity };
  return (
    <span
      aria-label={`Severity: ${s.label}`}
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: "12px",
        fontSize: "0.75rem",
        fontWeight: 600,
        backgroundColor: s.bg,
        color: s.color,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}
