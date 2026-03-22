import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { FailureCluster } from "@/types/api";
import { Zap, CheckCircle, XCircle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

export function ClustersPage() {
  const [clusters, setClusters] = useState<FailureCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [triggering, setTriggering] = useState(false);
  const [toast, setToast] = useState("");
  const [tab, setTab] = useState<"pending" | "accepted">("pending");

  const fetchClusters = useCallback(() => {
    setLoading(true);
    api.listClusters()
      .then((res) => { setClusters(res); setError(""); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchClusters();
  }, [fetchClusters]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const handleAccept = async (id: string) => {
    try {
      await api.acceptCluster(id);
      showToast("Cluster accepted");
      fetchClusters();
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : "Unknown"}`);
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await api.dismissCluster(id);
      showToast("Cluster dismissed");
      fetchClusters();
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : "Unknown"}`);
    }
  };

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      await api.triggerClustering();
      showToast("Clustering job triggered");
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : "Unknown"}`);
    } finally {
      setTriggering(false);
    }
  };

  const filtered = clusters.filter((c) => c.admin_status === tab)
    .sort((a, b) => b.member_count - a.member_count);

  return (
    <div>
      {toast && (
        <div className="fixed top-4 right-4 bg-success text-white px-5 py-2.5 rounded-lg shadow-md z-[999] text-sm">
          {toast}
        </div>
      )}

      <PageHeader
        title="Failure Clusters"
        description="Automatically grouped similar failure patterns. Clusters help identify systemic issues across multiple problems so you can write one solution that fixes many errors at once."
        tip={<>
          <p className="m-0 mb-2"><strong className="text-text-primary">How clustering works:</strong> The clustering job embeds each problem's error signature (type + code + tool + details) into a vector using the bge-m3 model, then uses DBSCAN-style grouping in Qdrant to find problems with high cosine similarity. Problems that cluster together likely share a root cause and can be solved with a single solution.</p>
          <p className="m-0 mb-2"><strong className="text-text-primary">Accepting a cluster:</strong> When you accept a cluster, you confirm it represents a real, recurring failure pattern. Accepted clusters appear in the "Accepted" tab and can be used to prioritize which problems the scheduled agent tackles next. The member count shows how many individual problems are in the group.</p>
          <p className="m-0 mb-2"><strong className="text-text-primary">Dismissing a cluster:</strong> Dismiss clusters that are false positives — where the vector similarity grouped unrelated errors together. Dismissed clusters won't reappear unless new problems significantly change the cluster composition.</p>
          <p className="m-0"><strong className="text-text-primary">Manual trigger:</strong> The clustering job runs automatically on a schedule, but you can click "Trigger Clustering" to run it immediately — useful after a batch of new problems comes in and you want to see patterns right away.</p>
        </>}
      >
        <button
          onClick={handleTrigger}
          disabled={triggering}
          className="px-4 py-2 bg-accent text-white rounded-md text-sm font-medium border-none cursor-pointer hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Zap size={14} />
          {triggering ? "Triggering..." : "Trigger Clustering"}
        </button>
      </PageHeader>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {(["pending", "accepted"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "bg-accent-muted text-accent"
                : "text-text-secondary hover:bg-bg-elevated"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading && <p className="text-text-muted">Loading...</p>}
      {error && <p className="text-danger">{error}</p>}

      {!loading && filtered.length === 0 && (
        <p className="text-text-muted">No {tab} clusters</p>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
        {filtered.map((cluster) => (
          <div
            key={cluster.id}
            className="bg-bg-surface border border-border rounded-lg p-5"
          >
            <h3 className="text-text-primary font-medium text-sm mb-2">
              {cluster.cluster_label}
            </h3>
            {cluster.error_type && (
              <p className="text-text-muted text-xs mb-1.5">
                Error: <span className="text-text-secondary">{cluster.error_type}</span>
              </p>
            )}
            <p className="text-accent text-sm font-mono mb-2">
              {cluster.member_count} members
            </p>
            {cluster.keywords && cluster.keywords.length > 0 && (
              <div className="flex gap-1 flex-wrap mb-3">
                {cluster.keywords.map((kw, i) => (
                  <span
                    key={i}
                    className="bg-bg-elevated text-text-secondary text-xs px-2 py-0.5 rounded-full"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            )}
            {tab === "pending" && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleAccept(cluster.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-success text-white border-none rounded-md cursor-pointer text-xs font-medium hover:brightness-110 transition-colors"
                >
                  <CheckCircle size={12} />
                  Accept
                </button>
                <button
                  onClick={() => handleDismiss(cluster.id)}
                  className="bg-transparent text-text-secondary border border-border hover:bg-bg-elevated rounded-md px-3 py-1.5 text-xs cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  <XCircle size={12} />
                  Dismiss
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
