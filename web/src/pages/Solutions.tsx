import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { SourceBadge } from "@/components/SourceBadge";
import type { Solution } from "@/types/api";

const STATUSES = ["active", "pending_review", "flagged", "inactive", "pending_index"];
const SOURCES = ["agent_contributed", "scheduled_agent", "human_curated", "federated"];
const PER_PAGE = 50;

const confidenceClass = (score: number) => {
  if (score >= 0.65) return "text-success";
  if (score >= 0.3) return "text-warning";
  return "text-danger";
};

export function SolutionsPage() {
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [frameworkFilter, setFrameworkFilter] = useState("");
  const [errorTypeFilter, setErrorTypeFilter] = useState("");
  const [searchText, setSearchText] = useState("");

  const fetchSolutions = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(PER_PAGE),
    });
    if (statusFilter) params.set("status", statusFilter);
    if (sourceFilter) params.set("source", sourceFilter);
    if (frameworkFilter) params.set("framework", frameworkFilter);
    if (errorTypeFilter) params.set("error_type", errorTypeFilter);
    if (searchText) params.set("q", searchText);

    api
      .listSolutions(params)
      .then((res) => {
        setSolutions(res.items);
        setTotal(res.total);
        setError("");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, statusFilter, sourceFilter, frameworkFilter, errorTypeFilter, searchText]);

  useEffect(() => {
    fetchSolutions();
  }, [fetchSolutions]);

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div>
      <PageHeader
        title="Solutions"
        description="Verified resolution steps that agents can query when they encounter errors. Each solution has a confidence score based on community feedback and validation."
        tip={<>
          <p className="m-0 mb-2"><strong className="text-text-primary">Lifecycle:</strong> When an agent submits a solution, it starts as <code className="text-xs bg-bg-elevated px-1 py-0.5 rounded">pending_review</code>. Once reviewed (automatically or by an admin), it moves to <code className="text-xs bg-bg-elevated px-1 py-0.5 rounded">active</code>. If it accumulates consecutive failures, it gets <code className="text-xs bg-bg-elevated px-1 py-0.5 rounded">flagged</code> and sent to moderation. Superseded or removed solutions become <code className="text-xs bg-bg-elevated px-1 py-0.5 rounded">inactive</code>.</p>
          <p className="m-0 mb-2"><strong className="text-text-primary">Confidence scoring:</strong> Each solution has a confidence score (0–1) computed from feedback events, time decay, source weight, and diversity. Agents that query GREXIS receive solutions ranked by confidence — high-confidence solutions appear first. A score above 0.65 is considered reliable.</p>
          <p className="m-0 mb-2"><strong className="text-text-primary">Sources:</strong> Solutions can come from three places — <em>agent_contributed</em> (submitted by an agent that found a fix), <em>scheduled_agent</em> (synthesized by the autonomous LLM agent), or <em>human_curated</em> (written by an admin). Human-curated solutions carry the highest trust weight (1.0).</p>
          <p className="m-0"><strong className="text-text-primary">Search:</strong> Use the filters and search bar to find solutions by status, source, framework, or error type. Click any row to view its full detail page where you can approve, flag, supersede, or remove it.</p>
        </>}
      />

      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap mb-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-text-muted pointer-events-none" />
          <input
            type="text"
            placeholder="Search summary..."
            value={searchText}
            onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
            className="bg-bg-base text-text-primary border border-border rounded-md pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-bg-base text-text-primary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
          className="bg-bg-base text-text-primary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="">All sources</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Framework..."
          value={frameworkFilter}
          onChange={(e) => { setFrameworkFilter(e.target.value); setPage(1); }}
          className="bg-bg-base text-text-primary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent w-[120px]"
        />
        <input
          type="text"
          placeholder="Error type..."
          value={errorTypeFilter}
          onChange={(e) => { setErrorTypeFilter(e.target.value); setPage(1); }}
          className="bg-bg-base text-text-primary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent w-[140px]"
        />
      </div>

      {error && (
        <p className="text-danger mb-3 text-sm flex items-center gap-2">
          {error}
          <button
            onClick={fetchSolutions}
            className="px-2 py-1 rounded-md text-sm font-medium border-none cursor-pointer transition-colors bg-transparent text-text-secondary border border-border hover:bg-bg-elevated"
          >
            Retry
          </button>
        </p>
      )}

      {/* Table */}
      <div className={`bg-bg-surface border border-border rounded-lg overflow-auto transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-bg-elevated">
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Summary</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Framework</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Error Type</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Confidence</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Success</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Source</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Status</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Validated</th>
            </tr>
          </thead>
          <tbody>
            {solutions.length === 0 && !loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-text-muted">
                  No solutions found
                </td>
              </tr>
            ) : (
              solutions.map((sol) => (
                <tr key={sol.id} className="border-t border-border hover:bg-bg-elevated/50">
                  <td className="px-4 py-2.5 text-text-secondary">
                    <Link
                      to={`/solutions/${sol.id}`}
                      className="text-accent hover:text-accent-hover no-underline"
                    >
                      {sol.solution_summary.length > 80
                        ? sol.solution_summary.substring(0, 80) + "..."
                        : sol.solution_summary}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary">
                    {sol.framework}
                    <span className="text-text-muted text-xs"> {sol.framework_version}</span>
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary">{sol.error_type}</td>
                  <td className="px-4 py-2.5">
                    <span className={`font-mono font-semibold ${confidenceClass(sol.confidence_score)}`}>
                      {sol.confidence_score.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary font-mono">
                    {(sol.success_rate * 100).toFixed(0)}%
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary"><SourceBadge source={sol.source} /></td>
                  <td className="px-4 py-2.5 text-text-secondary"><StatusBadge status={sol.status} /></td>
                  <td className="px-4 py-2.5 text-text-muted text-xs">
                    {sol.last_validated_at
                      ? new Date(sol.last_validated_at).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 mt-3 justify-center">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium border-none cursor-pointer transition-colors bg-transparent text-text-secondary border border-border hover:bg-bg-elevated disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="size-3.5" />
            Prev
          </button>
          <span className="text-text-muted text-sm">
            Page {page} of {totalPages} ({total} total)
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium border-none cursor-pointer transition-colors bg-transparent text-text-secondary border border-border hover:bg-bg-elevated disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
