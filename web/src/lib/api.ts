import type {
  Solution,
  Problem,
  AgentToken,
  AuditEntry,
  AgentJob,
  FailureCluster,
  Settings,
  Metrics,
  PaginatedResponse,
  BadgeCounts,
  FeedbackEvent,
  ResolutionEdge,
} from "@/types/api";

const API_BASE = "/api";

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (res.status === 401 && !path.startsWith("/auth/")) {
    // Only redirect if not already on login page (prevents loops)
    if (window.location.pathname !== "/login") {
      window.location.href = `/login?return=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Auth
  login: (secret: string) =>
    fetchAPI<{ ok: boolean }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ secret }),
    }),
  me: () => fetchAPI<{ ok: boolean }>("/auth/me"),
  logout: () => fetchAPI<{ ok: boolean }>("/auth/logout", { method: "POST" }),

  // Solutions
  listSolutions: (params?: URLSearchParams) =>
    fetchAPI<PaginatedResponse<Solution>>(`/admin/solutions?${params || ""}`),
  getSolution: (id: string) =>
    fetchAPI<Solution & { feedback_history: FeedbackEvent[]; edges: ResolutionEdge[] }>(
      `/admin/solutions/${id}`
    ),
  updateSolution: (id: string, data: object) =>
    fetchAPI<Solution>(`/admin/solutions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteSolution: (id: string, reason: string) =>
    fetchAPI<{ ok: boolean }>(`/admin/solutions/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ reason }),
    }),

  // Problems
  listProblems: (params?: URLSearchParams) =>
    fetchAPI<PaginatedResponse<Problem>>(`/admin/problems?${params || ""}`),
  getProblem: (id: string) =>
    fetchAPI<Problem & { solutions: Solution[]; jobs: AgentJob[] }>(
      `/admin/problems/${id}`
    ),
  createSolution: (data: object) =>
    fetchAPI<Solution>("/admin/solutions", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Tokens
  listTokens: (params?: URLSearchParams) =>
    fetchAPI<PaginatedResponse<AgentToken>>(`/admin/tokens?${params || ""}`),
  getToken: (hash: string) =>
    fetchAPI<AgentToken & { solutions: Solution[] }>(`/admin/tokens/${hash}`),
  banToken: (hash: string, reason: string) =>
    fetchAPI<{ ok: boolean }>(`/admin/tokens/${hash}/ban`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  unbanToken: (hash: string, reason: string) =>
    fetchAPI<{ ok: boolean }>(`/admin/tokens/${hash}/unban`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  resetToken: (hash: string, reason: string) =>
    fetchAPI<{ ok: boolean }>(`/admin/tokens/${hash}/reset`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  // Audit
  listAudit: (params?: URLSearchParams) =>
    fetchAPI<PaginatedResponse<AuditEntry>>(`/admin/audit?${params || ""}`),

  // Jobs
  listJobs: (params?: URLSearchParams) =>
    fetchAPI<PaginatedResponse<AgentJob>>(`/admin/jobs?${params || ""}`),

  // Metrics
  getMetrics: () => fetchAPI<Metrics>("/admin/metrics"),

  // Clusters
  listClusters: () => fetchAPI<FailureCluster[]>("/admin/clusters"),
  acceptCluster: (id: string) =>
    fetchAPI<{ ok: boolean }>(`/admin/clusters/${id}/accept`, { method: "POST" }),
  dismissCluster: (id: string) =>
    fetchAPI<{ ok: boolean }>(`/admin/clusters/${id}/dismiss`, { method: "POST" }),
  triggerClustering: () =>
    fetchAPI<{ ok: boolean }>("/admin/clusters/trigger", { method: "POST" }),

  // Settings
  getSettings: () => fetchAPI<Settings>("/admin/settings"),
  updateSettings: (data: object) =>
    fetchAPI<Settings>("/admin/settings", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  // Badge counts (combined endpoint for sidebar polling)
  getBadgeCounts: () => fetchAPI<BadgeCounts>("/admin/badge-counts"),
};
