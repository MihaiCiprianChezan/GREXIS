interface StatusBadgeProps {
  status: string;
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  active: { bg: "#2d6a4f", color: "#b7e4c7", label: "active" },
  pending_review: { bg: "#e09f3e", color: "#1a1a2e", label: "pending review" },
  flagged: { bg: "#d62828", color: "#fff", label: "flagged" },
  inactive: { bg: "#555", color: "#ccc", label: "inactive" },
  pending_index: { bg: "#e09f3e", color: "#1a1a2e", label: "indexing" },
  open: { bg: "#e09f3e", color: "#1a1a2e", label: "open" },
  solved: { bg: "#2d6a4f", color: "#b7e4c7", label: "solved" },
  stale: { bg: "#555", color: "#ccc", label: "stale" },
  queued: { bg: "#555", color: "#ccc", label: "queued" },
  running: { bg: "#0f3460", color: "#a8d8ea", label: "running" },
  completed: { bg: "#2d6a4f", color: "#b7e4c7", label: "completed" },
  failed: { bg: "#d62828", color: "#fff", label: "failed" },
  skipped: { bg: "#555", color: "#ccc", label: "skipped" },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const s = STATUS_STYLES[status] || { bg: "#555", color: "#ccc", label: status };
  return (
    <span
      aria-label={`Status: ${s.label}`}
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
