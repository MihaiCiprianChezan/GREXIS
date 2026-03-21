import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { SourceBadge } from "@/components/SourceBadge";
import { SeverityBadge } from "@/components/SeverityBadge";
import { ConfirmModal } from "@/components/ConfirmModal";
import type { Solution, FeedbackEvent, ResolutionEdge } from "@/types/api";

type SolutionFull = Solution & { feedback_history: FeedbackEvent[]; edges: ResolutionEdge[] };

type ModalAction = "approve" | "reject" | "supersede" | "delete" | null;

export function SolutionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [solution, setSolution] = useState<SolutionFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalAction, setModalAction] = useState<ModalAction>(null);
  const [toast, setToast] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const fetchSolution = useCallback(() => {
    if (!id) return;
    setLoading(true);
    api
      .getSolution(id)
      .then((res) => {
        setSolution(res);
        setAdminNotes(res.admin_notes || "");
        setError("");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchSolution();
  }, [fetchSolution]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const handleAction = async (reason: string) => {
    if (!id || !modalAction) return;
    try {
      switch (modalAction) {
        case "approve":
          await api.updateSolution(id, { status: "active", source: "human_curated", reason });
          break;
        case "reject":
          await api.updateSolution(id, { status: "flagged", reason });
          break;
        case "supersede":
          await api.updateSolution(id, { status: "inactive", reason });
          break;
        case "delete":
          await api.deleteSolution(id, reason);
          break;
      }
      showToast(`Action "${modalAction}" completed`);
      setModalAction(null);
      fetchSolution();
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  };

  const saveNotes = async () => {
    if (!id) return;
    setSavingNotes(true);
    try {
      await api.updateSolution(id, { admin_notes: adminNotes });
      showToast("Notes saved");
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setSavingNotes(false);
    }
  };

  if (loading) {
    return (
      <div>
        <h1 style={{ margin: "0 0 16px" }}>Solution Detail</h1>
        <p style={{ color: "#888" }}>Loading...</p>
      </div>
    );
  }

  if (error || !solution) {
    return (
      <div>
        <h1 style={{ margin: "0 0 16px" }}>Solution Detail</h1>
        <p style={{ color: "#d62828" }}>{error || "Not found"}</p>
        <Link to="/solutions" style={{ color: "#a8dadc" }}>Back to solutions</Link>
      </div>
    );
  }

  const modalConfig: Record<string, { title: string; desc: string; label: string }> = {
    approve: { title: "Approve Solution", desc: "This will set the solution to active and mark it as human_curated.", label: "Approve" },
    reject: { title: "Flag Solution", desc: "This will flag the solution for review.", label: "Flag" },
    supersede: { title: "Supersede Solution", desc: "This will mark the solution as inactive (superseded).", label: "Supersede" },
    delete: { title: "Delete Solution", desc: "This will soft-delete the solution. It will become inactive and hidden from agents.", label: "Delete" },
  };

  return (
    <div>
      <Link to="/solutions" style={{ color: "#a8dadc", textDecoration: "none", fontSize: "0.85rem" }}>
        &larr; Solutions
      </Link>

      {toast && (
        <div style={{ position: "fixed", top: "16px", right: "16px", backgroundColor: "#2d6a4f", color: "#fff", padding: "10px 20px", borderRadius: "6px", zIndex: 999 }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ margin: "16px 0", display: "flex", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: "1.3rem", flex: "1 1 400px" }}>{solution.solution_summary}</h1>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <StatusBadge status={solution.status} />
          <SourceBadge source={solution.source} />
          {solution.severity && <SeverityBadge severity={solution.severity} />}
        </div>
      </div>

      <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
        {/* Main content */}
        <div style={{ flex: "2 1 500px" }}>
          {/* Failure signature */}
          <Section title="Failure Signature">
            <KV label="Error Type" value={solution.error_type} />
            <KV label="Error Code" value={solution.error_code} />
            <KV label="Tool Name" value={solution.tool_name} />
            <KV label="Operation" value={solution.operation} />
            <KV label="Details" value={solution.details_summary} />
          </Section>

          {/* Environment */}
          <Section title="Environment">
            <KV label="LLM" value={solution.llm} />
            <KV label="Framework" value={`${solution.framework} ${solution.framework_version}`} />
            <KV label="Runtime" value={solution.runtime} />
            {solution.tool_version && <KV label="Tool Version" value={solution.tool_version} />}
          </Section>

          {/* Resolution steps */}
          <Section title="Resolution Steps">
            <p style={{ color: "#888", fontSize: "0.8rem", margin: "0 0 8px" }}>
              Confidence type: <span style={{ fontFamily: "monospace" }}>{solution.confidence_type}</span>
            </p>
            <ol style={{ margin: 0, paddingLeft: "20px" }}>
              {solution.solution_steps.map((step, i) => (
                <li key={i} style={{ marginBottom: "8px", color: "#ccc", lineHeight: 1.5 }}>
                  {step}
                </li>
              ))}
            </ol>
          </Section>

          {/* Trust score breakdown */}
          <Section title="Trust Score">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <KV label="Confidence Score" value={solution.confidence_score.toFixed(3)} mono />
              <KV label="Success Rate" value={`${(solution.success_rate * 100).toFixed(1)}%`} mono />
              <KV label="Attempt Count" value={String(solution.attempt_count)} mono />
              <KV label="Last Validated" value={solution.last_validated_at ? new Date(solution.last_validated_at).toLocaleString() : "Never"} />
              <KV label="Source Weight" value={solution.source_weight.toFixed(2)} mono />
            </div>
          </Section>

          {/* Feedback history */}
          <Section title="Feedback History">
            {(solution.feedback_history?.length ?? 0) === 0 ? (
              <p style={{ color: "#888", margin: 0, fontSize: "0.85rem" }}>No feedback events</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead>
                  <tr>
                    <th style={thSmall}>Time</th>
                    <th style={thSmall}>Outcome</th>
                    <th style={thSmall}>Framework</th>
                    <th style={thSmall}>Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {solution.feedback_history.map((fb) => (
                    <tr key={fb.id} style={{ borderBottom: "1px solid #0f3460" }}>
                      <td style={tdSmall}>{new Date(fb.created_at).toLocaleString()}</td>
                      <td style={tdSmall}>
                        <span style={{ color: fb.outcome === "success" ? "#2d6a4f" : "#d62828" }}>
                          {fb.outcome}
                        </span>
                      </td>
                      <td style={tdSmall}>{fb.framework} {fb.framework_version}</td>
                      <td style={tdSmall}>{fb.comment || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* Graph edges */}
          <Section title="Graph Edges">
            {(solution.edges?.length ?? 0) === 0 ? (
              <p style={{ color: "#888", margin: 0, fontSize: "0.85rem" }}>No edges</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: "16px" }}>
                {solution.edges.map((edge) => (
                  <li key={edge.id} style={{ color: "#ccc", fontSize: "0.85rem", marginBottom: "4px" }}>
                    <span style={{ fontFamily: "monospace", color: "#a8dadc" }}>{edge.edge_type}</span>
                    {" → "}
                    <Link
                      to={edge.target_node_type === "solution" ? `/solutions/${edge.target_node_id}` : `/problems/${edge.target_node_id}`}
                      style={{ color: "#a8dadc", textDecoration: "none" }}
                    >
                      {edge.target_node_type}:{edge.target_node_id.substring(0, 8)}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Provenance */}
          {solution.provenance && (
            <Section title="Provenance">
              <p style={{ color: "#ccc", margin: 0, fontSize: "0.85rem", fontFamily: "monospace", wordBreak: "break-all" }}>
                {solution.provenance}
              </p>
            </Section>
          )}

          {/* Admin notes */}
          <Section title="Admin Notes">
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={4}
              style={{
                width: "100%",
                boxSizing: "border-box",
                backgroundColor: "#1a1a2e",
                color: "#e0e0e0",
                border: "1px solid #0f3460",
                borderRadius: "4px",
                padding: "8px",
                fontFamily: "inherit",
                fontSize: "0.85rem",
                resize: "vertical",
              }}
              placeholder="Internal notes (not returned to agents)..."
            />
            <button
              onClick={saveNotes}
              disabled={savingNotes}
              style={{ ...actionBtn, backgroundColor: "#0f3460", marginTop: "8px" }}
            >
              {savingNotes ? "Saving..." : "Save Notes"}
            </button>
          </Section>
        </div>

        {/* Action panel */}
        <div style={{ flex: "1 1 200px", minWidth: "200px" }}>
          <div style={{ position: "sticky", top: "24px" }}>
            <Section title="Actions">
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <button onClick={() => setModalAction("approve")} style={{ ...actionBtn, backgroundColor: "#2d6a4f" }}>
                  Promote to curated
                </button>
                <button onClick={() => setModalAction("reject")} style={{ ...actionBtn, backgroundColor: "#e09f3e", color: "#1a1a2e" }}>
                  Flag for review
                </button>
                <button onClick={() => setModalAction("supersede")} style={{ ...actionBtn, backgroundColor: "#555" }}>
                  Supersede
                </button>
                <button onClick={() => setModalAction("delete")} style={{ ...actionBtn, backgroundColor: "#d62828" }}>
                  Remove
                </button>
                {solution.agent_token_hash && (
                  <Link
                    to={`/agents/${solution.agent_token_hash}`}
                    style={{ ...actionBtn, backgroundColor: "#1d3557", textAlign: "center", textDecoration: "none", display: "block" }}
                  >
                    View agent token
                  </Link>
                )}
              </div>
            </Section>
          </div>
        </div>
      </div>

      {/* Confirm modal */}
      {modalAction && (
        <ConfirmModal
          title={modalConfig[modalAction].title}
          description={modalConfig[modalAction].desc}
          confirmLabel={modalConfig[modalAction].label}
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
      <h3 style={{ margin: "0 0 12px", fontSize: "0.9rem", color: "#a0a0b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function KV({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div style={{ marginBottom: "6px" }}>
      <span style={{ color: "#888", fontSize: "0.8rem" }}>{label}: </span>
      <span style={{ color: "#ccc", fontSize: "0.85rem", fontFamily: mono ? "monospace" : "inherit" }}>
        {value || "—"}
      </span>
    </div>
  );
}

const thSmall: React.CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  fontWeight: 600,
  color: "#a0a0b8",
  fontSize: "0.7rem",
  textTransform: "uppercase",
  borderBottom: "1px solid #0f3460",
};

const tdSmall: React.CSSProperties = {
  padding: "6px 8px",
  color: "#ccc",
};

const actionBtn: React.CSSProperties = {
  padding: "8px 16px",
  color: "#e0e0e0",
  border: "none",
  borderRadius: "4px",
  cursor: "pointer",
  fontSize: "0.85rem",
  fontWeight: 600,
};
