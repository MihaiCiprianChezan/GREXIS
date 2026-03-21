import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, ShieldBan, ShieldCheck, RotateCcw } from "lucide-react";
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
    return (
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary mb-4">Agent Detail</h1>
        <p className="text-text-muted text-sm">Loading...</p>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary mb-4">Agent Detail</h1>
        <p className="text-danger text-sm mb-3">{error || "Not found"}</p>
        <Link to="/agents" className="text-accent text-sm hover:underline">Back to agents</Link>
      </div>
    );
  }

  return (
    <div>
      <Link to="/agents" className="inline-flex items-center gap-1 text-accent text-sm no-underline hover:underline mb-4">
        <ArrowLeft size={14} />
        Agents
      </Link>

      {toast && (
        <div className="fixed top-4 right-4 bg-success text-white px-5 py-2.5 rounded-md z-50 text-sm">
          {toast}
        </div>
      )}

      <div className="my-4 flex gap-3 items-center">
        <h1 className="text-xl font-semibold tracking-tight text-text-primary font-mono m-0">
          {agent.token_hash.substring(0, 24)}...
        </h1>
        <span className="px-2.5 py-0.5 rounded-full text-xs bg-bg-elevated text-accent border border-border">
          {agent.tier}
        </span>
        {agent.is_banned && (
          <span className="text-danger font-bold text-sm">BANNED</span>
        )}
      </div>

      <div className="flex gap-6 flex-wrap">
        <div className="flex-[2_1_400px]">
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
              <p className="text-text-muted m-0 text-sm">No solutions</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-3 py-1.5 text-left border-b border-border">Summary</th>
                    <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-3 py-1.5 text-left border-b border-border">Confidence</th>
                    <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-3 py-1.5 text-left border-b border-border">Status</th>
                    <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-3 py-1.5 text-left border-b border-border">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {agent.solutions.map((sol) => (
                    <tr key={sol.id} className="border-t border-border hover:bg-bg-elevated/50">
                      <td className="px-3 py-1.5 text-text-secondary">
                        <Link to={`/solutions/${sol.id}`} className="text-accent no-underline hover:underline">
                          {sol.solution_summary.substring(0, 50)}...
                        </Link>
                      </td>
                      <td className="px-3 py-1.5 text-text-secondary font-mono">{sol.confidence_score.toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-text-secondary"><StatusBadge status={sol.status} /></td>
                      <td className="px-3 py-1.5 text-text-muted text-xs">{new Date(sol.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </div>

        {/* Actions */}
        <div className="flex-[1_1_200px] min-w-[200px]">
          <div className="sticky top-6">
            <Section title="Actions">
              <div className="flex flex-col gap-2">
                {agent.is_banned ? (
                  <button
                    onClick={() => setModalAction("unban")}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-success text-white rounded-md text-sm font-semibold border-none cursor-pointer hover:brightness-110 transition-colors"
                  >
                    <ShieldCheck size={14} />
                    Unban token
                  </button>
                ) : (
                  <button
                    onClick={() => setModalAction("ban")}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-danger text-white rounded-md text-sm font-semibold border-none cursor-pointer hover:brightness-110 transition-colors"
                  >
                    <ShieldBan size={14} />
                    Ban token
                  </button>
                )}
                <button
                  onClick={() => setModalAction("reset")}
                  className="flex items-center justify-center gap-2 bg-transparent text-text-secondary border border-border hover:bg-bg-elevated rounded-md px-4 py-2 text-sm cursor-pointer transition-colors"
                >
                  <RotateCcw size={14} />
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
    <div className="bg-bg-surface border border-border rounded-lg p-4 mb-4">
      <h3 className="m-0 mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="mb-1.5">
      <span className="text-text-muted text-xs">{label}: </span>
      <span className="text-text-primary text-sm font-mono">{value || "—"}</span>
    </div>
  );
}
