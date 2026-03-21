import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import type { AgentToken } from "@/types/api";

const TIERS = ["anonymous", "token_only", "registered"];
const PER_PAGE = 50;

export function AgentsPage() {
  const [tokens, setTokens] = useState<AgentToken[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [tierFilter, setTierFilter] = useState("");
  const [bannedFilter, setBannedFilter] = useState("");

  const fetchTokens = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE) });
    if (tierFilter) params.set("tier", tierFilter);
    if (bannedFilter) params.set("is_banned", bannedFilter);

    api
      .listTokens(params)
      .then((res) => { setTokens(res.items); setTotal(res.total); setError(""); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, tierFilter, bannedFilter]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div>
      <h1 style={{ margin: "0 0 16px" }}>Agent Tokens</h1>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
        <select value={tierFilter} onChange={(e) => { setTierFilter(e.target.value); setPage(1); }} style={inputStyle}>
          <option value="">All tiers</option>
          {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={bannedFilter} onChange={(e) => { setBannedFilter(e.target.value); setPage(1); }} style={inputStyle}>
          <option value="">All</option>
          <option value="true">Banned only</option>
          <option value="false">Active only</option>
        </select>
      </div>

      {error && <p style={{ color: "#d62828", marginBottom: "12px" }}>{error}</p>}

      <div style={{ backgroundColor: "#16213e", border: "1px solid #0f3460", borderRadius: "8px", overflow: "auto", opacity: loading ? 0.6 : 1 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ backgroundColor: "#0f3460" }}>
              <th style={thStyle}>Token Hash</th>
              <th style={thStyle}>Tier</th>
              <th style={thStyle}>Solutions</th>
              <th style={thStyle}>Success Rate</th>
              <th style={thStyle}>Rate Mult</th>
              <th style={thStyle}>First Seen</th>
              <th style={thStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {tokens.length === 0 && !loading ? (
              <tr><td colSpan={7} style={{ padding: "24px", textAlign: "center", color: "#888" }}>No tokens found</td></tr>
            ) : (
              tokens.map((tok) => (
                <tr key={tok.id} style={{ borderBottom: "1px solid #0f3460" }}>
                  <td style={tdStyle}>
                    <Link to={`/agents/${tok.token_hash}`} style={{ color: "#a8dadc", textDecoration: "none", fontFamily: "monospace", fontSize: "0.8rem" }}>
                      {tok.token_hash.substring(0, 16)}...
                    </Link>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "0.75rem", backgroundColor: "#0f3460", color: "#a8dadc" }}>
                      {tok.tier}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontFamily: "monospace" }}>{tok.submitted_solutions_count}</td>
                  <td style={{ ...tdStyle, fontFamily: "monospace" }}>{(tok.submitted_solutions_success_rate * 100).toFixed(0)}%</td>
                  <td style={{ ...tdStyle, fontFamily: "monospace" }}>{tok.rate_limit_multiplier.toFixed(1)}x</td>
                  <td style={{ ...tdStyle, fontSize: "0.8rem", color: "#888" }}>{new Date(tok.first_seen_at).toLocaleDateString()}</td>
                  <td style={tdStyle}>
                    {tok.is_banned ? (
                      <span style={{ color: "#d62828", fontWeight: 600, fontSize: "0.8rem" }}>BANNED</span>
                    ) : (
                      <span style={{ color: "#2d6a4f", fontSize: "0.8rem" }}>active</span>
                    )}
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
          <span style={{ color: "#888", fontSize: "0.85rem" }}>Page {page} of {totalPages}</span>
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
