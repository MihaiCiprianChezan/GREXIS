interface StatusBadgeProps {
  status: string;
}

const STATUS_STYLES: Record<string, { cls: string; label: string }> = {
  active:         { cls: "bg-success-muted text-success", label: "active" },
  pending_review: { cls: "bg-warning-muted text-warning", label: "pending review" },
  flagged:        { cls: "bg-danger-muted text-danger", label: "flagged" },
  inactive:       { cls: "bg-bg-elevated text-text-muted", label: "inactive" },
  pending_index:  { cls: "bg-warning-muted text-warning", label: "indexing" },
  open:           { cls: "bg-warning-muted text-warning", label: "open" },
  solved:         { cls: "bg-success-muted text-success", label: "solved" },
  stale:          { cls: "bg-bg-elevated text-text-muted", label: "stale" },
  queued:         { cls: "bg-bg-elevated text-text-muted", label: "queued" },
  running:        { cls: "bg-info-muted text-info", label: "running" },
  completed:      { cls: "bg-success-muted text-success", label: "completed" },
  failed:         { cls: "bg-danger-muted text-danger", label: "failed" },
  skipped:        { cls: "bg-bg-elevated text-text-muted", label: "skipped" },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const s = STATUS_STYLES[status] || { cls: "bg-bg-elevated text-text-muted", label: status };
  return (
    <span
      aria-label={`Status: ${s.label}`}
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${s.cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
        s.cls.includes("success") ? "bg-success" :
        s.cls.includes("warning") ? "bg-warning" :
        s.cls.includes("danger") ? "bg-danger" :
        s.cls.includes("info") ? "bg-info" :
        "bg-text-muted"
      }`} />
      {s.label}
    </span>
  );
}
