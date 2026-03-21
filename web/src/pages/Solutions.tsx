import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { SourceBadge } from "@/components/SourceBadge";
import type { Solution } from "@/types/api";

const STATUSES = ["active", "pending_review", "flagged", "inactive", "pending_index"];
const SOURCES = ["agent_contributed", "scheduled_agent", "human_curated", "federated"];
const PER_PAGE = 50;

export function SolutionsPage() {
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [frameworkFilter, setFrameworkFilter] = useState("");
  const [errorTypeFilter, setErrorTypeFilter] = useState("");
  const [searchText, setSearchText] = useState("");

  const fetchSolutions = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(PER_PAGE),
    });
    if (statusFilter) params.set("status", statusFilter);
    if (sourceFilter) params.set("source", sourceFilter);
    if (frameworkFilter) params.set("framework", frameworkFilter);
    if (errorTypeFilter) params.set("error_type", errorTypeFilter);
    if (searchText) params.set("q", searchText);

    api
      .listSolutions(params)
      .then((res) => {
        setSolutions(res.items);
        setTotal(res.total);
        setError("");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, statusFilter, sourceFilter, frameworkFilter, errorTypeFilter, searchText]);

  useEffect(() => {
    fetchSolutions();
  }, [fetchSolutions]);

  const totalPages = Math.ceil(total / PER_PAGE);

  const confidenceColor = (score: number) => {
    if (score >= 0.65) return "#2d6a4f";
    if (score >= 0.3) return "#e09f3e";
    return "#d62828";
  };

  return (
    <div>
      <h1 style={{ margin: "0 0 16px" }}>Solutions</h1>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
        <input
          type="text"
          placeholder="Search summary..."
          value={searchText}
          onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
          style={inputStyle}
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          style={inputStyle}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
          style={inputStyle}
        >
          <option value="">All sources</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Framework..."
          value={frameworkFilter}
          onChange={(e) => { setFrameworkFilter(e.target.value); setPage(1); }}
          style={{ ...inputStyle, width: "120px" }}
        />
        <input
          type="text"
          placeholder="Error type..."
          value={errorTypeFilter}
          onChange={(e) => { setErrorTypeFilter(e.target.value); setPage(1); }}
          style={{ ...inputStyle, width: "140px" }}
        />
      </div>

      {error && (
        <p style={{ color: "#d62828", marginBottom: "12px" }}>
          {error} <button onClick={fetchSolutions} style={retryStyle}>Retry</button>
        </p>
      )}

      {/* Table */}
      <div style={{ backgroundColor: "#16213e", border: "1px solid #0f3460", borderRadius: "8px", overflow: "auto", opacity: loading ? 0.6 : 1, position: "relative" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ backgroundColor: "#0f3460" }}>
              <th style={thStyle}>Summary</th>
              <th style={thStyle}>Framework</th>
              <th style={thStyle}>Error Type</th>
              <th style={thStyle}>Confidence</th>
              <th style={thStyle}>Success</th>
              <th style={thStyle}>Source</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Validated</th>
            </tr>
          </thead>
          <tbody>
            {solutions.length === 0 && !loading ? (
              <tr>
                <td colSpan={8} style={{ padding: "24px", textAlign: "center", color: "#888" }}>
                  No solutions found
                </td>
              </tr>
            ) : (
              solutions.map((sol) => (
                <tr key={sol.id} style={{ borderBottom: "1px solid #0f3460" }}>
                  <td style={tdStyle}>
                    <Link
                      to={`/solutions/${sol.id}`}
                      style={{ color: "#a8dadc", textDecoration: "none" }}
                    >
                      {sol.solution_summary.length > 80
                        ? sol.solution_summary.substring(0, 80) + "..."
                        : sol.solution_summary}
                    </Link>
                  </td>
                  <td style={tdStyle}>
                    {sol.framework}
                    <span style={{ color: "#888", fontSize: "0.75rem" }}> {sol.framework_version}</span>
                  </td>
                  <td style={tdStyle}>{sol.error_type}</td>
                  <td style={tdStyle}>
                    <span style={{ color: confidenceColor(sol.confidence_score), fontFamily: "monospace", fontWeight: 600 }}>
                      {sol.confidence_score.toFixed(2)}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: "monospace" }}>
                    {(sol.success_rate * 100).toFixed(0)}%
                  </td>
                  <td style={tdStyle}><SourceBadge source={sol.source} /></td>
                  <td style={tdStyle}><StatusBadge status={sol.status} /></td>
                  <td style={{ ...tdStyle, fontSize: "0.8rem", color: "#888" }}>
                    {sol.last_validated_at
                      ? new Date(sol.last_validated_at).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "12px", justifyContent: "center" }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={pageBtnStyle}
          >
            Prev
          </button>
          <span style={{ color: "#888", fontSize: "0.85rem" }}>
            Page {page} of {totalPages} ({total} total)
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={pageBtnStyle}
          >
            Next
          </button>
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

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  fontWeight: 600,
  color: "#a0a0b8",
  fontSize: "0.75rem",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  color: "#ccc",
};

const pageBtnStyle: React.CSSProperties = {
  padding: "4px 12px",
  backgroundColor: "#0f3460",
  color: "#e0e0e0",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
  fontSize: "0.85rem",
};

const retryStyle: React.CSSProperties = {
  padding: "4px 8px",
  backgroundColor: "#0f3460",
  color: "#e0e0e0",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
  marginLeft: "8px",
};
