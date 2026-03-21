import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { Settings } from "@/types/api";

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  // Local form state
  const [searchWeights, setSearchWeights] = useState({
    vector_similarity: 0.4,
    structural_match: 0.25,
    env_proximity: 0.2,
    recency_boost: 0.15,
  });
  const [trustDecay, setTrustDecay] = useState({
    default_half_life_days: 30,
    consecutive_failure_threshold: 5,
    confidence_floor_feedbacks: 1,
  });
  const [rateLimits, setRateLimits] = useState({
    anonymous: { submissions_per_hour: 10, queries_per_minute: 5 },
    token_only: { submissions_per_hour: 60, queries_per_minute: 30 },
    registered: { submissions_per_hour: 300, queries_per_minute: 120 },
  });
  const [scheduledAgent, setScheduledAgent] = useState({
    daily_token_budget: 150000,
    max_attempts_per_problem: 3,
  });
  const [secretScanning, setSecretScanning] = useState({ enabled: true });

  const fetchSettings = useCallback(() => {
    setLoading(true);
    api.getSettings()
      .then((res) => {
        setSettings(res);
        if (res.search_weights) setSearchWeights(res.search_weights);
        if (res.trust_decay) setTrustDecay(res.trust_decay);
        if (res.rate_limits) setRateLimits(res.rate_limits);
        if (res.scheduled_agent) setScheduledAgent(res.scheduled_agent);
        if (res.secret_scanning) setSecretScanning(res.secret_scanning);
        setError("");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const weightsSum = Object.values(searchWeights).reduce((a, b) => a + b, 0);
  const weightsValid = Math.abs(weightsSum - 1.0) < 0.005;

  const handleSave = async () => {
    if (!weightsValid) return;
    setSaving(true);
    try {
      const updated = await api.updateSettings({
        search_weights: searchWeights,
        trust_decay: trustDecay,
        rate_limits: rateLimits,
        scheduled_agent: scheduledAgent,
        secret_scanning: secretScanning,
      });
      setSettings(updated);
      showToast("Settings saved");
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : "Unknown"}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div><h1 style={{ margin: "0 0 16px" }}>Settings</h1><p style={{ color: "#888" }}>Loading...</p></div>;
  }

  if (error && !settings) {
    return <div><h1 style={{ margin: "0 0 16px" }}>Settings</h1><p style={{ color: "#d62828" }}>{error}</p></div>;
  }

  return (
    <div style={{ maxWidth: "720px" }}>
      {toast && (
        <div style={{ position: "fixed", top: "16px", right: "16px", backgroundColor: "#2d6a4f", color: "#fff", padding: "10px 20px", borderRadius: "6px", zIndex: 999 }}>
          {toast}
        </div>
      )}

      <h1 style={{ margin: "0 0 24px" }}>Settings</h1>

      {/* Search Weights */}
      <FormSection title="Search Weights">
        <p style={{ color: "#888", fontSize: "0.8rem", margin: "0 0 12px" }}>
          Must sum to 1.0. Current sum: {" "}
          <span style={{ color: weightsValid ? "#2d6a4f" : "#d62828", fontFamily: "monospace", fontWeight: 700 }}>
            {weightsSum.toFixed(2)}
          </span>
        </p>
        {(Object.keys(searchWeights) as Array<keyof typeof searchWeights>).map((key) => (
          <div key={key} style={{ marginBottom: "12px" }}>
            <label style={labelStyle}>
              {key.replace(/_/g, " ")}
              <span style={{ float: "right", fontFamily: "monospace", color: "#a8dadc" }}>
                {searchWeights[key].toFixed(2)}
              </span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={searchWeights[key]}
              onChange={(e) => setSearchWeights({ ...searchWeights, [key]: parseFloat(e.target.value) })}
              style={{ width: "100%", accentColor: "#0f3460" }}
            />
          </div>
        ))}
        {!weightsValid && (
          <p style={{ color: "#d62828", fontSize: "0.8rem", margin: "4px 0 0" }}>
            Weights must sum to 1.00
          </p>
        )}
      </FormSection>

      {/* Trust Decay */}
      <FormSection title="Trust Decay">
        <NumberField
          label="Default Half Life (days)"
          value={trustDecay.default_half_life_days}
          onChange={(v) => setTrustDecay({ ...trustDecay, default_half_life_days: v })}
          min={1}
        />
        <NumberField
          label="Consecutive Failure Threshold"
          value={trustDecay.consecutive_failure_threshold}
          onChange={(v) => setTrustDecay({ ...trustDecay, consecutive_failure_threshold: v })}
          min={1}
        />
        <NumberField
          label="Confidence Floor Feedbacks"
          value={trustDecay.confidence_floor_feedbacks}
          onChange={(v) => setTrustDecay({ ...trustDecay, confidence_floor_feedbacks: v })}
          min={0}
        />
      </FormSection>

      {/* Rate Limits */}
      <FormSection title="Rate Limits">
        {(["anonymous", "token_only", "registered"] as const).map((tier) => (
          <div key={tier} style={{ marginBottom: "16px" }}>
            <h4 style={{ margin: "0 0 8px", fontSize: "0.85rem", color: "#a8dadc", textTransform: "capitalize" }}>
              {tier.replace(/_/g, " ")}
            </h4>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <NumberField
                label="Submissions/hour"
                value={rateLimits[tier].submissions_per_hour}
                onChange={(v) => setRateLimits({
                  ...rateLimits,
                  [tier]: { ...rateLimits[tier], submissions_per_hour: v },
                })}
                min={0}
              />
              <NumberField
                label="Queries/minute"
                value={rateLimits[tier].queries_per_minute}
                onChange={(v) => setRateLimits({
                  ...rateLimits,
                  [tier]: { ...rateLimits[tier], queries_per_minute: v },
                })}
                min={0}
              />
            </div>
          </div>
        ))}
      </FormSection>

      {/* Scheduled Agent */}
      <FormSection title="Scheduled Agent">
        <NumberField
          label="Daily Token Budget"
          value={scheduledAgent.daily_token_budget}
          onChange={(v) => setScheduledAgent({ ...scheduledAgent, daily_token_budget: v })}
          min={0}
        />
        <NumberField
          label="Max Attempts Per Problem"
          value={scheduledAgent.max_attempts_per_problem}
          onChange={(v) => setScheduledAgent({ ...scheduledAgent, max_attempts_per_problem: v })}
          min={1}
        />
      </FormSection>

      {/* Secret Scanning */}
      <FormSection title="Secret Scanning">
        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={secretScanning.enabled}
            onChange={(e) => setSecretScanning({ enabled: e.target.checked })}
            style={{ accentColor: "#0f3460", width: "18px", height: "18px" }}
          />
          <span style={{ color: "#ccc", fontSize: "0.9rem" }}>
            Enable secret scanning on submissions
          </span>
        </label>
      </FormSection>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving || !weightsValid}
        style={{
          padding: "10px 24px",
          backgroundColor: saving || !weightsValid ? "#555" : "#2d6a4f",
          color: saving || !weightsValid ? "#888" : "#fff",
          border: "none",
          borderRadius: "4px",
          cursor: saving || !weightsValid ? "not-allowed" : "pointer",
          fontWeight: 600,
          fontSize: "1rem",
          marginBottom: "40px",
        }}
      >
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: "#16213e", border: "1px solid #0f3460", borderRadius: "8px", padding: "16px 20px", marginBottom: "20px" }}>
      <h3 style={{ margin: "0 0 16px", fontSize: "0.95rem", color: "#a0a0b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <div style={{ marginBottom: "10px", flex: "1 1 180px" }}>
      <label style={labelStyle}>{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        style={{
          padding: "6px 10px",
          backgroundColor: "#1a1a2e",
          color: "#e0e0e0",
          border: "1px solid #0f3460",
          borderRadius: "4px",
          fontSize: "0.9rem",
          fontFamily: "monospace",
          width: "100%",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  color: "#888",
  fontSize: "0.8rem",
  marginBottom: "4px",
};
