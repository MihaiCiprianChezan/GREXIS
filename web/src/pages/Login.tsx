import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Zap } from "lucide-react";

interface LoginPageProps {
  onLogin: () => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.login(secret);
      const returnUrl = searchParams.get("return") || "/dashboard";
      onLogin();
      window.location.href = returnUrl;
    } catch {
      setError("Invalid secret");
      setSecret("");
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg-base font-sans relative overflow-hidden">
      {/* Aurora gradient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[20%] left-[15%] w-[500px] h-[500px] rounded-full bg-[oklch(0.3_0.12_280/20%)] blur-[120px]" />
        <div className="absolute bottom-[10%] right-[20%] w-[400px] h-[400px] rounded-full bg-[oklch(0.3_0.1_230/15%)] blur-[100px]" />
      </div>

      <form
        onSubmit={handleSubmit}
        className="relative bg-bg-surface border border-border rounded-xl p-8 w-[380px] shadow-lg"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-accent-muted flex items-center justify-center">
            <Zap size={20} className="text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight m-0">GREXIS</h1>
            <p className="text-text-muted text-xs m-0">Admin dashboard</p>
          </div>
        </div>

        <label htmlFor="secret" className="block text-text-secondary text-xs font-medium mb-1.5">
          API Secret
        </label>
        <input
          ref={inputRef}
          id="secret"
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          autoComplete="current-password"
          className="w-full px-3 py-2.5 bg-bg-base text-text-primary border border-border rounded-md text-sm font-sans focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent placeholder:text-text-muted"
          placeholder="Enter your API secret..."
        />

        {error && (
          <p className="text-danger text-xs mt-2 m-0" role="alert">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !secret}
          className={`w-full mt-4 py-2.5 rounded-md text-sm font-semibold border-none transition-colors ${
            loading || !secret
              ? "bg-bg-elevated text-text-muted cursor-not-allowed"
              : "bg-accent text-white cursor-pointer hover:bg-accent-hover"
          }`}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <p className="text-text-muted text-[11px] text-center mt-4 mb-0">
          Semantic resolution graph for autonomous agents
        </p>
      </form>
    </div>
  );
}
