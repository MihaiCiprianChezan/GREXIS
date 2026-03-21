import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, AlertTriangle, ChevronUp, ChevronDown, X, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { SeverityBadge } from "@/components/SeverityBadge";
import type { Problem, Solution, AgentJob } from "@/types/api";

type ProblemFull = Problem & { solutions: Solution[]; jobs: AgentJob[] };

export function ProblemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [problem, setProblem] = useState<ProblemFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Manual resolve
  const [showResolve, setShowResolve] = useState(false);
  const [steps, setSteps] = useState<string[]>([""]);
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchProblem = useCallback(() => {
    if (!id) return;
    setLoading(true);
    api
      .getProblem(id)
      .then((res) => { setProblem(res); setError(""); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchProblem();
  }, [fetchProblem]);

  const handleResolve = async () => {
    if (!id || !summary.trim()) return;
    const filteredSteps = steps.filter((s) => s.trim());
    if (filteredSteps.length === 0) return;
    setSubmitting(true);
    try {
      await api.createSolution({
        parent_problem_id: id,
        solution_steps: filteredSteps,
        solution_summary: summary,
        source: "human_curated",
        status: "active",
        admin_notes: notes || undefined,
      });
      navigate("/problems");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create solution");
    } finally {
      setSubmitting(false);
    }
  };

  const addStep = () => setSteps([...steps, ""]);
  const removeStep = (i: number) => setSteps(steps.filter((_, idx) => idx !== i));
  const updateStep = (i: number, val: string) => {
    const next = [...steps];
    next[i] = val;
    setSteps(next);
  };
  const moveStep = (i: number, dir: -1 | 1) => {
    const next = [...steps];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setSteps(next);
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-xl font-semibold tracking-tight mb-4">Problem Detail</h1>
        <div className="space-y-3">
          <div className="skeleton h-[120px] rounded-lg" />
          <div className="skeleton h-[80px] rounded-lg" />
          <div className="skeleton h-[160px] rounded-lg" />
        </div>
      </div>
    );
  }

  if (error && !problem) {
    return (
      <div>
        <h1 className="text-xl font-semibold tracking-tight mb-4">Problem Detail</h1>
        <div className="flex items-center gap-2 text-danger text-sm mb-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
        <Link to="/problems" className="text-accent hover:underline text-sm">Back to problems</Link>
      </div>
    );
  }

  if (!problem) return null;

  const hasGoodSolutions = problem.solutions?.some((s) => s.confidence_score >= 0.5);

  return (
    <div>
      <Link to="/problems" className="inline-flex items-center gap-1 text-accent hover:underline text-sm">
        <ArrowLeft className="w-3.5 h-3.5" />
        Problems
      </Link>

      {/* Header */}
      <div className="my-4 flex gap-3 items-center flex-wrap">
        <h1 className="text-xl font-semibold tracking-tight m-0">{problem.error_type}</h1>
        <SeverityBadge severity={problem.severity} />
        <StatusBadge status={problem.status} />
        <span className="text-text-muted text-sm">
          {problem.duplicate_count} duplicate{problem.duplicate_count !== 1 ? "s" : ""}
        </span>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-danger text-sm mb-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Failure signature */}
      <Section title="Failure Signature">
        <KV label="Error Code" value={problem.error_code} />
        <KV label="Tool Name" value={problem.tool_name} />
        <KV label="Operation" value={problem.operation} />
        <KV label="Details" value={problem.details} />
      </Section>

      {/* Goal state */}
      <Section title="Goal State">
        <p className="text-text-secondary m-0 whitespace-pre-wrap">{problem.goal_state}</p>
      </Section>

      {/* Environment */}
      <Section title="Environment">
        <KV label="LLM" value={problem.llm} />
        <KV label="Framework" value={`${problem.framework} ${problem.framework_version}`} />
        <KV label="Runtime" value={problem.runtime} />
      </Section>

      {/* Execution context */}
      {problem.execution_context && (
        <Section title="Execution Context">
          <pre className="m-0 font-mono text-xs text-text-secondary whitespace-pre-wrap break-all">
            {JSON.stringify(problem.execution_context, null, 2)}
          </pre>
        </Section>
      )}

      {/* Existing solutions */}
      <Section title="Existing Solutions">
        {(!problem.solutions || problem.solutions.length === 0) ? (
          <p className="text-text-muted m-0 text-sm">No linked solutions</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-bg-elevated">
                <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left">Summary</th>
                <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left">Confidence</th>
                <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {problem.solutions.map((sol) => (
                <tr key={sol.id} className="border-t border-border hover:bg-bg-elevated/50">
                  <td className="px-4 py-2.5 text-text-secondary">
                    <Link to={`/solutions/${sol.id}`} className="text-accent hover:underline">
                      {sol.solution_summary.substring(0, 60)}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary font-mono">{sol.confidence_score.toFixed(2)}</td>
                  <td className="px-4 py-2.5 text-text-secondary"><StatusBadge status={sol.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Scheduled agent attempts */}
      <Section title="Scheduled Agent Attempts">
        {(!problem.jobs || problem.jobs.length === 0) ? (
          <p className="text-text-muted m-0 text-sm">No agent attempts</p>
        ) : (
          problem.jobs.map((job) => (
            <div key={job.id} className="mb-3">
              <div className="flex gap-2 items-center mb-1.5">
                <StatusBadge status={job.status} />
                <span className="text-text-muted text-xs">
                  {job.total_attempts} attempts, {job.tokens_used_today} tokens today
                </span>
              </div>
              {job.synthesis_logs?.map((log, i) => (
                <div key={i} className="pl-4 border-l-2 border-border mb-1.5">
                  <p className="m-0 mb-0.5 text-text-muted text-[11px]">
                    Attempt {log.attempt_number} — {log.outcome} ({log.tokens_used} tokens)
                  </p>
                  <p className="m-0 text-text-secondary text-xs">{log.reasoning_summary}</p>
                  {log.sources_used.length > 0 && (
                    <p className="m-0 mt-0.5 text-text-muted text-[11px]">
                      Sources: {log.sources_used.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </Section>

      {/* Manual resolve trigger */}
      {!hasGoodSolutions && problem.status === "open" && !showResolve && (
        <button
          onClick={() => setShowResolve(true)}
          className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium border-none cursor-pointer hover:bg-accent-hover transition-colors"
        >
          Resolve manually
        </button>
      )}

      {/* Manual resolution form */}
      {showResolve && (
        <Section title="Manual Resolution">
          <label className="block text-text-muted text-xs mb-1">Solution Summary</label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            className="bg-bg-base text-text-primary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent w-full box-border resize-y font-inherit"
            placeholder="Brief summary of the solution..."
          />

          <label className="block text-text-muted text-xs mb-1 mt-3">Solution Steps</label>
          {steps.map((step, i) => (
            <div key={i} className="flex gap-2 mb-1.5 items-center">
              <span className="text-text-muted text-xs min-w-[20px]">{i + 1}.</span>
              <input
                type="text"
                value={step}
                onChange={(e) => updateStep(i, e.target.value)}
                className="bg-bg-base text-text-primary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent flex-1"
                placeholder={`Step ${i + 1}...`}
              />
              <button
                onClick={() => moveStep(i, -1)}
                disabled={i === 0}
                title="Move up"
                className="bg-transparent text-text-muted border border-border rounded-md p-1 cursor-pointer hover:bg-bg-elevated transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => moveStep(i, 1)}
                disabled={i === steps.length - 1}
                title="Move down"
                className="bg-transparent text-text-muted border border-border rounded-md p-1 cursor-pointer hover:bg-bg-elevated transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => removeStep(i)}
                disabled={steps.length <= 1}
                title="Remove"
                className="bg-transparent text-danger border border-border rounded-md p-1 cursor-pointer hover:bg-danger-muted transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={addStep}
            className="inline-flex items-center gap-1 bg-transparent text-text-secondary border border-border hover:bg-bg-elevated rounded-md px-3 py-1.5 text-sm cursor-pointer transition-colors mb-3"
          >
            <Plus className="w-3.5 h-3.5" />
            Add step
          </button>

          <label className="block text-text-muted text-xs mb-1 mt-2">Admin Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="bg-bg-base text-text-primary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent w-full box-border resize-y font-inherit"
            placeholder="Internal notes..."
          />

          <div className="flex gap-2 mt-3">
            <button
              onClick={handleResolve}
              disabled={submitting || !summary.trim() || steps.filter((s) => s.trim()).length === 0}
              className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium border-none cursor-pointer hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting..." : "Submit Solution"}
            </button>
            <button
              onClick={() => setShowResolve(false)}
              className="bg-transparent text-text-secondary border border-border hover:bg-bg-elevated rounded-md px-4 py-2 text-sm cursor-pointer transition-colors"
            >
              Cancel
            </button>
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg-surface border border-border rounded-lg p-5 mb-4">
      <h3 className="m-0 mb-3 text-[11px] font-semibold text-text-muted uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="mb-1.5">
      <span className="text-text-muted text-xs">{label}: </span>
      <span className="text-text-secondary text-sm">{value || "—"}</span>
    </div>
  );
}
