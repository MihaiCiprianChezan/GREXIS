import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { Metrics } from "@/types/api";
import { PageHeader } from "@/components/PageHeader";

interface MetricDef {
  key: keyof Metrics;
  label: string;
  format: (v: number) => string;
}

const METRIC_DEFS: MetricDef[] = [
  { key: "active_solutions", label: "Active Solutions", format: (v) => String(v) },
  { key: "total_solutions", label: "Total Solutions", format: (v) => String(v) },
  { key: "open_problems", label: "Open Problems", format: (v) => String(v) },
  { key: "blocking_problems", label: "Blocking Problems", format: (v) => String(v) },
  { key: "moderation_queue", label: "Moderation Queue", format: (v) => String(v) },
  { key: "agent_7d_success_rate", label: "Agent 7d Success Rate", format: (v) => `${v.toFixed(1)}%` },
  { key: "daily_tokens_used", label: "Daily Tokens Used", format: (v) => v.toLocaleString() },
  { key: "daily_token_budget", label: "Daily Token Budget", format: (v) => v.toLocaleString() },
  { key: "p95_query_latency_ms", label: "P95 Query Latency", format: (v) => `${v.toFixed(0)}ms` },
  { key: "mean_time_to_resolution_hours", label: "Mean Time to Resolution", format: (v) => `${v.toFixed(1)}h` },
  { key: "problems_solved_today", label: "Problems Solved Today", format: (v) => String(v) },
  { key: "problems_attempted_today", label: "Problems Attempted Today", format: (v) => String(v) },
];

export function MetricsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchMetrics = useCallback(() => {
    api.getMetrics()
      .then((res) => { setMetrics(res); setError(""); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  return (
    <div>
      <PageHeader
        title="Metrics"
        description="Key performance indicators for the GREXIS platform. All values are computed in real-time from the database."
      />

      {loading && (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton h-[88px] rounded-lg" />
          ))}
        </div>
      )}
      {error && <p className="text-danger">{error}</p>}

      {metrics && (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {METRIC_DEFS.map((def) => (
            <div
              key={def.key}
              className="bg-bg-surface border border-border rounded-lg p-5"
            >
              <p className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
                {def.label}
              </p>
              <p className="text-[28px] font-semibold tracking-tight font-mono text-text-primary leading-none">
                {def.format(metrics[def.key])}
              </p>
            </div>
          ))}
        </div>
      )}

      <p className="text-text-muted text-xs mt-6">
        Trends vs. 24h ago will be available in v0.2. For detailed graphs, use Grafana if configured.
      </p>
    </div>
  );
}
