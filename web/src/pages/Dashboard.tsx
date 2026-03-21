import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import type { Metrics, AuditEntry } from "@/types/api";

const cardStyle: React.CSSProperties = {
  backgroundColor: "#16213e",
  border: "1px solid #0f3460",
  borderRadius: "8px",
  padding: "16px 20px",
  flex: "1 1 200px",
};

const labelStyle: React.CSSProperties = {
  color: "#888",
  fontSize: "0.8rem",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  margin: "0 0 4px",
};

const valueStyle: React.CSSProperties = {
  fontSize: "1.8rem",
  fontWeight: 700,
  margin: 0,
  fontFamily: "monospace",
};

export function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [recentAudit, setRecentAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState("");

  const fetchData = useCallback(() => {
    api.getMetrics().then(setMetrics).catch(() => setError("Failed to load metrics"));
    api.listAudit(new URLSearchParams({ per_page: "20", page: "1" }))
      .then((res) => setRecentAudit(res.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  usePolling(fetchData, 5000);

  if (error && !metrics) {
    return (
      <div>
        <h1 style={{ margin: "0 0 16px" }}>Dashboard</h1>
        <p style={{ color: "#d62828" }}>{error}</p>
        <button onClick={fetchData} style={retryBtnStyle}>Retry</button>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div>
        <h1 style={{ margin: "0 0 16px" }}>Dashboard</h1>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ ...cardStyle, height: "80px", opacity: 0.5 }} />
          ))}
        </div>
      </div>
    );
  }

  const alerts: string[] = [];
  if (metrics.agent_7d_success_rate < 35) alerts.push("Scheduled agent paused — success rate below 35%");
  if (metrics.moderation_queue > 20) alerts.push(`Moderation queue has ${metrics.moderation_queue} items`);

  return (
    <div>
      <h1 style={{ margin: "0 0 20px" }}>Dashboard</h1>

      {/* Key metrics strip */}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "24px" }}>
        <div style={cardStyle}>
          <p style={labelStyle}>Open Problems</p>
          <p style={valueStyle}>{metrics.open_problems}</p>
          <p style={{ color: "#d62828", fontSize: "0.8rem", margin: "4px 0 0" }}>
            {metrics.blocking_problems} blocking
          </p>
        </div>
        <div style={cardStyle}>
          <p style={labelStyle}>Active Solutions</p>
          <p style={valueStyle}>{metrics.active_solutions}</p>
        </div>
        <div style={cardStyle}>
          <p style={labelStyle}>Moderation Queue</p>
          <p style={valueStyle}>{metrics.moderation_queue}</p>
        </div>
        <div style={cardStyle}>
          <p style={labelStyle}>Agent 7d Success</p>
          <p style={valueStyle}>{metrics.agent_7d_success_rate.toFixed(1)}%</p>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div
          style={{
            backgroundColor: "#3d1c00",
            border: "1px solid #e09f3e",
            borderRadius: "8px",
            padding: "12px 16px",
            marginBottom: "24px",
          }}
        >
          <h3 style={{ margin: "0 0 8px", color: "#e09f3e", fontSize: "0.9rem" }}>Alerts</h3>
          <ul style={{ margin: 0, paddingLeft: "20px", color: "#e0c88a" }}>
            {alerts.map((a, i) => (
              <li key={i} style={{ fontSize: "0.85rem", marginBottom: "4px" }}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent activity */}
      <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
        <div style={{ flex: "2 1 400px" }}>
          <h2 style={{ fontSize: "1rem", margin: "0 0 12px" }}>Recent Activity</h2>
          <div style={{ backgroundColor: "#16213e", border: "1px solid #0f3460", borderRadius: "8px", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ backgroundColor: "#0f3460" }}>
                  <th style={thStyle}>Time</th>
                  <th style={thStyle}>Actor</th>
                  <th style={thStyle}>Action</th>
                  <th style={thStyle}>Target</th>
                </tr>
              </thead>
              <tbody>
                {recentAudit.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: "16px", textAlign: "center", color: "#888" }}>
                      No recent activity
                    </td>
                  </tr>
                ) : (
                  recentAudit.map((entry) => (
                    <tr key={entry.id} style={{ borderBottom: "1px solid #0f3460" }}>
                      <td style={tdStyle}>{new Date(entry.timestamp).toLocaleString()}</td>
                      <td style={tdStyle}>
                        <span style={{ color: entry.actor_type === "admin" ? "#76d7c4" : "#a8dadc" }}>
                          {entry.actor_type}
                        </span>
                      </td>
                      <td style={tdStyle}>{entry.action}</td>
                      <td style={tdStyle}>
                        {entry.target_id ? (
                          <Link to={`/audit`} style={{ color: "#a8dadc", textDecoration: "none" }}>
                            {entry.target_id.substring(0, 8)}...
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Platform health */}
        <div style={{ flex: "1 1 250px" }}>
          <h2 style={{ fontSize: "1rem", margin: "0 0 12px" }}>Platform Health</h2>
          <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
              <p style={labelStyle}>P95 Query Latency</p>
              <p style={{ margin: 0, fontFamily: "monospace", fontSize: "1.2rem" }}>
                {metrics.p95_query_latency_ms.toFixed(0)}ms
              </p>
            </div>
            <div>
              <p style={labelStyle}>Mean Time to Resolution</p>
              <p style={{ margin: 0, fontFamily: "monospace", fontSize: "1.2rem" }}>
                {metrics.mean_time_to_resolution_hours.toFixed(1)}h
              </p>
            </div>
            <div>
              <p style={labelStyle}>Daily Token Budget</p>
              <p style={{ margin: 0, fontFamily: "monospace", fontSize: "1.2rem" }}>
                {metrics.daily_token_budget > 0
                  ? `${((metrics.daily_tokens_used / metrics.daily_token_budget) * 100).toFixed(1)}%`
                  : "N/A"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  fontWeight: 600,
  color: "#a0a0b8",
  fontSize: "0.75rem",
  textTransform: "uppercase",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  color: "#ccc",
};

const retryBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  backgroundColor: "#0f3460",
  color: "#e0e0e0",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
};
