interface SeverityBadgeProps {
  severity: string;
}

const SEVERITY_STYLES: Record<string, { cls: string; label: string }> = {
  blocking: { cls: "bg-danger-muted text-danger", label: "blocking" },
  degraded: { cls: "bg-warning-muted text-warning", label: "degraded" },
  cosmetic: { cls: "bg-bg-elevated text-text-muted", label: "cosmetic" },
};

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const s = SEVERITY_STYLES[severity] || { cls: "bg-bg-elevated text-text-muted", label: severity };
  return (
    <span
      aria-label={`Severity: ${s.label}`}
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${s.cls}`}
    >
      {s.label}
    </span>
  );
}
