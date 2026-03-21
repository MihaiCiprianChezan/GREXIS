import { useState, useEffect, useCallback } from "react";
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
    <div style={{ display: "flex", height: "calc(100vh - 48px)" }}>
      {toast && (
        <div style={{ position: "fixed", top: "16px", right: "16px", backgroundColor: "#2d6a4f", color: "#fff", padding: "10px 20px", borderRadius: "6px", zIndex: 999 }}>
          {toast}
        </div>
      )}

      {/* Queue list */}
      <div style={{ width: "400px", borderRight: "1px solid #0f3460", overflow: "auto", flexShrink: 0 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: "1rem", padding: "0 0 8px", borderBottom: "1px solid #0f3460" }}>
          Moderation Queue ({items.length})
        </h2>

        {loading && <p style={{ color: "#888", padding: "16px" }}>Loading...</p>}
        {error && <p style={{ color: "#d62828", padding: "16px" }}>{error}</p>}

        {!loading && items.length === 0 && (
          <div style={{ padding: "24px", textAlign: "center", color: "#888" }}>
            <p style={{ fontSize: "1rem", margin: "0 0 4px" }}>Queue is clear</p>
            <p style={{ fontSize: "0.8rem", margin: 0 }}>Last checked: {new Date().toLocaleString()}</p>
          </div>
        )}

        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => setSelectedId(item.id)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "10px 12px",
              border: "none",
              borderBottom: "1px solid #0f3460",
              backgroundColor: selectedId === item.id ? "#0f3460" : "transparent",
              color: "#e0e0e0",
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: "0.85rem", marginBottom: "4px", lineHeight: 1.3 }}>
              {item.solution_summary.substring(0, 60)}
              {item.solution_summary.length > 60 ? "..." : ""}
            </div>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              {item.severity && <SeverityBadge severity={item.severity} />}
              <SourceBadge source={item.source} />
              <span style={{ color: "#888", fontSize: "0.7rem", marginLeft: "auto" }}>
                {new Date(item.created_at).toLocaleDateString()}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Detail panel */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 0 0 20px" }}>
        {!selected ? (
          <p style={{ color: "#888", marginTop: "40px", textAlign: "center" }}>
            Select an item to review
          </p>
        ) : (
          <div>
            <h2 style={{ margin: "0 0 8px", fontSize: "1.1rem" }}>{selected.solution_summary}</h2>
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
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
              <ol style={{ margin: 0, paddingLeft: "18px" }}>
                {selected.solution_steps.map((step, i) => (
                  <li key={i} style={{ color: "#ccc", marginBottom: "6px", fontSize: "0.85rem" }}>{step}</li>
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
                <p style={{ margin: 0, fontFamily: "monospace", fontSize: "0.85rem", color: "#a8dadc" }}>
                  {selected.agent_token_hash}
                </p>
              </DetailSection>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
              <button onClick={() => setModalAction("dismiss")} style={{ ...actionBtn, backgroundColor: "#2d6a4f" }}>
                Dismiss flag
              </button>
              <button onClick={() => setModalAction("remove")} style={{ ...actionBtn, backgroundColor: "#d62828" }}>
                Remove
              </button>
              {selected.agent_token_hash && (
                <button onClick={() => setModalAction("ban")} style={{ ...actionBtn, backgroundColor: "#8b0000" }}>
                  Remove &amp; Ban token
                </button>
              )}
            </div>
          </div>
        )}
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
    <div style={{ backgroundColor: "#16213e", border: "1px solid #0f3460", borderRadius: "6px", padding: "12px", marginBottom: "12px" }}>
      <h4 style={{ margin: "0 0 8px", fontSize: "0.8rem", color: "#a0a0b8", textTransform: "uppercase" }}>{title}</h4>
      {children}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{ marginBottom: "4px" }}>
      <span style={{ color: "#888", fontSize: "0.8rem" }}>{label}: </span>
      <span style={{ color: "#ccc", fontSize: "0.85rem" }}>{value || "—"}</span>
    </div>
  );
}

const actionBtn: React.CSSProperties = {
  padding: "8px 16px",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
  fontSize: "0.85rem",
  fontWeight: 600,
};
