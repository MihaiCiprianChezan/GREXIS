import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
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
    return <div><h1 style={{ margin: "0 0 16px" }}>Problem Detail</h1><p style={{ color: "#888" }}>Loading...</p></div>;
  }

  if (error && !problem) {
    return (
      <div>
        <h1 style={{ margin: "0 0 16px" }}>Problem Detail</h1>
        <p style={{ color: "#d62828" }}>{error}</p>
        <Link to="/problems" style={{ color: "#a8dadc" }}>Back to problems</Link>
      </div>
    );
  }

  if (!problem) return null;

  const hasGoodSolutions = problem.solutions?.some((s) => s.confidence_score >= 0.5);

  return (
    <div>
      <Link to="/problems" style={{ color: "#a8dadc", textDecoration: "none", fontSize: "0.85rem" }}>&larr; Problems</Link>

      {/* Header */}
      <div style={{ margin: "16px 0", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: "1.3rem" }}>{problem.error_type}</h1>
        <SeverityBadge severity={problem.severity} />
        <StatusBadge status={problem.status} />
        <span style={{ color: "#888", fontSize: "0.85rem" }}>
          {problem.duplicate_count} duplicate{problem.duplicate_count !== 1 ? "s" : ""}
        </span>
      </div>

      {error && <p style={{ color: "#d62828", marginBottom: "12px" }}>{error}</p>}

      {/* Failure signature */}
      <Section title="Failure Signature">
        <KV label="Error Code" value={problem.error_code} />
        <KV label="Tool Name" value={problem.tool_name} />
        <KV label="Operation" value={problem.operation} />
        <KV label="Details" value={problem.details} />
      </Section>

      {/* Goal state */}
      <Section title="Goal State">
        <p style={{ color: "#ccc", margin: 0, whiteSpace: "pre-wrap" }}>{problem.goal_state}</p>
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
          <pre style={{ margin: 0, fontFamily: "monospace", fontSize: "0.8rem", color: "#ccc", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {JSON.stringify(problem.execution_context, null, 2)}
          </pre>
        </Section>
      )}

      {/* Existing solutions */}
      <Section title="Existing Solutions">
        {(!problem.solutions || problem.solutions.length === 0) ? (
          <p style={{ color: "#888", margin: 0, fontSize: "0.85rem" }}>No linked solutions</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr>
                <th style={thSmall}>Summary</th>
                <th style={thSmall}>Confidence</th>
                <th style={thSmall}>Status</th>
              </tr>
            </thead>
            <tbody>
              {problem.solutions.map((sol) => (
                <tr key={sol.id} style={{ borderBottom: "1px solid #0f3460" }}>
                  <td style={tdSmall}>
                    <Link to={`/solutions/${sol.id}`} style={{ color: "#a8dadc", textDecoration: "none" }}>
                      {sol.solution_summary.substring(0, 60)}
                    </Link>
                  </td>
                  <td style={{ ...tdSmall, fontFamily: "monospace" }}>{sol.confidence_score.toFixed(2)}</td>
                  <td style={tdSmall}><StatusBadge status={sol.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Scheduled agent attempts */}
      <Section title="Scheduled Agent Attempts">
        {(!problem.jobs || problem.jobs.length === 0) ? (
          <p style={{ color: "#888", margin: 0, fontSize: "0.85rem" }}>No agent attempts</p>
        ) : (
          problem.jobs.map((job) => (
            <div key={job.id} style={{ marginBottom: "12px" }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px" }}>
                <StatusBadge status={job.status} />
                <span style={{ color: "#888", fontSize: "0.8rem" }}>
                  {job.total_attempts} attempts, {job.tokens_used_today} tokens today
                </span>
              </div>
              {job.synthesis_logs?.map((log, i) => (
                <div key={i} style={{ paddingLeft: "16px", borderLeft: "2px solid #0f3460", marginBottom: "6px" }}>
                  <p style={{ margin: "0 0 2px", color: "#a0a0b8", fontSize: "0.75rem" }}>
                    Attempt {log.attempt_number} — {log.outcome} ({log.tokens_used} tokens)
                  </p>
                  <p style={{ margin: 0, color: "#ccc", fontSize: "0.8rem" }}>{log.reasoning_summary}</p>
                  {log.sources_used.length > 0 && (
                    <p style={{ margin: "2px 0 0", color: "#888", fontSize: "0.75rem" }}>
                      Sources: {log.sources_used.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </Section>

      {/* Manual resolve */}
      {!hasGoodSolutions && problem.status === "open" && !showResolve && (
        <button
          onClick={() => setShowResolve(true)}
          style={{ padding: "10px 20px", backgroundColor: "#2d6a4f", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" }}
        >
          Resolve manually
        </button>
      )}

      {showResolve && (
        <Section title="Manual Resolution">
          <label style={labelStyle}>Solution Summary</label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            style={textareaStyle}
            placeholder="Brief summary of the solution..."
          />

          <label style={{ ...labelStyle, marginTop: "12px" }}>Solution Steps</label>
          {steps.map((step, i) => (
            <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "6px", alignItems: "center" }}>
              <span style={{ color: "#888", fontSize: "0.8rem", minWidth: "20px" }}>{i + 1}.</span>
              <input
                type="text"
                value={step}
                onChange={(e) => updateStep(i, e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
                placeholder={`Step ${i + 1}...`}
              />
              <button onClick={() => moveStep(i, -1)} disabled={i === 0} style={smallBtn} title="Move up">&uarr;</button>
              <button onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} style={smallBtn} title="Move down">&darr;</button>
              <button onClick={() => removeStep(i)} disabled={steps.length <= 1} style={{ ...smallBtn, color: "#d62828" }} title="Remove">x</button>
            </div>
          ))}
          <button onClick={addStep} style={{ ...smallBtn, marginBottom: "12px" }}>+ Add step</button>

          <label style={{ ...labelStyle, marginTop: "8px" }}>Admin Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            style={textareaStyle}
            placeholder="Internal notes..."
          />

          <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
            <button
              onClick={handleResolve}
              disabled={submitting || !summary.trim() || steps.filter((s) => s.trim()).length === 0}
              style={{ padding: "8px 20px", backgroundColor: "#2d6a4f", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: 600 }}
            >
              {submitting ? "Submitting..." : "Submit Solution"}
            </button>
            <button
              onClick={() => setShowResolve(false)}
              style={{ padding: "8px 20px", backgroundColor: "transparent", color: "#ccc", border: "1px solid #555", borderRadius: "4px", cursor: "pointer" }}
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
const inputStyle: React.CSSProperties = { padding: "6px 10px", backgroundColor: "#1a1a2e", color: "#e0e0e0", border: "1px solid #0f3460", borderRadius: "4px", fontSize: "0.85rem" };
const labelStyle: React.CSSProperties = { display: "block", color: "#888", fontSize: "0.8rem", marginBottom: "4px" };
const textareaStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box" as const, backgroundColor: "#1a1a2e", color: "#e0e0e0", border: "1px solid #0f3460", borderRadius: "4px", padding: "8px", fontFamily: "inherit", fontSize: "0.85rem", resize: "vertical" as const };
const smallBtn: React.CSSProperties = { padding: "4px 8px", backgroundColor: "transparent", color: "#a0a0b8", border: "1px solid #555", borderRadius: "4px", cursor: "pointer", fontSize: "0.8rem" };
