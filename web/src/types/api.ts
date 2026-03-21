// GREXIS Admin API Types — matching PostgreSQL schema from db/init.sql

export interface Solution {
  id: string;
  error_type: string;
  error_code: string | null;
  tool_name: string | null;
  operation: string | null;
  severity: string | null;
  details_summary: string | null;
  goal_state: string;
  llm: string;
  framework: string;
  framework_version: string;
  runtime: string;
  tool_version: string | null;
  solution_steps: string[];
  solution_summary: string;
  confidence_score: number;
  success_rate: number;
  attempt_count: number;
  source: "agent_contributed" | "scheduled_agent" | "human_curated" | "federated";
  confidence_type: string;
  agent_token_hash: string | null;
  provenance: string | null;
  parent_problem_id: string | null;
  superseded_solution_id: string | null;
  qdrant_point_id: string | null;
  status: "active" | "pending_review" | "flagged" | "inactive" | "pending_index";
  admin_notes: string | null;
  pending_index_retries: unknown[];
  source_weight: number;
  created_at: string;
  last_validated_at: string | null;
}

export interface Problem {
  id: string;
  error_type: string;
  error_code: string | null;
  tool_name: string | null;
  operation: string | null;
  severity: "blocking" | "degraded" | "cosmetic";
  details: string | null;
  goal_state: string;
  llm: string;
  framework: string;
  framework_version: string;
  runtime: string;
  tool_version: string | null;
  execution_context: Record<string, unknown> | null;
  status: "open" | "solved" | "stale";
  duplicate_count: number;
  solved_by_solution_id: string | null;
  submitted_by_token_hash: string | null;
  created_at: string;
  last_attempted_at: string | null;
}

export interface AgentToken {
  id: string;
  token_hash: string;
  tier: "anonymous" | "token_only" | "registered";
  agent_description: string | null;
  operator_email_hash: string | null;
  framework: string | null;
  first_seen_at: string;
  last_seen_at: string;
  submitted_solutions_count: number;
  submitted_solutions_success_rate: number;
  rate_limit_multiplier: number;
  is_banned: boolean;
  ban_reason: string | null;
  banned_at: string | null;
}

export interface AuditEntry {
  id: number;
  timestamp: string;
  actor_type: string;
  actor_id_hash: string;
  action: string;
  target_id: string | null;
  payload_hash: string;
  reason: string | null;
}

export interface AgentJob {
  id: string;
  problem_id: string;
  status: "queued" | "running" | "completed" | "failed" | "skipped";
  attempts_today: number;
  total_attempts: number;
  tokens_used_today: number;
  last_attempted_at: string | null;
  next_attempt_after: string | null;
  result_solution_id: string | null;
  failure_reason: string | null;
  synthesis_logs: SynthesisLogEntry[];
  created_at: string;
  updated_at: string;
}

export interface SynthesisLogEntry {
  attempt_number: number;
  outcome: string;
  tokens_used: number;
  reasoning_summary: string;
  sources_used: string[];
}

export interface FailureCluster {
  id: string;
  cluster_label: string;
  error_type: string | null;
  member_count: number;
  keywords: string[];
  suggested_field: string | null;
  admin_status: "pending" | "accepted" | "dismissed";
  created_at: string;
  updated_at: string;
}

export interface SettingEntry {
  key: string;
  value: unknown;
  updated_at: string;
  updated_by: string;
}

export interface SearchWeights {
  vector_similarity: number;
  structural_match: number;
  env_proximity: number;
  recency_boost: number;
}

export interface TrustDecay {
  default_half_life_days: number;
  consecutive_failure_threshold: number;
  confidence_floor_feedbacks: number;
}

export interface RateLimitTier {
  submissions_per_hour: number;
  queries_per_minute: number;
}

export interface RateLimits {
  anonymous: RateLimitTier;
  token_only: RateLimitTier;
  registered: RateLimitTier;
}

export interface ScheduledAgentConfig {
  daily_token_budget: number;
  max_attempts_per_problem: number;
}

export interface SecretScanningConfig {
  enabled: boolean;
}

export interface Settings {
  search_weights: SearchWeights;
  trust_decay: TrustDecay;
  rate_limits: RateLimits;
  scheduled_agent: ScheduledAgentConfig;
  secret_scanning: SecretScanningConfig;
}

export interface Metrics {
  active_solutions: number;
  total_solutions: number;
  open_problems: number;
  blocking_problems: number;
  moderation_queue: number;
  agent_7d_success_rate: number;
  daily_tokens_used: number;
  daily_token_budget: number;
  p95_query_latency_ms: number;
  mean_time_to_resolution_hours: number;
  problems_solved_today: number;
  problems_attempted_today: number;
}

export interface FeedbackEvent {
  id: string;
  solution_id: string;
  agent_token_hash: string | null;
  outcome: string;
  comment: string | null;
  llm: string;
  framework: string;
  framework_version: string;
  runtime: string;
  follow_up_problem_id: string | null;
  created_at: string;
}

export interface ResolutionEdge {
  id: string;
  source_node_id: string;
  source_node_type: string;
  target_node_id: string;
  target_node_type: string;
  edge_type: string;
  created_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}

export interface BadgeCounts {
  problems: number;
  moderation: number;
  clusters: number;
}
