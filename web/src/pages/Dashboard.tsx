import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import type { Metrics, AuditEntry } from "@/types/api";
import { AlertTriangle, Activity, Clock, Zap, Shield, Lightbulb, BarChart3 } from "lucide-react";

export function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [recentAudit, setRecentAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState("");

  const fetchData = useCallback(() => {
    api.getMetrics().then(setMetrics).catch(() => setError("Failed to load metrics"));
    api.listAudit(new URLSearchParams({ per_page: "20", page: "1" }))
      .then((res) => setRecentAudit(res.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  usePolling(fetchData, 5000);

  if (error && !metrics) {
    return (
      <div>
        <h1 className="text-xl font-semibold tracking-tight mb-4">Dashboard</h1>
        <p className="text-danger text-sm">{error}</p>
        <button onClick={fetchData} className="px-4 py-2 bg-accent text-white rounded-md text-sm cursor-pointer border-none hover:bg-accent-hover transition-colors">
          Retry
        </button>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div>
        <h1 className="text-xl font-semibold tracking-tight mb-6">Dashboard</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-[100px] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const alerts: string[] = [];
  if (metrics.agent_7d_success_rate < 35) alerts.push("Scheduled agent paused — success rate below 35%");
  if (metrics.moderation_queue > 20) alerts.push(`Moderation queue has ${metrics.moderation_queue} items`);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold tracking-tight m-0">Dashboard</h1>
        <span className="text-text-muted text-xs">Auto-refreshes every 5s</span>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          icon={<AlertTriangle size={16} />}
          label="Open Problems"
          value={metrics.open_problems}
          sub={<span className="text-danger">{metrics.blocking_problems} blocking</span>}
          iconColor="text-warning"
        />
        <MetricCard
          icon={<Lightbulb size={16} />}
          label="Active Solutions"
          value={metrics.active_solutions}
          iconColor="text-success"
        />
        <MetricCard
          icon={<Shield size={16} />}
          label="Moderation Queue"
          value={metrics.moderation_queue}
          iconColor="text-info"
        />
        <MetricCard
          icon={<BarChart3 size={16} />}
          label="Agent 7d Success"
          value={`${metrics.agent_7d_success_rate?.toFixed(1) ?? 0}%`}
          iconColor="text-accent"
        />
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="bg-warning-muted border border-[oklch(0.78_0.15_75/30%)] rounded-lg px-4 py-3 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-warning" />
            <span className="text-warning text-xs font-semibold uppercase tracking-wide">Alerts</span>
          </div>
          <ul className="m-0 pl-5">
            {alerts.map((a, i) => (
              <li key={i} className="text-warning text-sm mb-1">{a}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-6">
        {/* Recent activity */}
        <div>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">Recent Activity</h2>
          <div className="bg-bg-surface border border-border rounded-lg overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-bg-elevated">
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-text-muted uppercase tracking-wide">Time</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-text-muted uppercase tracking-wide">Actor</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-text-muted uppercase tracking-wide">Action</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-text-muted uppercase tracking-wide">Target</th>
                </tr>
              </thead>
              <tbody>
                {recentAudit.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-text-muted text-sm">
                      No recent activity
                    </td>
                  </tr>
                ) : (
                  recentAudit.map((entry) => (
                    <tr key={entry.id} className="border-t border-border hover:bg-bg-elevated/50 transition-colors">
                      <td className="px-4 py-2.5 text-text-secondary text-xs">{new Date(entry.timestamp).toLocaleString()}</td>
                      <td className="px-4 py-2.5">
                        <span className={entry.actor_type === "admin" ? "text-success" : "text-info"}>
                          {entry.actor_type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-text-primary">{entry.action}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">
                        {entry.target_id ? (
                          <Link to="/audit" className="text-accent no-underline hover:underline">
                            {entry.target_id.substring(0, 8)}...
                          </Link>
                        ) : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Platform health */}
        <div>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">Platform Health</h2>
          <div className="bg-bg-surface border border-border rounded-lg p-5 flex flex-col gap-5">
            <HealthRow icon={<Activity size={14} />} label="P95 Query Latency" value={`${metrics.p95_query_latency_ms?.toFixed(0) ?? 0}ms`} />
            <HealthRow icon={<Clock size={14} />} label="Mean Time to Resolution" value={`${metrics.mean_time_to_resolution_hours?.toFixed(1) ?? 0}h`} />
            <HealthRow icon={<Zap size={14} />} label="Daily Token Budget" value={
              metrics.daily_token_budget > 0
                ? `${((metrics.daily_tokens_used / metrics.daily_token_budget) * 100).toFixed(1)}%`
                : "N/A"
            } />
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, sub, iconColor }: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  iconColor: string;
}) {
  return (
    <div className="bg-bg-surface border border-border rounded-lg p-5 hover:border-border-strong transition-colors">
      <div className="flex items-center gap-2 mb-3">
        <div className={`${iconColor} opacity-70`}>{icon}</div>
        <p className="text-text-muted text-[11px] font-medium uppercase tracking-wide m-0">{label}</p>
      </div>
      <p className="text-[28px] font-semibold tracking-tight m-0 font-mono">{value}</p>
      {sub && <p className="text-xs mt-1.5 m-0">{sub}</p>}
    </div>
  );
}

function HealthRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-text-muted">{icon}</span>
        <span className="text-text-secondary text-sm">{label}</span>
      </div>
      <span className="font-mono text-lg font-medium">{value}</span>
    </div>
  );
}
