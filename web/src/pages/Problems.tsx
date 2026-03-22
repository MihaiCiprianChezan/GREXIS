import { useState, useEffect, useCallback, Fragment } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { SeverityBadge } from "@/components/SeverityBadge";
import type { Problem } from "@/types/api";

const STATUSES = ["open", "solved", "stale"];
const SEVERITIES = ["blocking", "degraded", "cosmetic"];
const PER_PAGE = 50;

export function ProblemsPage() {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [statusFilter, setStatusFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [frameworkFilter, setFrameworkFilter] = useState("");

  // Quick resolve
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [resolveSteps, setResolveSteps] = useState("");
  const [resolveSummary, setResolveSummary] = useState("");
  const [resolveSubmitting, setResolveSubmitting] = useState(false);

  const fetchProblems = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(PER_PAGE),
    });
    if (statusFilter) params.set("status", statusFilter);
    if (severityFilter) params.set("severity", severityFilter);
    if (frameworkFilter) params.set("framework", frameworkFilter);

    api
      .listProblems(params)
      .then((res) => {
        setProblems(res.items);
        setTotal(res.total);
        setError("");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, statusFilter, severityFilter, frameworkFilter]);

  useEffect(() => {
    fetchProblems();
  }, [fetchProblems]);

  const handleQuickResolve = async (problemId: string) => {
    if (!resolveSteps.trim() || !resolveSummary.trim()) return;
    setResolveSubmitting(true);
    try {
      await api.createSolution({
        parent_problem_id: problemId,
        solution_steps: resolveSteps.split("\n").filter((s) => s.trim()),
        solution_summary: resolveSummary,
        source: "human_curated",
        status: "active",
      });
      setResolveId(null);
      setResolveSteps("");
      setResolveSummary("");
      fetchProblems();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create solution");
    } finally {
      setResolveSubmitting(false);
    }
  };

  const totalPages = Math.ceil(total / PER_PAGE);

  const age = (created: string) => {
    const ms = Date.now() - new Date(created).getTime();
    const hours = Math.floor(ms / 3600000);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  return (
    <div>
      <PageHeader
        title="Problems"
        description="Errors reported by agents that don't yet have good solutions. Blocking problems prevent agents from completing tasks and should be prioritized."
        tip="When an agent encounters an error, it submits a problem here. GREXIS deduplicates similar errors and tracks duplicate counts. Problems with no high-confidence solution show a 'Quick resolve' button so you can manually write a fix. The scheduled agent also attempts to solve open problems automatically."
      />

      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap mb-4">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-bg-base text-text-primary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={severityFilter}
          onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
          className="bg-bg-base text-text-primary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="">All severities</option>
          {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          type="text"
          placeholder="Framework..."
          value={frameworkFilter}
          onChange={(e) => { setFrameworkFilter(e.target.value); setPage(1); }}
          className="bg-bg-base text-text-primary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent w-36"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-danger text-sm mb-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
          <button onClick={fetchProblems} className="bg-transparent text-text-secondary border border-border hover:bg-bg-elevated rounded-md px-4 py-2 text-sm cursor-pointer transition-colors">
            Retry
          </button>
        </div>
      )}

      <div className={`bg-bg-surface border border-border rounded-lg overflow-auto transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-bg-elevated">
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Error Type</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Framework</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Severity</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Duplicates</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Status</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Last Attempted</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Age</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {problems.length === 0 && !loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-text-muted">
                  No problems found
                </td>
              </tr>
            ) : (
              problems.map((prob) => (
                <Fragment key={prob.id}>
                  <tr className="border-t border-border hover:bg-bg-elevated/50">
                    <td className="px-4 py-2.5 text-text-secondary">
                      <Link to={`/problems/${prob.id}`} className="text-accent hover:underline">
                        {prob.error_type}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary">
                      {prob.framework}
                      <span className="text-text-muted text-xs"> {prob.framework_version}</span>
                    </td>
                    <td className="px-4 py-2.5 text-text-secondary"><SeverityBadge severity={prob.severity} /></td>
                    <td className="px-4 py-2.5 text-text-secondary font-mono">{prob.duplicate_count}</td>
                    <td className="px-4 py-2.5 text-text-secondary"><StatusBadge status={prob.status} /></td>
                    <td className="px-4 py-2.5 text-text-muted text-xs">
                      {prob.last_attempted_at ? new Date(prob.last_attempted_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-text-muted text-xs">{age(prob.created_at)}</td>
                    <td className="px-4 py-2.5 text-text-secondary">
                      {prob.severity === "blocking" && prob.status === "open" && (
                        <button
                          onClick={() => setResolveId(resolveId === prob.id ? null : prob.id)}
                          className="px-2.5 py-1 bg-success-muted text-success border-none rounded cursor-pointer text-xs font-medium hover:opacity-80 transition-opacity"
                        >
                          Quick resolve
                        </button>
                      )}
                    </td>
                  </tr>
                  {resolveId === prob.id && (
                    <tr key={`resolve-${prob.id}`}>
                      <td colSpan={8} className="px-4 py-4 bg-bg-base border-t border-border">
                        <div className="max-w-xl">
                          <h4 className="text-sm font-semibold text-text-primary mb-3">Quick Resolve</h4>
                          <label className="block text-text-muted text-xs mb-1">Summary</label>
                          <input
                            type="text"
                            value={resolveSummary}
                            onChange={(e) => setResolveSummary(e.target.value)}
                            className="bg-bg-base text-text-primary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent w-full mb-2"
                            placeholder="Brief solution summary..."
                          />
                          <label className="block text-text-muted text-xs mb-1">Steps (one per line)</label>
                          <textarea
                            value={resolveSteps}
                            onChange={(e) => setResolveSteps(e.target.value)}
                            rows={4}
                            className="bg-bg-base text-text-primary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent w-full box-border resize-y"
                            placeholder={"Step 1\nStep 2\nStep 3"}
                          />
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => handleQuickResolve(prob.id)}
                              disabled={resolveSubmitting || !resolveSteps.trim() || !resolveSummary.trim()}
                              className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium border-none cursor-pointer hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {resolveSubmitting ? "Submitting..." : "Submit Solution"}
                            </button>
                            <button
                              onClick={() => { setResolveId(null); setResolveSteps(""); setResolveSummary(""); }}
                              className="bg-transparent text-text-secondary border border-border hover:bg-bg-elevated rounded-md px-4 py-2 text-sm cursor-pointer transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
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
          <span className="text-text-muted text-sm">Page {page} of {totalPages} ({total} total)</span>
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
