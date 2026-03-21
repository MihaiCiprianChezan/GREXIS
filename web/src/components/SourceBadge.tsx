interface SourceBadgeProps {
  source: string;
}

const SOURCE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  agent_contributed: { bg: "#1d3557", color: "#a8dadc", label: "agent" },
  scheduled_agent: { bg: "#4a235a", color: "#d7bde2", label: "scheduled" },
  human_curated: { bg: "#0e4d64", color: "#76d7c4", label: "curated" },
  federated: { bg: "#555", color: "#ccc", label: "federated" },
};

export function SourceBadge({ source }: SourceBadgeProps) {
  const s = SOURCE_STYLES[source] || { bg: "#555", color: "#ccc", label: source };
  return (
    <span
      aria-label={`Source: ${s.label}`}
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "10px",
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
