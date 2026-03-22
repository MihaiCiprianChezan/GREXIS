import { useState, useEffect, useCallback } from "react";
import { CheckCircle, Trash2, Ban } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { SourceBadge } from "@/components/SourceBadge";
import { SeverityBadge } from "@/components/SeverityBadge";
import { ConfirmModal } from "@/components/ConfirmModal";
import type { Solution } from "@/types/api";

type ModerationAction = "dismiss" | "remove" | "ban" | null;

export function ModerationPage() {
  const [items, setItems] = useState<Solution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalAction, setModalAction] = useState<ModerationAction>(null);
  const [toast, setToast] = useState("");

  const fetchItems = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ status: "pending_review", per_page: "200" });
    api
      .listSolutions(params)
      .then((res) => {
        // Sort by severity (blocking first), then by age (oldest first)
        const severityOrder: Record<string, number> = { blocking: 0, degraded: 1, cosmetic: 2 };
        const sorted = [...res.items].sort((a, b) => {
          const sa = severityOrder[a.severity ?? "cosmetic"] ?? 2;
          const sb = severityOrder[b.severity ?? "cosmetic"] ?? 2;
          if (sa !== sb) return sa - sb;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });
        setItems(sorted);
        setError("");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const selected = items.find((i) => i.id === selectedId) || null;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const handleAction = async (reason: string) => {
    if (!selectedId || !modalAction) return;
    try {
      switch (modalAction) {
        case "dismiss":
          await api.updateSolution(selectedId, { status: "active", reason });
          break;
        case "remove":
          await api.deleteSolution(selectedId, reason);
          break;
        case "ban":
          if (selected?.agent_token_hash) {
            await api.banToken(selected.agent_token_hash, reason);
          }
          await api.deleteSolution(selectedId, reason);
          break;
      }
      showToast(`Action "${modalAction}" completed`);
      setModalAction(null);

      // Move to next item
      const currentIdx = items.findIndex((i) => i.id === selectedId);
      const nextItems = items.filter((i) => i.id !== selectedId);
      setItems(nextItems);
      if (nextItems.length > 0) {
        const nextIdx = Math.min(currentIdx, nextItems.length - 1);
        setSelectedId(nextItems[nextIdx].id);
      } else {
        setSelectedId(null);
      }
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : "Unknown"}`);
    }
  };

  const modalConfigs: Record<string, { title: string; desc: string; label: string }> = {
    dismiss: { title: "Dismiss Flag", desc: "This will clear the flag and set the solution to active.", label: "Dismiss" },
    remove: { title: "Remove Solution", desc: "This will soft-delete the solution (set to inactive).", label: "Remove" },
    ban: { title: "Remove & Ban Token", desc: "This will soft-delete the solution AND ban the contributing agent token.", label: "Remove & Ban" },
  };

  return (
    <div>
      <PageHeader
        title="Moderation Queue"
        description="Solutions flagged for human review. These were either auto-flagged after consecutive failures or manually flagged by an admin. Review each one and decide whether to keep, remove, or ban the contributing agent."
        tip={<>
          <p className="m-0 mb-2"><strong className="text-text-primary">Why solutions get flagged:</strong> A solution enters moderation for two reasons — it received 5+ consecutive failure feedbacks from agents (auto-flagged by the trust decay system), or an admin manually flagged it from the solution detail page. Flagged solutions are immediately hidden from agent queries until reviewed.</p>
          <p className="m-0 mb-2"><strong className="text-text-primary">Dismiss flag:</strong> If you determine the solution is valid (e.g., failures were due to environment issues, not the solution itself), dismiss the flag. This sets the solution back to <code className="text-xs bg-bg-elevated px-1 py-0.5 rounded">active</code> and makes it available to agents again. Its confidence score resets based on its current feedback history.</p>
          <p className="m-0 mb-2"><strong className="text-text-primary">Remove:</strong> Soft-deletes the solution by setting its status to <code className="text-xs bg-bg-elevated px-1 py-0.5 rounded">inactive</code>. It won't appear in search results or be returned to agents, but it remains in the database for audit purposes. The contributing agent is not affected.</p>
          <p className="m-0"><strong className="text-text-primary">Remove &amp; Ban:</strong> Removes the solution AND bans the contributing agent's token. Use this for clearly malicious or spam submissions. The banned agent will receive 403 errors on all future API calls. This action is logged in the audit trail.</p>
        </>}
      />
      <div className="flex" style={{ height: "calc(100vh - 180px)" }}>
      {toast && (
        <div className="fixed top-4 right-4 bg-success text-white px-5 py-2.5 rounded-md z-50 text-sm">
          {toast}
        </div>
      )}

      {/* Queue list */}
      <div className="w-[400px] border-r border-border overflow-auto flex-shrink-0">
        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mx-0 mt-0 mb-3 px-3 pt-3 pb-2 border-b border-border">
          Moderation Queue ({items.length})
        </h2>

        {loading && <p className="text-text-muted px-4 py-4 text-sm">Loading...</p>}
        {error && <p className="text-danger px-4 py-4 text-sm">{error}</p>}

        {!loading && items.length === 0 && (
          <div className="px-6 py-8 text-center">
            <p className="text-text-secondary text-sm mb-1">Queue is clear</p>
            <p className="text-text-muted text-xs">Last checked: {new Date().toLocaleString()}</p>
          </div>
        )}

        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => setSelectedId(item.id)}
            className={[
              "block w-full text-left px-3 py-2.5 border-none border-b border-border cursor-pointer transition-colors",
              selectedId === item.id
                ? "bg-accent-muted"
                : "bg-transparent hover:bg-bg-elevated",
            ].join(" ")}
          >
            <div className="text-text-primary text-sm mb-1 leading-snug">
              {item.solution_summary.substring(0, 60)}
              {item.solution_summary.length > 60 ? "..." : ""}
            </div>
            <div className="flex gap-1.5 items-center">
              {item.severity && <SeverityBadge severity={item.severity} />}
              <SourceBadge source={item.source} />
              <span className="text-text-muted text-[11px] ml-auto">
                {new Date(item.created_at).toLocaleDateString()}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Detail panel */}
      <div className="flex-1 overflow-auto px-5">
        {!selected ? (
          <p className="text-text-muted mt-10 text-center text-sm">
            Select an item to review
          </p>
        ) : (
          <div className="py-4">
            <h2 className="text-xl font-semibold tracking-tight text-text-primary mb-2">
              {selected.solution_summary}
            </h2>
            <div className="flex gap-2 mb-4">
              <StatusBadge status={selected.status} />
              <SourceBadge source={selected.source} />
              {selected.severity && <SeverityBadge severity={selected.severity} />}
            </div>

            <DetailSection title="Error Info">
              <KV label="Error Type" value={selected.error_type} />
              <KV label="Error Code" value={selected.error_code} />
              <KV label="Tool" value={selected.tool_name} />
              <KV label="Details" value={selected.details_summary} />
            </DetailSection>

            <DetailSection title="Environment">
              <KV label="LLM" value={selected.llm} />
              <KV label="Framework" value={`${selected.framework} ${selected.framework_version}`} />
              <KV label="Runtime" value={selected.runtime} />
            </DetailSection>

            <DetailSection title="Resolution Steps">
              <ol className="m-0 pl-[18px]">
                {selected.solution_steps.map((step, i) => (
                  <li key={i} className="text-text-secondary mb-1.5 text-sm">{step}</li>
                ))}
              </ol>
            </DetailSection>

            <DetailSection title="Trust">
              <KV label="Confidence" value={selected.confidence_score.toFixed(3)} />
              <KV label="Success Rate" value={`${(selected.success_rate * 100).toFixed(1)}%`} />
              <KV label="Attempts" value={String(selected.attempt_count)} />
            </DetailSection>

            {selected.agent_token_hash && (
              <DetailSection title="Agent Token">
                <p className="m-0 font-mono text-sm text-accent">
                  {selected.agent_token_hash}
                </p>
              </DetailSection>
            )}

            {/* Actions */}
            <div className="flex gap-2 flex-wrap mt-2">
              <button
                onClick={() => setModalAction("dismiss")}
                className="flex items-center gap-1.5 px-4 py-2 bg-success text-white rounded-md text-sm font-semibold border-none cursor-pointer hover:brightness-110 transition-colors"
              >
                <CheckCircle size={14} />
                Dismiss flag
              </button>
              <button
                onClick={() => setModalAction("remove")}
                className="flex items-center gap-1.5 px-4 py-2 bg-danger text-white rounded-md text-sm font-semibold border-none cursor-pointer hover:brightness-110 transition-colors"
              >
                <Trash2 size={14} />
                Remove
              </button>
              {selected.agent_token_hash && (
                <button
                  onClick={() => setModalAction("ban")}
                  className="flex items-center gap-1.5 px-4 py-2 bg-danger text-white rounded-md text-sm font-semibold border-none cursor-pointer hover:brightness-110 transition-colors opacity-90"
                >
                  <Ban size={14} />
                  Remove &amp; Ban token
                </button>
              )}
            </div>
          </div>
        )}
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

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg-surface border border-border rounded-lg p-3 mb-3">
      <h4 className="m-0 mb-2 text-[11px] font-semibold text-text-muted uppercase tracking-wide">{title}</h4>
      {children}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="mb-1">
      <span className="text-text-muted text-xs">{label}: </span>
      <span className="text-text-primary text-sm font-mono">{value || "—"}</span>
    </div>
  );
}
