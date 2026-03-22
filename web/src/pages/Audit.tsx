import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { AuditEntry } from "@/types/api";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

const PER_PAGE = 100;

export function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [actorTypeFilter, setActorTypeFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [expandedReasons, setExpandedReasons] = useState<Set<number>>(new Set());

  const fetchEntries = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE) });
    if (actorTypeFilter) params.set("actor_type", actorTypeFilter);
    if (actionFilter) params.set("action", actionFilter);

    api.listAudit(params)
      .then((res) => { setEntries(res.items); setTotal(res.total); setError(""); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, actorTypeFilter, actionFilter]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const totalPages = Math.ceil(total / PER_PAGE);

  const toggleReason = (id: number) => {
    setExpandedReasons((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportCsv = () => {
    const headers = ["timestamp", "actor_type", "actor_id_hash", "action", "target_id", "reason"];
    const rows = entries.map((e) =>
      [e.timestamp, e.actor_type, e.actor_id_hash, e.action, e.target_id || "", e.reason || ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grexis-audit-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const actorBadgeClass = (actorType: string) => {
    if (actorType === "admin") return "bg-info-muted text-info";
    if (actorType === "agent") return "bg-accent-muted text-accent";
    return "bg-bg-elevated text-text-muted";
  };

  return (
    <div>
      <PageHeader
        title="Audit Log"
        description="Complete record of every action taken on the platform — by admins, agents, and the system. Use this for accountability, debugging, and compliance."
      >
        <button
          onClick={exportCsv}
          className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium border-none cursor-pointer hover:bg-accent-hover transition-colors flex items-center gap-2"
        >
          <Download size={14} />
          Export CSV
        </button>
      </PageHeader>

      <div className="flex gap-2 flex-wrap mb-4">
        <select
          value={actorTypeFilter}
          onChange={(e) => { setActorTypeFilter(e.target.value); setPage(1); }}
          className="bg-bg-base text-text-primary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="">All actors</option>
          <option value="admin">admin</option>
          <option value="agent">agent</option>
          <option value="system">system</option>
        </select>
        <input
          type="text"
          placeholder="Filter by action..."
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          className="bg-bg-base text-text-primary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent w-44"
        />
      </div>

      {error && <p className="text-danger mb-3">{error}</p>}

      <div className={`bg-bg-surface border border-border rounded-lg overflow-auto transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-bg-elevated">
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Timestamp</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Actor</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Actor ID</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Action</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Target</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Reason</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && !loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-text-muted">No entries</td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="border-t border-border hover:bg-bg-elevated/50">
                  <td className="px-4 py-2.5 text-text-secondary text-xs whitespace-nowrap">
                    {new Date(entry.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-medium ${actorBadgeClass(entry.actor_type)}`}>
                      {entry.actor_type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary font-mono text-xs">
                    {entry.actor_id_hash.substring(0, 12)}...
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary">{entry.action}</td>
                  <td className="px-4 py-2.5 text-text-secondary font-mono text-xs">
                    {entry.target_id ? `${entry.target_id.substring(0, 8)}...` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary">
                    {entry.reason ? (
                      <span>
                        {expandedReasons.has(entry.id)
                          ? entry.reason
                          : entry.reason.length > 40
                            ? entry.reason.substring(0, 40) + "..."
                            : entry.reason}
                        {entry.reason.length > 40 && (
                          <button
                            onClick={() => toggleReason(entry.id)}
                            className="bg-transparent border-none text-accent cursor-pointer text-xs ml-1 hover:underline"
                          >
                            {expandedReasons.has(entry.id) ? "less" : "more"}
                          </button>
                        )}
                      </span>
                    ) : "—"}
                  </td>
                </tr>
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
