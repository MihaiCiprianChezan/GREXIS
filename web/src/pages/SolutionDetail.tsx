import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
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
        <h1 className="text-xl font-semibold tracking-tight mb-4">Solution Detail</h1>
        <div className="flex flex-col gap-3">
          <div className="skeleton h-8 rounded-lg" />
          <div className="skeleton h-[120px] rounded-lg" />
          <div className="skeleton h-[200px] rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !solution) {
    return (
      <div>
        <h1 className="text-xl font-semibold tracking-tight mb-4">Solution Detail</h1>
        <p className="text-danger mb-3">{error || "Not found"}</p>
        <Link to="/solutions" className="text-accent hover:text-accent-hover no-underline text-sm flex items-center gap-1">
          <ArrowLeft className="size-3.5" />
          Back to solutions
        </Link>
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
      <Link to="/solutions" className="text-accent hover:text-accent-hover no-underline text-sm flex items-center gap-1 w-fit">
        <ArrowLeft className="size-3.5" />
        Solutions
      </Link>

      {toast && (
        <div className="fixed top-4 right-4 bg-success text-white px-5 py-2.5 rounded-md z-[999] shadow-lg text-sm font-medium">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="my-4 flex gap-3 items-start flex-wrap">
        <h1 className="text-xl font-semibold tracking-tight flex-[1_1_400px] m-0">{solution.solution_summary}</h1>
        <div className="flex gap-2 items-center">
          <StatusBadge status={solution.status} />
          <SourceBadge source={solution.source} />
          {solution.severity && <SeverityBadge severity={solution.severity} />}
        </div>
      </div>

      <div className="flex gap-6 flex-wrap">
        {/* Main content */}
        <div className="flex-[2_1_500px] min-w-0">
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
            <p className="text-text-muted text-xs mb-2 m-0">
              Confidence type: <span className="font-mono">{solution.confidence_type}</span>
            </p>
            <ol className="m-0 pl-5">
              {solution.solution_steps.map((step, i) => (
                <li key={i} className="mb-2 text-text-secondary leading-relaxed text-sm">
                  {step}
                </li>
              ))}
            </ol>
          </Section>

          {/* Trust score breakdown */}
          <Section title="Trust Score">
            <div className="grid grid-cols-2 gap-2">
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
              <p className="text-text-muted m-0 text-sm">No feedback events</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-bg-elevated">
                    <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-3 py-2 text-left border-b border-border">Time</th>
                    <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-3 py-2 text-left border-b border-border">Outcome</th>
                    <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-3 py-2 text-left border-b border-border">Framework</th>
                    <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-3 py-2 text-left border-b border-border">Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {solution.feedback_history.map((fb) => (
                    <tr key={fb.id} className="border-t border-border hover:bg-bg-elevated/50">
                      <td className="px-3 py-2 text-text-secondary text-xs">{new Date(fb.created_at).toLocaleString()}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className={fb.outcome === "success" ? "text-success" : "text-danger"}>
                          {fb.outcome}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-text-secondary text-xs">{fb.framework} {fb.framework_version}</td>
                      <td className="px-3 py-2 text-text-secondary text-xs">{fb.comment || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* Graph edges */}
          <Section title="Graph Edges">
            {(solution.edges?.length ?? 0) === 0 ? (
              <p className="text-text-muted m-0 text-sm">No edges</p>
            ) : (
              <ul className="m-0 pl-4 list-disc">
                {solution.edges.map((edge) => (
                  <li key={edge.id} className="text-text-secondary text-sm mb-1">
                    <span className="font-mono text-accent">{edge.edge_type}</span>
                    {" → "}
                    <Link
                      to={edge.target_node_type === "solution" ? `/solutions/${edge.target_node_id}` : `/problems/${edge.target_node_id}`}
                      className="text-accent hover:text-accent-hover no-underline"
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
              <p className="text-text-secondary m-0 text-sm font-mono break-all">
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
              className="w-full bg-bg-base text-text-primary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-y font-sans"
              placeholder="Internal notes (not returned to agents)..."
            />
            <button
              onClick={saveNotes}
              disabled={savingNotes}
              className="mt-2 px-4 py-2 rounded-md text-sm font-medium border-none cursor-pointer transition-colors bg-transparent text-text-secondary border border-border hover:bg-bg-elevated disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingNotes ? "Saving..." : "Save Notes"}
            </button>
          </Section>
        </div>

        {/* Action panel */}
        <div className="flex-[1_1_200px] min-w-[200px]">
          <div className="sticky top-6">
            <Section title="Actions">
              <p className="text-text-muted text-xs mb-3 mt-0 leading-relaxed">
                Change this solution's lifecycle status. Actions require a reason for the audit log.
              </p>
              <div className="flex flex-col gap-2">
                <ActionButton
                  onClick={() => setModalAction("approve")}
                  className="bg-success text-white hover:brightness-110"
                  label="Promote to curated"
                  hint="Mark as human-verified. Agents will see this as a trusted, high-priority solution."
                />
                <ActionButton
                  onClick={() => setModalAction("reject")}
                  className="bg-warning text-bg-base hover:brightness-110"
                  label="Flag for review"
                  hint="Send to the moderation queue. The solution won't be returned to agents until reviewed."
                />
                <ActionButton
                  onClick={() => setModalAction("supersede")}
                  className="bg-transparent text-text-secondary border border-border hover:bg-bg-elevated"
                  label="Supersede"
                  hint="Replace with a better solution. This one becomes inactive but stays in history."
                />
                <ActionButton
                  onClick={() => setModalAction("delete")}
                  className="bg-danger text-white hover:brightness-110"
                  label="Remove"
                  hint="Soft-delete this solution. It won't appear in search results or be returned to agents."
                />
                {solution.agent_token_hash && (
                  <Link
                    to={`/agents/${solution.agent_token_hash}`}
                    className="px-4 py-2 rounded-md text-sm font-semibold text-center no-underline transition-colors bg-transparent text-text-secondary border border-border hover:bg-bg-elevated block"
                  >
                    View agent token
                  </Link>
                )}
              </div>
            </Section>

            <Section title="Understanding this page">
              <div className="text-text-muted text-xs leading-relaxed space-y-2">
                <p className="m-0"><strong className="text-text-secondary">Confidence Score</strong> reflects how reliable this solution is, based on feedback from agents that tried it (0 = untested, 1 = always works).</p>
                <p className="m-0"><strong className="text-text-secondary">Success Rate</strong> is the % of feedback events that reported success.</p>
                <p className="m-0"><strong className="text-text-secondary">Source Weight</strong> depends on who contributed it: human_curated (1.0) &gt; scheduled_agent (0.7) &gt; agent_contributed (0.5).</p>
                <p className="m-0"><strong className="text-text-secondary">Graph Edges</strong> show how this solution connects to problems and feedback in the resolution graph.</p>
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
    <div className="bg-bg-surface border border-border rounded-lg p-4 mb-4">
      <h3 className="m-0 mb-3 text-sm font-semibold text-text-secondary uppercase tracking-wide">
        {title}
      </h3>
      {children}
    </div>
  );
}

function ActionButton({ onClick, className, label, hint }: {
  onClick: () => void;
  className: string;
  label: string;
  hint: string;
}) {
  return (
    <div>
      <button
        onClick={onClick}
        className={`w-full px-4 py-2 rounded-md text-sm font-semibold border-none cursor-pointer transition-colors ${className}`}
      >
        {label}
      </button>
      <p className="text-text-muted text-[11px] mt-1 mb-0 leading-relaxed px-1">{hint}</p>
    </div>
  );
}

function KV({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="mb-1.5">
      <span className="text-text-muted text-xs">{label}: </span>
      <span className={`text-text-secondary text-sm ${mono ? "font-mono" : ""}`}>
        {value || "—"}
      </span>
    </div>
  );
}
