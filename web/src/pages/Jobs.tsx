import { useState, useEffect, useCallback, Fragment } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { usePolling } from "@/hooks/usePolling";
import type { AgentJob, Metrics } from "@/types/api";

const PER_PAGE = 50;

export function JobsPage() {
  const [jobs, setJobs] = useState<AgentJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());

  const fetchData = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE) });
    if (statusFilter) params.set("status", statusFilter);

    api.listJobs(params)
      .then((res) => { setJobs(res.items); setTotal(res.total); setError(""); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    api.getMetrics().then(setMetrics).catch(() => {});
  }, [page, statusFilter]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  usePolling(fetchData, 5000);

  const totalPages = Math.ceil(total / PER_PAGE);

  const toggleExpand = (id: string) => {
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <h1 style={{ margin: "0 0 16px" }}>Scheduled Agent</h1>

      {/* Current status */}
      {metrics && (
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "24px" }}>
          <StatusCard label="Daily Tokens Used" value={`${metrics.daily_tokens_used} / ${metrics.daily_token_budget}`} />
          <StatusCard label="Problems Attempted Today" value={String(metrics.problems_attempted_today)} />
          <StatusCard label="Problems Solved Today" value={String(metrics.problems_solved_today)} />
          <StatusCard label="7-Day Success Rate" value={`${metrics.agent_7d_success_rate.toFixed(1)}%`} />
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} style={inputStyle}>
          <option value="">All statuses</option>
          <option value="queued">queued</option>
          <option value="running">running</option>
          <option value="completed">completed</option>
          <option value="failed">failed</option>
          <option value="skipped">skipped</option>
        </select>
      </div>

      {error && <p style={{ color: "#d62828", marginBottom: "12px" }}>{error}</p>}

      <div style={{ backgroundColor: "#16213e", border: "1px solid #0f3460", borderRadius: "8px", overflow: "auto", opacity: loading ? 0.6 : 1 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ backgroundColor: "#0f3460" }}>
              <th style={thStyle}></th>
              <th style={thStyle}>Problem</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Today</th>
              <th style={thStyle}>Total</th>
              <th style={thStyle}>Tokens</th>
              <th style={thStyle}>Next Attempt</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && !loading ? (
              <tr><td colSpan={7} style={{ padding: "24px", textAlign: "center", color: "#888" }}>No jobs</td></tr>
            ) : (
              jobs.map((job) => (
                <Fragment key={job.id}>
                  <tr style={{ borderBottom: "1px solid #0f3460" }}>
                    <td style={tdStyle}>
                      {job.synthesis_logs && job.synthesis_logs.length > 0 && (
                        <button
                          onClick={() => toggleExpand(job.id)}
                          style={{ background: "none", border: "none", color: "#a8dadc", cursor: "pointer", fontSize: "0.8rem" }}
                        >
                          {expandedJobs.has(job.id) ? "−" : "+"}
                        </button>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <Link to={`/problems/${job.problem_id}`} style={{ color: "#a8dadc", textDecoration: "none", fontFamily: "monospace", fontSize: "0.8rem" }}>
                        {job.problem_id.substring(0, 8)}...
                      </Link>
                    </td>
                    <td style={tdStyle}><StatusBadge status={job.status} /></td>
                    <td style={{ ...tdStyle, fontFamily: "monospace" }}>{job.attempts_today}</td>
                    <td style={{ ...tdStyle, fontFamily: "monospace" }}>{job.total_attempts}</td>
                    <td style={{ ...tdStyle, fontFamily: "monospace" }}>{job.tokens_used_today}</td>
                    <td style={{ ...tdStyle, fontSize: "0.8rem", color: "#888" }}>
                      {job.next_attempt_after ? new Date(job.next_attempt_after).toLocaleString() : "—"}
                    </td>
                  </tr>
                  {expandedJobs.has(job.id) && job.synthesis_logs && (
                    <tr key={`logs-${job.id}`}>
                      <td colSpan={7} style={{ padding: "8px 12px 16px 40px", backgroundColor: "#1a1a2e" }}>
                        {job.synthesis_logs.map((log, i) => (
                          <div key={i} style={{ borderLeft: "2px solid #0f3460", paddingLeft: "12px", marginBottom: "8px" }}>
                            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "2px" }}>
                              <span style={{ color: "#a0a0b8", fontSize: "0.75rem", fontWeight: 600 }}>
                                Attempt {log.attempt_number}
                              </span>
                              <span style={{
                                padding: "1px 6px",
                                borderRadius: "8px",
                                fontSize: "0.7rem",
                                backgroundColor: log.outcome === "success" ? "#2d6a4f" : log.outcome === "failed" ? "#d62828" : "#555",
                                color: "#fff",
                              }}>
                                {log.outcome}
                              </span>
                              <span style={{ color: "#888", fontSize: "0.7rem" }}>
                                {log.tokens_used} tokens
                              </span>
                            </div>
                            <p style={{ margin: "2px 0", color: "#ccc", fontSize: "0.8rem" }}>
                              {log.reasoning_summary}
                            </p>
                            {log.sources_used.length > 0 && (
                              <p style={{ margin: "2px 0 0", color: "#888", fontSize: "0.7rem" }}>
                                Sources: {log.sources_used.join(", ")}
                              </p>
                            )}
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "12px", justifyContent: "center" }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={pageBtnStyle}>Prev</button>
          <span style={{ color: "#888", fontSize: "0.85rem" }}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pageBtnStyle}>Next</button>
        </div>
      )}
    </div>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ backgroundColor: "#16213e", border: "1px solid #0f3460", borderRadius: "8px", padding: "12px 16px", flex: "1 1 160px" }}>
      <p style={{ color: "#888", fontSize: "0.75rem", textTransform: "uppercase", margin: "0 0 4px" }}>{label}</p>
      <p style={{ color: "#e0e0e0", fontSize: "1.2rem", fontFamily: "monospace", fontWeight: 700, margin: 0 }}>{value}</p>
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: "6px 10px", backgroundColor: "#1a1a2e", color: "#e0e0e0", border: "1px solid #0f3460", borderRadius: "4px", fontSize: "0.85rem" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "#a0a0b8", fontSize: "0.75rem", textTransform: "uppercase", whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: "8px 12px", color: "#ccc" };
const pageBtnStyle: React.CSSProperties = { padding: "4px 12px", backgroundColor: "#0f3460", color: "#e0e0e0", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "0.85rem" };
