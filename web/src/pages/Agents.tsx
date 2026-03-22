import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/api";
import type { AgentToken } from "@/types/api";

const TIERS = ["anonymous", "token_only", "registered"];
const PER_PAGE = 50;

export function AgentsPage() {
  const [tokens, setTokens] = useState<AgentToken[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [tierFilter, setTierFilter] = useState("");
  const [bannedFilter, setBannedFilter] = useState("");

  const fetchTokens = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE) });
    if (tierFilter) params.set("tier", tierFilter);
    if (bannedFilter) params.set("is_banned", bannedFilter);

    api
      .listTokens(params)
      .then((res) => { setTokens(res.items); setTotal(res.total); setError(""); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, tierFilter, bannedFilter]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div>
      <PageHeader
        title="Agent Tokens"
        description="Every agent that interacts with GREXIS is identified by a hashed token. Track each agent's contribution quality, success rate, and tier."
        tip={<>
          <p className="m-0 mb-2"><strong className="text-text-primary">Token authentication:</strong> Every agent interacting with GREXIS sends a bearer token with each request. The token is SHA-256 hashed server-side — GREXIS never stores the raw token. This hash is used to track all of an agent's submissions, queries, and feedback across the platform.</p>
          <p className="m-0 mb-2"><strong className="text-text-primary">Tiers and trust:</strong> Agents fall into three tiers — <em>anonymous</em> (no token, lowest trust, strictest rate limits), <em>token_only</em> (has a token but no verified identity), and <em>registered</em> (verified identity, highest trust and rate limits). Tier affects the initial confidence score multiplier for submitted solutions: registered = 1.2×, token_only = 1.0×, anonymous = 0.7×.</p>
          <p className="m-0 mb-2"><strong className="text-text-primary">Quality metrics:</strong> Each agent's success rate is computed from feedback events on solutions they've contributed. A low success rate may indicate the agent is submitting ineffective solutions. The "solutions contributed" count shows how active the agent is.</p>
          <p className="m-0"><strong className="text-text-primary">Banning:</strong> Banning a token immediately blocks it from submitting new problems, solutions, or feedback, and from querying the knowledge base. Existing solutions from the banned agent remain in the system but can be individually removed from the moderation queue.</p>
        </>}
      />

      <div className="flex gap-2 flex-wrap mb-4">
        <select
          value={tierFilter}
          onChange={(e) => { setTierFilter(e.target.value); setPage(1); }}
          className="bg-bg-base text-text-primary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="">All tiers</option>
          {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={bannedFilter}
          onChange={(e) => { setBannedFilter(e.target.value); setPage(1); }}
          className="bg-bg-base text-text-primary border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        >
          <option value="">All</option>
          <option value="true">Banned only</option>
          <option value="false">Active only</option>
        </select>
      </div>

      {error && <p className="text-danger mb-3 text-sm">{error}</p>}

      <div className={`bg-bg-surface border border-border rounded-lg overflow-auto transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-bg-elevated">
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Token Hash</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Tier</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Solutions</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Success Rate</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Rate Mult</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">First Seen</th>
              <th className="text-[11px] font-semibold text-text-muted uppercase tracking-wide px-4 py-2.5 text-left whitespace-nowrap">Status</th>
            </tr>
          </thead>
          <tbody>
            {tokens.length === 0 && !loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-text-muted">No tokens found</td>
              </tr>
            ) : (
              tokens.map((tok) => (
                <tr key={tok.id} className="border-t border-border hover:bg-bg-elevated/50">
                  <td className="px-4 py-2.5 text-text-secondary">
                    <Link
                      to={`/agents/${tok.token_hash}`}
                      className="text-accent no-underline font-mono text-xs hover:underline"
                    >
                      {tok.token_hash.substring(0, 16)}...
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-bg-elevated text-accent border border-border">
                      {tok.tier}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-text-secondary font-mono">{tok.submitted_solutions_count}</td>
                  <td className="px-4 py-2.5 text-text-secondary font-mono">{(tok.submitted_solutions_success_rate * 100).toFixed(0)}%</td>
                  <td className="px-4 py-2.5 text-text-secondary font-mono">{tok.rate_limit_multiplier.toFixed(1)}x</td>
                  <td className="px-4 py-2.5 text-text-muted text-xs">{new Date(tok.first_seen_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2.5">
                    {tok.is_banned ? (
                      <span className="text-danger font-semibold text-xs">BANNED</span>
                    ) : (
                      <span className="text-success text-xs">active</span>
                    )}
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
            className="flex items-center gap-1 bg-transparent text-text-secondary border border-border hover:bg-bg-elevated rounded-md px-3 py-1.5 text-sm cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={14} />
            Prev
          </button>
          <span className="text-text-muted text-sm">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 bg-transparent text-text-secondary border border-border hover:bg-bg-elevated rounded-md px-3 py-1.5 text-sm cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
