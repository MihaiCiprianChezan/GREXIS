import { useState, useEffect, useCallback, Fragment } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { SeverityBadge } from "@/components/SeverityBadge";
import type { Problem } from "@/types/api";

const STATUSES = ["open", "solved", "stale"];
const SEVERITIES = ["blocking", "degraded", "cosmetic"];
const PER_PAGE = 50;

export function ProblemsPage() {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [frameworkFilter, setFrameworkFilter] = useState("");

  // Quick resolve
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [resolveSteps, setResolveSteps] = useState("");
  const [resolveSummary, setResolveSummary] = useState("");
  const [resolveSubmitting, setResolveSubmitting] = useState(false);

  const fetchProblems = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(PER_PAGE),
    });
    if (statusFilter) params.set("status", statusFilter);
    if (severityFilter) params.set("severity", severityFilter);
    if (frameworkFilter) params.set("framework", frameworkFilter);

    api
      .listProblems(params)
      .then((res) => {
        setProblems(res.items);
        setTotal(res.total);
        setError("");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, statusFilter, severityFilter, frameworkFilter]);

  useEffect(() => {
    fetchProblems();
  }, [fetchProblems]);

  const handleQuickResolve = async (problemId: string) => {
    if (!resolveSteps.trim() || !resolveSummary.trim()) return;
    setResolveSubmitting(true);
    try {
      await api.createSolution({
        parent_problem_id: problemId,
        solution_steps: resolveSteps.split("\n").filter((s) => s.trim()),
        solution_summary: resolveSummary,
        source: "human_curated",
        status: "active",
      });
      setResolveId(null);
      setResolveSteps("");
      setResolveSummary("");
      fetchProblems();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create solution");
    } finally {
      setResolveSubmitting(false);
    }
  };

  const totalPages = Math.ceil(total / PER_PAGE);

  const age = (created: string) => {
    const ms = Date.now() - new Date(created).getTime();
    const hours = Math.floor(ms / 3600000);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  return (
    <div>
      <h1 style={{ margin: "0 0 16px" }}>Problems</h1>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          style={inputStyle}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={severityFilter}
          onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
          style={inputStyle}
        >
          <option value="">All severities</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          type="text"
          placeholder="Framework..."
          value={frameworkFilter}
          onChange={(e) => { setFrameworkFilter(e.target.value); setPage(1); }}
          style={{ ...inputStyle, width: "140px" }}
        />
      </div>

      {error && (
        <p style={{ color: "#d62828", marginBottom: "12px" }}>
          {error} <button onClick={fetchProblems} style={retryStyle}>Retry</button>
        </p>
      )}

      <div style={{ backgroundColor: "#16213e", border: "1px solid #0f3460", borderRadius: "8px", overflow: "auto", opacity: loading ? 0.6 : 1 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ backgroundColor: "#0f3460" }}>
              <th style={thStyle}>Error Type</th>
              <th style={thStyle}>Framework</th>
              <th style={thStyle}>Severity</th>
              <th style={thStyle}>Duplicates</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Last Attempted</th>
              <th style={thStyle}>Age</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {problems.length === 0 && !loading ? (
              <tr>
                <td colSpan={8} style={{ padding: "24px", textAlign: "center", color: "#888" }}>
                  No problems found
                </td>
              </tr>
            ) : (
              problems.map((prob) => (
                <Fragment key={prob.id}>
                  <tr style={{ borderBottom: "1px solid #0f3460" }}>
                    <td style={tdStyle}>
                      <Link to={`/problems/${prob.id}`} style={{ color: "#a8dadc", textDecoration: "none" }}>
                        {prob.error_type}
                      </Link>
                    </td>
                    <td style={tdStyle}>
                      {prob.framework}
                      <span style={{ color: "#888", fontSize: "0.75rem" }}> {prob.framework_version}</span>
                    </td>
                    <td style={tdStyle}><SeverityBadge severity={prob.severity} /></td>
                    <td style={{ ...tdStyle, fontFamily: "monospace" }}>{prob.duplicate_count}</td>
                    <td style={tdStyle}><StatusBadge status={prob.status} /></td>
                    <td style={{ ...tdStyle, fontSize: "0.8rem", color: "#888" }}>
                      {prob.last_attempted_at ? new Date(prob.last_attempted_at).toLocaleDateString() : "—"}
                    </td>
                    <td style={{ ...tdStyle, fontSize: "0.8rem", color: "#888" }}>{age(prob.created_at)}</td>
                    <td style={tdStyle}>
                      {prob.severity === "blocking" && prob.status === "open" && (
                        <button
                          onClick={() => setResolveId(resolveId === prob.id ? null : prob.id)}
                          style={{ padding: "4px 10px", backgroundColor: "#2d6a4f", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "0.75rem" }}
                        >
                          Quick resolve
                        </button>
                      )}
                    </td>
                  </tr>
                  {resolveId === prob.id && (
                    <tr key={`resolve-${prob.id}`}>
                      <td colSpan={8} style={{ padding: "16px", backgroundColor: "#1a1a2e" }}>
                        <div style={{ maxWidth: "600px" }}>
                          <h4 style={{ margin: "0 0 8px", color: "#e0e0e0" }}>Quick Resolve</h4>
                          <label style={labelStyle}>Summary</label>
                          <input
                            type="text"
                            value={resolveSummary}
                            onChange={(e) => setResolveSummary(e.target.value)}
                            style={{ ...inputStyle, width: "100%", marginBottom: "8px" }}
                            placeholder="Brief solution summary..."
                          />
                          <label style={labelStyle}>Steps (one per line)</label>
                          <textarea
                            value={resolveSteps}
                            onChange={(e) => setResolveSteps(e.target.value)}
                            rows={4}
                            style={{ ...inputStyle, width: "100%", boxSizing: "border-box", resize: "vertical" }}
                            placeholder="Step 1&#10;Step 2&#10;Step 3"
                          />
                          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                            <button
                              onClick={() => handleQuickResolve(prob.id)}
                              disabled={resolveSubmitting || !resolveSteps.trim() || !resolveSummary.trim()}
                              style={{ padding: "6px 16px", backgroundColor: "#2d6a4f", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
                            >
                              {resolveSubmitting ? "Submitting..." : "Submit Solution"}
                            </button>
                            <button
                              onClick={() => { setResolveId(null); setResolveSteps(""); setResolveSummary(""); }}
                              style={{ padding: "6px 16px", backgroundColor: "transparent", color: "#ccc", border: "1px solid #555", borderRadius: "4px", cursor: "pointer" }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
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
          <span style={{ color: "#888", fontSize: "0.85rem" }}>Page {page} of {totalPages} ({total} total)</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={pageBtnStyle}>Next</button>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  backgroundColor: "#1a1a2e",
  color: "#e0e0e0",
  border: "1px solid #0f3460",
  borderRadius: "4px",
  fontSize: "0.85rem",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  color: "#888",
  fontSize: "0.8rem",
  marginBottom: "4px",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  fontWeight: 600,
  color: "#a0a0b8",
  fontSize: "0.75rem",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = { padding: "8px 12px", color: "#ccc" };
const pageBtnStyle: React.CSSProperties = { padding: "4px 12px", backgroundColor: "#0f3460", color: "#e0e0e0", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "0.85rem" };
const retryStyle: React.CSSProperties = { padding: "4px 8px", backgroundColor: "#0f3460", color: "#e0e0e0", border: "none", borderRadius: "4px", cursor: "pointer", marginLeft: "8px" };
