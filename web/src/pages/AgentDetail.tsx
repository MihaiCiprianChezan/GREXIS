import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { ConfirmModal } from "@/components/ConfirmModal";
import { StatusBadge } from "@/components/StatusBadge";
import type { AgentToken, Solution } from "@/types/api";

type AgentFull = AgentToken & { solutions: Solution[] };
type ActionType = "ban" | "unban" | "reset" | null;

export function AgentDetailPage() {
  const { hash } = useParams<{ hash: string }>();
  const [agent, setAgent] = useState<AgentFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalAction, setModalAction] = useState<ActionType>(null);
  const [toast, setToast] = useState("");

  const fetchAgent = useCallback(() => {
    if (!hash) return;
    setLoading(true);
    api.getToken(hash)
      .then((res) => { setAgent(res); setError(""); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [hash]);

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const handleAction = async (reason: string) => {
    if (!hash || !modalAction) return;
    try {
      switch (modalAction) {
        case "ban": await api.banToken(hash, reason); break;
        case "unban": await api.unbanToken(hash, reason); break;
        case "reset": await api.resetToken(hash, reason); break;
      }
      showToast(`${modalAction} completed`);
      setModalAction(null);
      fetchAgent();
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : "Unknown"}`);
    }
  };

  const modalConfigs: Record<string, { title: string; desc: string; label: string }> = {
    ban: { title: "Ban Token", desc: "This will ban the agent token. The agent will no longer be able to submit solutions.", label: "Ban" },
    unban: { title: "Unban Token", desc: "This will restore the agent token. The agent will be able to submit solutions again.", label: "Unban" },
    reset: { title: "Reset Rate Limit", desc: "This will reset the rate_limit_multiplier back to 1.0.", label: "Reset" },
  };

  if (loading) {
    return <div><h1 style={{ margin: "0 0 16px" }}>Agent Detail</h1><p style={{ color: "#888" }}>Loading...</p></div>;
  }

  if (error || !agent) {
    return (
      <div>
        <h1 style={{ margin: "0 0 16px" }}>Agent Detail</h1>
        <p style={{ color: "#d62828" }}>{error || "Not found"}</p>
        <Link to="/agents" style={{ color: "#a8dadc" }}>Back to agents</Link>
      </div>
    );
  }

  return (
    <div>
      <Link to="/agents" style={{ color: "#a8dadc", textDecoration: "none", fontSize: "0.85rem" }}>&larr; Agents</Link>

      {toast && (
        <div style={{ position: "fixed", top: "16px", right: "16px", backgroundColor: "#2d6a4f", color: "#fff", padding: "10px 20px", borderRadius: "6px", zIndex: 999 }}>
          {toast}
        </div>
      )}

      <div style={{ margin: "16px 0", display: "flex", gap: "12px", alignItems: "center" }}>
        <h1 style={{ margin: 0, fontSize: "1.2rem", fontFamily: "monospace" }}>{agent.token_hash.substring(0, 24)}...</h1>
        <span style={{ padding: "2px 10px", borderRadius: "10px", fontSize: "0.8rem", backgroundColor: "#0f3460", color: "#a8dadc" }}>
          {agent.tier}
        </span>
        {agent.is_banned && <span style={{ color: "#d62828", fontWeight: 700 }}>BANNED</span>}
      </div>

      <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
        <div style={{ flex: "2 1 400px" }}>
          {/* Identity */}
          <Section title="Identity">
            <KV label="Tier" value={agent.tier} />
            <KV label="Description" value={agent.agent_description} />
            <KV label="Framework" value={agent.framework} />
            <KV label="Email Hash" value={agent.operator_email_hash} />
          </Section>

          {/* Activity */}
          <Section title="Activity">
            <KV label="Solutions Submitted" value={String(agent.submitted_solutions_count)} />
            <KV label="Success Rate" value={`${(agent.submitted_solutions_success_rate * 100).toFixed(1)}%`} />
            <KV label="Rate Limit Multiplier" value={`${agent.rate_limit_multiplier.toFixed(2)}x`} />
            <KV label="First Seen" value={new Date(agent.first_seen_at).toLocaleString()} />
            <KV label="Last Seen" value={new Date(agent.last_seen_at).toLocaleString()} />
            {agent.is_banned && (
              <>
                <KV label="Banned At" value={agent.banned_at ? new Date(agent.banned_at).toLocaleString() : "—"} />
                <KV label="Ban Reason" value={agent.ban_reason} />
              </>
            )}
          </Section>

          {/* Submitted solutions */}
          <Section title="Submitted Solutions">
            {(!agent.solutions || agent.solutions.length === 0) ? (
              <p style={{ color: "#888", margin: 0, fontSize: "0.85rem" }}>No solutions</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead>
                  <tr>
                    <th style={thSmall}>Summary</th>
                    <th style={thSmall}>Confidence</th>
                    <th style={thSmall}>Status</th>
                    <th style={thSmall}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {agent.solutions.map((sol) => (
                    <tr key={sol.id} style={{ borderBottom: "1px solid #0f3460" }}>
                      <td style={tdSmall}>
                        <Link to={`/solutions/${sol.id}`} style={{ color: "#a8dadc", textDecoration: "none" }}>
                          {sol.solution_summary.substring(0, 50)}...
                        </Link>
                      </td>
                      <td style={{ ...tdSmall, fontFamily: "monospace" }}>{sol.confidence_score.toFixed(2)}</td>
                      <td style={tdSmall}><StatusBadge status={sol.status} /></td>
                      <td style={{ ...tdSmall, color: "#888" }}>{new Date(sol.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </div>

        {/* Actions */}
        <div style={{ flex: "1 1 200px", minWidth: "200px" }}>
          <div style={{ position: "sticky", top: "24px" }}>
            <Section title="Actions">
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {agent.is_banned ? (
                  <button onClick={() => setModalAction("unban")} style={{ ...actionBtn, backgroundColor: "#2d6a4f" }}>
                    Unban token
                  </button>
                ) : (
                  <button onClick={() => setModalAction("ban")} style={{ ...actionBtn, backgroundColor: "#d62828" }}>
                    Ban token
                  </button>
                )}
                <button onClick={() => setModalAction("reset")} style={{ ...actionBtn, backgroundColor: "#0f3460" }}>
                  Reset rate limit
                </button>
              </div>
            </Section>
          </div>
        </div>
      </div>

      {modalAction && (
        <ConfirmModal
          title={modalConfigs[modalAction].title}
          description={modalConfigs[modalAction].desc}
          confirmLabel={modalConfigs[modalAction].label}
          onConfirm={handleAction}
          onCancel={() => setModalAction(null)}
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: "#16213e", border: "1px solid #0f3460", borderRadius: "8px", padding: "16px", marginBottom: "16px" }}>
      <h3 style={{ margin: "0 0 12px", fontSize: "0.9rem", color: "#a0a0b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>{title}</h3>
      {children}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{ marginBottom: "6px" }}>
      <span style={{ color: "#888", fontSize: "0.8rem" }}>{label}: </span>
      <span style={{ color: "#ccc", fontSize: "0.85rem" }}>{value || "—"}</span>
    </div>
  );
}

const thSmall: React.CSSProperties = { textAlign: "left", padding: "6px 8px", fontWeight: 600, color: "#a0a0b8", fontSize: "0.7rem", textTransform: "uppercase", borderBottom: "1px solid #0f3460" };
const tdSmall: React.CSSProperties = { padding: "6px 8px", color: "#ccc" };
const actionBtn: React.CSSProperties = { padding: "8px 16px", color: "#e0e0e0", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 };
