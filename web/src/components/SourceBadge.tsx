interface SourceBadgeProps {
  source: string;
}

const SOURCE_STYLES: Record<string, { cls: string; label: string }> = {
  agent_contributed: { cls: "bg-info-muted text-info", label: "agent" },
  scheduled_agent:   { cls: "bg-accent-muted text-accent", label: "scheduled" },
  human_curated:     { cls: "bg-success-muted text-success", label: "curated" },
  federated:         { cls: "bg-bg-elevated text-text-muted", label: "federated" },
};

export function SourceBadge({ source }: SourceBadgeProps) {
  const s = SOURCE_STYLES[source] || { cls: "bg-bg-elevated text-text-muted", label: source };
  return (
    <span
      aria-label={`Source: ${s.label}`}
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${s.cls}`}
    >
      {s.label}
    </span>
  );
}
