import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { FailureCluster } from "@/types/api";

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
        <div style={{ position: "fixed", top: "16px", right: "16px", backgroundColor: "#2d6a4f", color: "#fff", padding: "10px 20px", borderRadius: "6px", zIndex: 999 }}>
          {toast}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h1 style={{ margin: 0 }}>Failure Clusters</h1>
        <button
          onClick={handleTrigger}
          disabled={triggering}
          style={{
            padding: "8px 16px",
            backgroundColor: triggering ? "#555" : "#0f3460",
            color: "#e0e0e0",
            border: "none",
            borderRadius: "4px",
            cursor: triggering ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          {triggering ? "Triggering..." : "Trigger Clustering"}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "16px" }}>
        {(["pending", "accepted"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "6px 16px",
              backgroundColor: tab === t ? "#0f3460" : "transparent",
              color: tab === t ? "#e0e0e0" : "#888",
              border: "1px solid #0f3460",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "0.85rem",
              textTransform: "capitalize",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: "#888" }}>Loading...</p>}
      {error && <p style={{ color: "#d62828" }}>{error}</p>}

      {!loading && filtered.length === 0 && (
        <p style={{ color: "#888" }}>No {tab} clusters</p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
        {filtered.map((cluster) => (
          <div
            key={cluster.id}
            style={{
              backgroundColor: "#16213e",
              border: "1px solid #0f3460",
              borderRadius: "8px",
              padding: "16px",
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: "1rem", color: "#e0e0e0" }}>
              {cluster.cluster_label}
            </h3>
            {cluster.error_type && (
              <p style={{ margin: "0 0 6px", color: "#888", fontSize: "0.8rem" }}>
                Error: <span style={{ color: "#ccc" }}>{cluster.error_type}</span>
              </p>
            )}
            <p style={{ margin: "0 0 8px", color: "#a8dadc", fontSize: "0.9rem", fontFamily: "monospace" }}>
              {cluster.member_count} members
            </p>
            {cluster.keywords && cluster.keywords.length > 0 && (
              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "12px" }}>
                {cluster.keywords.map((kw, i) => (
                  <span
                    key={i}
                    style={{
                      padding: "2px 8px",
                      backgroundColor: "#1a1a2e",
                      borderRadius: "10px",
                      fontSize: "0.7rem",
                      color: "#a0a0b8",
                    }}
                  >
                    {kw}
                  </span>
                ))}
              </div>
            )}
            {tab === "pending" && (
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => handleAccept(cluster.id)}
                  style={{ padding: "6px 14px", backgroundColor: "#2d6a4f", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "0.8rem" }}
                >
                  Accept
                </button>
                <button
                  onClick={() => handleDismiss(cluster.id)}
                  style={{ padding: "6px 14px", backgroundColor: "#555", color: "#ccc", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "0.8rem" }}
                >
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
