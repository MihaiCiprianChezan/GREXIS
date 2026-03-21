import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { Metrics } from "@/types/api";

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
      <h1 style={{ margin: "0 0 16px" }}>Metrics</h1>

      {loading && <p style={{ color: "#888" }}>Loading...</p>}
      {error && <p style={{ color: "#d62828" }}>{error}</p>}

      {metrics && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px" }}>
          {METRIC_DEFS.map((def) => (
            <div
              key={def.key}
              style={{
                backgroundColor: "#16213e",
                border: "1px solid #0f3460",
                borderRadius: "8px",
                padding: "16px 20px",
              }}
            >
              <p style={{
                color: "#888",
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                margin: "0 0 6px",
              }}>
                {def.label}
              </p>
              <p style={{
                fontSize: "1.6rem",
                fontWeight: 700,
                fontFamily: "monospace",
                color: "#e0e0e0",
                margin: 0,
              }}>
                {def.format(metrics[def.key])}
              </p>
            </div>
          ))}
        </div>
      )}

      <p style={{ color: "#555", fontSize: "0.8rem", marginTop: "24px" }}>
        Trends vs. 24h ago will be available in v0.2. For detailed graphs, use Grafana if configured.
      </p>
    </div>
  );
}
