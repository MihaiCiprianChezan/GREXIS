import { useState, useEffect, useCallback, Fragment } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { usePolling } from "@/hooks/usePolling";
import type { AgentJob, Metrics } from "@/types/api";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

const PER_PAGE = 50;

export function JobsPage() {
  const [jobs, setJobs] = useState<AgentJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());

  const fetchData = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE) });
    if (statusFilter) params.set("status", statusFilter);

    api.listJobs(params)
      .then((res) => { setJobs(res.items); setTotal(res.total); setError(""); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    api.getMetrics().then(setMetrics).catch(() => {});
  }, [page, statusFilter]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  usePolling(fetchData, 5000);

  const totalPages = Math.ceil(total / PER_PAGE);

  const toggleExpand = (id: string) => {
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <PageHeader
        title="Scheduled Agent"
        description="An autonomous agent that periodically attempts to solve open problems. It uses an LLM to synthesize solutions, then submits them for review. Monitor its token budget, attempts, and success rate here."
        tip="The agent picks up open problems (prioritizing blocking ones), generates candidate solutions using an LLM, and submits them to GREXIS. Each attempt is logged with reasoning, token usage, and outcome. The agent pauses automatically if its 7-day success rate drops below 35% to avoid wasting tokens."
      />

      {/* Current status */}
      {metrics && (
        <div className="flex gap-4 flex-wrap mb-6">
          <StatusCard label="Daily Tokens Used" value={`${metrics.daily_tokens_used} / ${metrics.daily_token_budget}`} />
          <StatusCard label="Problems Attempted Today" value={String(metrics.problems_attempted_today)} />
          <StatusCard label="Problems Solved Today" value={String(metrics.problems_solved_today)} />
          <StatusCard label="7-Day Success Rate" value={`${metrics.agent_7d_success_rate.toFixed(1)}%`} />
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-bg-base text-text-primary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="">All statuses</option>
          <option value="queued">queued</option>
          <option value="running">running</option>
          <option value="completed">completed</option>
          <option value="failed">failed</option>
          <option value="skipped">skipped</option>
        </select>
      </div>

      {error && <p className="text-danger mb-3">{error}</p>}

      <div className={`bg-bg-surface border border-border rounded-lg overflow-auto transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-bg-elevated">
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left w-8"></th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Problem</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Status</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Today</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Total</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Tokens</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Next Attempt</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && !loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-text-muted">No jobs</td>
              </tr>
            ) : (
              jobs.map((job) => (
                <Fragment key={job.id}>
                  <tr className="border-t border-border hover:bg-bg-elevated/50">
                    <td className="px-4 py-2.5">
                      {job.synthesis_logs && job.synthesis_logs.length > 0 && (
                        <button
                          onClick={() => toggleExpand(job.id)}
                          className="bg-transparent border-none text-accent cursor-pointer flex items-center p-0"
                        >
                          {expandedJobs.has(job.id)
                            ? <ChevronDown size={14} />
                            : <ChevronRight size={14} />
                          }
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/problems/${job.problem_id}`}
                        className="text-accent no-underline font-mono text-xs hover:underline"
                      >
                        {job.problem_id.substring(0, 8)}...
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary"><StatusBadge status={job.status} /></td>
                    <td className="px-4 py-2.5 text-text-secondary font-mono">{job.attempts_today}</td>
                    <td className="px-4 py-2.5 text-text-secondary font-mono">{job.total_attempts}</td>
                    <td className="px-4 py-2.5 text-text-secondary font-mono">{job.tokens_used_today}</td>
                    <td className="px-4 py-2.5 text-text-muted text-xs">
                      {job.next_attempt_after ? new Date(job.next_attempt_after).toLocaleString() : "—"}
                    </td>
                  </tr>
                  {expandedJobs.has(job.id) && job.synthesis_logs && (
                    <tr key={`logs-${job.id}`}>
                      <td colSpan={7} className="px-4 pb-4 pt-2 pl-10 bg-bg-base">
                        {job.synthesis_logs.map((log, i) => (
                          <div key={i} className="border-l-2 border-border pl-3 mb-2">
                            <div className="flex gap-2 items-center mb-0.5">
                              <span className="text-text-muted text-[11px] font-semibold uppercase tracking-wide">
                                Attempt {log.attempt_number}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-medium text-white ${
                                log.outcome === "success"
                                  ? "bg-success"
                                  : log.outcome === "failed"
                                    ? "bg-danger"
                                    : "bg-bg-elevated text-text-muted"
                              }`}>
                                {log.outcome}
                              </span>
                              <span className="text-text-muted text-[11px]">
                                {log.tokens_used} tokens
                              </span>
                            </div>
                            <p className="my-0.5 text-text-secondary text-xs">
                              {log.reasoning_summary}
                            </p>
                            {log.sources_used.length > 0 && (
                              <p className="mt-0.5 text-text-muted text-[11px]">
                                Sources: {log.sources_used.join(", ")}
                              </p>
                            )}
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2 mt-3 justify-center">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="bg-transparent text-text-secondary border border-border hover:bg-bg-elevated rounded-md px-4 py-2 text-sm cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <span className="text-text-muted text-sm">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="bg-transparent text-text-secondary border border-border hover:bg-bg-elevated rounded-md px-4 py-2 text-sm cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-surface border border-border rounded-lg px-4 py-3 flex-1 min-w-40">
      <p className="text-text-muted text-[11px] uppercase tracking-wide mb-1">{label}</p>
      <p className="text-text-primary text-[28px] font-semibold tracking-tight font-mono leading-none">{value}</p>
    </div>
  );
}
