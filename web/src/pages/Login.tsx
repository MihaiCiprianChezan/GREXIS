import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";

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
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        backgroundColor: "#1a1a2e",
        color: "#e0e0e0",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          backgroundColor: "#16213e",
          border: "1px solid #0f3460",
          borderRadius: "8px",
          padding: "32px",
          width: "360px",
        }}
      >
        <h1 style={{ margin: "0 0 4px", fontSize: "1.4rem" }}>GREXIS</h1>
        <p style={{ margin: "0 0 24px", color: "#888", fontSize: "0.9rem" }}>
          Admin dashboard
        </p>

        <label
          htmlFor="secret"
          style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", color: "#ccc" }}
        >
          API Secret
        </label>
        <input
          ref={inputRef}
          id="secret"
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          autoComplete="current-password"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            backgroundColor: "#1a1a2e",
            color: "#e0e0e0",
            border: "1px solid #0f3460",
            borderRadius: "4px",
            fontSize: "1rem",
          }}
        />

        {error && (
          <p style={{ color: "#d62828", fontSize: "0.85rem", margin: "8px 0 0" }} role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !secret}
          style={{
            width: "100%",
            marginTop: "16px",
            padding: "10px",
            backgroundColor: loading || !secret ? "#555" : "#0f3460",
            color: loading || !secret ? "#888" : "#e0e0e0",
            border: "none",
            borderRadius: "4px",
            fontSize: "1rem",
            fontWeight: 600,
            cursor: loading || !secret ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
