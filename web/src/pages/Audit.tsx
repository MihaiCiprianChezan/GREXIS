import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { AuditEntry } from "@/types/api";

const PER_PAGE = 100;

export function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [actorTypeFilter, setActorTypeFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [expandedReasons, setExpandedReasons] = useState<Set<number>>(new Set());

  const fetchEntries = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE) });
    if (actorTypeFilter) params.set("actor_type", actorTypeFilter);
    if (actionFilter) params.set("action", actionFilter);

    api.listAudit(params)
      .then((res) => { setEntries(res.items); setTotal(res.total); setError(""); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, actorTypeFilter, actionFilter]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const totalPages = Math.ceil(total / PER_PAGE);

  const toggleReason = (id: number) => {
    setExpandedReasons((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportCsv = () => {
    const headers = ["timestamp", "actor_type", "actor_id_hash", "action", "target_id", "reason"];
    const rows = entries.map((e) =>
      [e.timestamp, e.actor_type, e.actor_id_hash, e.action, e.target_id || "", e.reason || ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grexis-audit-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h1 style={{ margin: 0 }}>Audit Log</h1>
        <button onClick={exportCsv} style={exportBtnStyle}>Export CSV</button>
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
        <select value={actorTypeFilter} onChange={(e) => { setActorTypeFilter(e.target.value); setPage(1); }} style={inputStyle}>
          <option value="">All actors</option>
          <option value="admin">admin</option>
          <option value="agent">agent</option>
          <option value="system">system</option>
        </select>
        <input
          type="text"
          placeholder="Filter by action..."
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          style={{ ...inputStyle, width: "180px" }}
        />
      </div>

      {error && <p style={{ color: "#d62828", marginBottom: "12px" }}>{error}</p>}

      <div style={{ backgroundColor: "#16213e", border: "1px solid #0f3460", borderRadius: "8px", overflow: "auto", opacity: loading ? 0.6 : 1 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ backgroundColor: "#0f3460" }}>
              <th style={thStyle}>Timestamp</th>
              <th style={thStyle}>Actor</th>
              <th style={thStyle}>Actor ID</th>
              <th style={thStyle}>Action</th>
              <th style={thStyle}>Target</th>
              <th style={thStyle}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && !loading ? (
              <tr><td colSpan={6} style={{ padding: "24px", textAlign: "center", color: "#888" }}>No entries</td></tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} style={{ borderBottom: "1px solid #0f3460" }}>
                  <td style={{ ...tdStyle, fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                    {new Date(entry.timestamp).toLocaleString()}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: "1px 6px",
                      borderRadius: "8px",
                      fontSize: "0.7rem",
                      backgroundColor: entry.actor_type === "admin" ? "#0e4d64" : entry.actor_type === "agent" ? "#1d3557" : "#555",
                      color: "#e0e0e0",
                    }}>
                      {entry.actor_type}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "0.75rem" }}>
                    {entry.actor_id_hash.substring(0, 12)}...
                  </td>
                  <td style={tdStyle}>{entry.action}</td>
                  <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "0.75rem" }}>
                    {entry.target_id ? `${entry.target_id.substring(0, 8)}...` : "—"}
                  </td>
                  <td style={tdStyle}>
                    {entry.reason ? (
                      <span>
                        {expandedReasons.has(entry.id)
                          ? entry.reason
                          : entry.reason.length > 40
                            ? entry.reason.substring(0, 40) + "..."
                            : entry.reason}
                        {entry.reason.length > 40 && (
                          <button
                            onClick={() => toggleReason(entry.id)}
                            style={{ background: "none", border: "none", color: "#a8dadc", cursor: "pointer", fontSize: "0.75rem", marginLeft: "4px" }}
                          >
                            {expandedReasons.has(entry.id) ? "less" : "more"}
                          </button>
                        )}
                      </span>
                    ) : "—"}
                  </td>
                </tr>
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

const inputStyle: React.CSSProperties = { padding: "6px 10px", backgroundColor: "#1a1a2e", color: "#e0e0e0", border: "1px solid #0f3460", borderRadius: "4px", fontSize: "0.85rem" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "#a0a0b8", fontSize: "0.75rem", textTransform: "uppercase", whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: "8px 12px", color: "#ccc" };
const pageBtnStyle: React.CSSProperties = { padding: "4px 12px", backgroundColor: "#0f3460", color: "#e0e0e0", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "0.85rem" };
const exportBtnStyle: React.CSSProperties = { padding: "8px 16px", backgroundColor: "#0f3460", color: "#e0e0e0", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: 600 };
