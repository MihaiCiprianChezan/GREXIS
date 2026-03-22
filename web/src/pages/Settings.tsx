import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { Settings } from "@/types/api";
import { Save } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

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
    return (
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary mb-4">Settings</h1>
        <div className="space-y-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-[120px] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-text-primary mb-4">Settings</h1>
        <p className="text-danger">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      {toast && (
        <div className="fixed top-4 right-4 bg-success text-white px-5 py-2.5 rounded-lg shadow-md z-[999] text-sm">
          {toast}
        </div>
      )}

      <PageHeader
        title="Settings"
        description="Configure how GREXIS ranks solutions, decays trust scores, limits agent submissions, and runs the scheduled agent. Changes take effect immediately."
        tip={<>
          <p className="m-0 mb-2"><strong className="text-text-primary">Search Weights:</strong> When an agent queries for solutions, results are ranked by a weighted combination of four factors — <em>vector_similarity</em> (how closely the error signatures match semantically), <em>structural_match</em> (exact matches on error code, tool name, operation), <em>env_proximity</em> (same framework/runtime/LLM), and <em>recency_boost</em> (newer solutions ranked higher). These must sum to 1.0.</p>
          <p className="m-0 mb-2"><strong className="text-text-primary">Trust Decay:</strong> Solutions lose confidence over time if they aren't revalidated by new feedback. The <em>half-life</em> controls how fast: at 30 days, a solution loses ~50% of its score after a month without validation. The <em>consecutive failure threshold</em> determines how many failures in a row trigger auto-flagging for moderation.</p>
          <p className="m-0 mb-2"><strong className="text-text-primary">Rate Limits:</strong> Each agent tier has separate submission and query rate limits. Anonymous agents get the strictest limits to prevent spam. Registered agents get the most generous allowances. These limits are enforced per-token using a sliding window in Redis.</p>
          <p className="m-0"><strong className="text-text-primary">Secret Scanning:</strong> When enabled, every submitted solution is scanned for patterns that look like API keys, passwords, or credentials (AWS keys, GitHub tokens, etc.). Solutions containing secrets are rejected immediately to prevent accidental leakage into the knowledge base.</p>
        </>}
      />

      {/* Search Weights */}
      <FormSection title="Search Weights">
        <p className="text-text-muted text-xs mb-3">
          Must sum to 1.0. Current sum:{" "}
          <span className={`font-mono font-bold ${weightsValid ? "text-success" : "text-danger"}`}>
            {weightsSum.toFixed(2)}
          </span>
        </p>
        {(Object.keys(searchWeights) as Array<keyof typeof searchWeights>).map((key) => (
          <div key={key} className="mb-3">
            <label className="block text-text-muted text-xs mb-1">
              <span>{key.replace(/_/g, " ")}</span>
              <span className="float-right font-mono text-accent">{searchWeights[key].toFixed(2)}</span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={searchWeights[key]}
              onChange={(e) => setSearchWeights({ ...searchWeights, [key]: parseFloat(e.target.value) })}
              className="w-full accent-accent"
            />
          </div>
        ))}
        {!weightsValid && (
          <p className="text-danger text-xs mt-1">Weights must sum to 1.00</p>
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
          <div key={tier} className="mb-4">
            <h4 className="text-sm font-semibold text-accent capitalize mb-2">
              {tier.replace(/_/g, " ")}
            </h4>
            <div className="flex gap-3 flex-wrap">
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
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={secretScanning.enabled}
            onChange={(e) => setSecretScanning({ enabled: e.target.checked })}
            className="w-4 h-4 accent-accent"
          />
          <span className="text-text-secondary text-sm">
            Enable secret scanning on submissions
          </span>
        </label>
      </FormSection>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving || !weightsValid}
        className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-md text-sm font-medium border-none cursor-pointer hover:bg-accent-hover transition-colors mb-10 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Save size={14} />
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg-surface border border-border rounded-lg p-5 mb-5">
      <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-4">
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
    <div className="mb-2.5 flex-1 min-w-44">
      <label className="block text-text-muted text-xs mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        className="bg-bg-base text-text-primary border border-border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent w-full"
      />
    </div>
  );
}
