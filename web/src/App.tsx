import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { LoginPage } from "@/pages/Login";
import { DashboardPage } from "@/pages/Dashboard";
import { SolutionsPage } from "@/pages/Solutions";
import { SolutionDetailPage } from "@/pages/SolutionDetail";
import { ProblemsPage } from "@/pages/Problems";
import { ProblemDetailPage } from "@/pages/ProblemDetail";
import { ModerationPage } from "@/pages/Moderation";
import { AgentsPage } from "@/pages/Agents";
import { AgentDetailPage } from "@/pages/AgentDetail";
import { ClustersPage } from "@/pages/Clusters";
import { AuditPage } from "@/pages/Audit";
import { JobsPage } from "@/pages/Jobs";
import { MetricsPage } from "@/pages/Metrics";
import { SettingsPage } from "@/pages/Settings";
import { useAuth } from "@/hooks/useAuth";

export function App() {
  const { authenticated, setAuthenticated } = useAuth();

  if (authenticated === null) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          backgroundColor: "#1a1a2e",
          color: "#888",
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={<LoginPage onLogin={() => setAuthenticated(true)} />}
        />
        {authenticated ? (
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/solutions" element={<SolutionsPage />} />
            <Route path="/solutions/:id" element={<SolutionDetailPage />} />
            <Route path="/problems" element={<ProblemsPage />} />
            <Route path="/problems/:id" element={<ProblemDetailPage />} />
            <Route path="/moderation" element={<ModerationPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/agents/:hash" element={<AgentDetailPage />} />
            <Route path="/clusters" element={<ClustersPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/metrics" element={<MetricsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/" element={<Navigate to="/dashboard" />} />
          </Route>
        ) : (
          <Route path="*" element={<Navigate to="/login" />} />
        )}
      </Routes>
    </BrowserRouter>
  );
}
