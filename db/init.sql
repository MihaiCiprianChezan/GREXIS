-- GREXIS Database Schema v0.3
-- Run once on first boot via docker-entrypoint-initdb.d

CREATE SCHEMA IF NOT EXISTS grexis;

-- 4.1 Agent tokens
CREATE TABLE grexis.agent_tokens (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash                  TEXT NOT NULL UNIQUE,
    tier                        VARCHAR(20) NOT NULL DEFAULT 'token_only',
    agent_description           TEXT,
    operator_email_hash         TEXT,
    framework                   VARCHAR(100),
    first_seen_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_solutions_count   INT NOT NULL DEFAULT 0,
    submitted_solutions_success_rate FLOAT NOT NULL DEFAULT 0.0,
    rate_limit_multiplier       FLOAT NOT NULL DEFAULT 1.0,
    is_banned                   BOOLEAN NOT NULL DEFAULT FALSE,
    ban_reason                  TEXT,
    banned_at                   TIMESTAMP
);
CREATE INDEX idx_agent_tokens_hash ON grexis.agent_tokens(token_hash);
CREATE INDEX idx_agent_tokens_tier ON grexis.agent_tokens(tier);

-- 4.2 Problems
CREATE TABLE grexis.problems (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_type              VARCHAR(100) NOT NULL,
    error_code              VARCHAR(100),
    tool_name               VARCHAR(200),
    operation               VARCHAR(200),
    severity                VARCHAR(20) DEFAULT 'degraded',
    details                 TEXT,
    goal_state              TEXT NOT NULL,
    llm                     VARCHAR(100) NOT NULL,
    framework               VARCHAR(100) NOT NULL,
    framework_version       VARCHAR(50) NOT NULL,
    runtime                 VARCHAR(100) NOT NULL,
    tool_version            VARCHAR(50),
    execution_context       JSONB,
    status                  VARCHAR(30) NOT NULL DEFAULT 'open',
    duplicate_count         INT NOT NULL DEFAULT 1,
    solved_by_solution_id   UUID,
    submitted_by_token_hash TEXT,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_attempted_at       TIMESTAMP
);
CREATE INDEX idx_problems_status ON grexis.problems(status);
CREATE INDEX idx_problems_error_type ON grexis.problems(error_type);
CREATE INDEX idx_problems_framework ON grexis.problems(framework, framework_version);
CREATE INDEX idx_problems_severity ON grexis.problems(severity);
CREATE INDEX idx_problems_duplicate_count ON grexis.problems(duplicate_count DESC);

-- 4.3 Solutions
CREATE TABLE grexis.solutions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_type              VARCHAR(100) NOT NULL,
    error_code              VARCHAR(100),
    tool_name               VARCHAR(200),
    operation               VARCHAR(200),
    severity                VARCHAR(20),
    details_summary         TEXT,
    goal_state              TEXT NOT NULL,
    llm                     VARCHAR(100) NOT NULL,
    framework               VARCHAR(100) NOT NULL,
    framework_version       VARCHAR(50) NOT NULL,
    runtime                 VARCHAR(100) NOT NULL,
    tool_version            VARCHAR(50),
    solution_steps          TEXT[] NOT NULL,
    solution_summary        TEXT NOT NULL,
    confidence_score        FLOAT NOT NULL DEFAULT 0.0,
    success_rate            FLOAT NOT NULL DEFAULT 0.0,
    attempt_count           INT NOT NULL DEFAULT 0,
    source                  VARCHAR(30) NOT NULL,
    confidence_type         VARCHAR(20) NOT NULL,
    agent_token_hash        TEXT,
    provenance              TEXT,
    parent_problem_id       UUID REFERENCES grexis.problems(id),
    superseded_solution_id  UUID REFERENCES grexis.solutions(id),
    qdrant_point_id         UUID UNIQUE,
    status                  VARCHAR(30) NOT NULL DEFAULT 'pending_review',
    admin_notes             TEXT,
    pending_index_retries   JSONB DEFAULT '[]'::jsonb,
    source_weight           FLOAT NOT NULL DEFAULT 1.0,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_validated_at       TIMESTAMP
);
CREATE INDEX idx_solutions_status ON grexis.solutions(status);
CREATE INDEX idx_solutions_framework ON grexis.solutions(framework, framework_version);
CREATE INDEX idx_solutions_error_type ON grexis.solutions(error_type);
CREATE INDEX idx_solutions_confidence ON grexis.solutions(confidence_score DESC);
CREATE INDEX idx_solutions_token_hash ON grexis.solutions(agent_token_hash);
CREATE INDEX idx_solutions_source ON grexis.solutions(source);

-- 4.4 Feedback events
CREATE TABLE grexis.feedback_events (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solution_id             UUID NOT NULL REFERENCES grexis.solutions(id),
    agent_token_hash        TEXT,
    outcome                 VARCHAR(20) NOT NULL,
    comment                 TEXT,
    llm                     VARCHAR(100) NOT NULL,
    framework               VARCHAR(100) NOT NULL,
    framework_version       VARCHAR(50) NOT NULL,
    runtime                 VARCHAR(100) NOT NULL,
    follow_up_problem_id    UUID REFERENCES grexis.problems(id),
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    aggregated_at           TIMESTAMP
);
CREATE INDEX idx_feedback_solution_id ON grexis.feedback_events(solution_id);
CREATE INDEX idx_feedback_outcome ON grexis.feedback_events(outcome);
CREATE INDEX idx_feedback_token ON grexis.feedback_events(agent_token_hash);
CREATE INDEX idx_feedback_created ON grexis.feedback_events(created_at);

-- 4.5 Resolution edges
CREATE TABLE grexis.resolution_edges (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_node_id  UUID NOT NULL,
    source_node_type VARCHAR(20) NOT NULL,
    target_node_id  UUID NOT NULL,
    target_node_type VARCHAR(20) NOT NULL,
    edge_type       VARCHAR(50) NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_edges_source ON grexis.resolution_edges(source_node_id, source_node_type);
CREATE INDEX idx_edges_target ON grexis.resolution_edges(target_node_id, target_node_type);
CREATE INDEX idx_edges_type ON grexis.resolution_edges(edge_type);

-- 4.6 Failure clusters
CREATE TABLE grexis.failure_clusters (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_label   TEXT NOT NULL,
    error_type      VARCHAR(100),
    member_count    INT NOT NULL DEFAULT 0,
    keywords        TEXT[],
    suggested_field TEXT,
    admin_status    VARCHAR(20) DEFAULT 'pending',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4.7 Scheduled agent jobs
CREATE TABLE grexis.agent_jobs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id          UUID NOT NULL REFERENCES grexis.problems(id),
    status              VARCHAR(20) NOT NULL DEFAULT 'queued',
    attempts_today      INT NOT NULL DEFAULT 0,
    total_attempts      INT NOT NULL DEFAULT 0,
    tokens_used_today   INT NOT NULL DEFAULT 0,
    last_attempted_at   TIMESTAMP,
    next_attempt_after  TIMESTAMP,
    result_solution_id  UUID REFERENCES grexis.solutions(id),
    failure_reason      TEXT,
    synthesis_logs      JSONB DEFAULT '[]'::jsonb,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_jobs_status ON grexis.agent_jobs(status);
CREATE INDEX idx_jobs_next_attempt ON grexis.agent_jobs(next_attempt_after)
    WHERE status IN ('queued', 'failed');

-- 4.8 Audit log
CREATE TABLE grexis.audit_log (
    id              BIGSERIAL PRIMARY KEY,
    timestamp       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actor_type      VARCHAR(20) NOT NULL,
    actor_id_hash   TEXT NOT NULL,
    action          VARCHAR(50) NOT NULL,
    target_id       TEXT,
    payload_hash    TEXT NOT NULL,
    reason          TEXT
);
CREATE INDEX idx_audit_timestamp ON grexis.audit_log(timestamp DESC);
CREATE INDEX idx_audit_actor ON grexis.audit_log(actor_id_hash);
CREATE INDEX idx_audit_action ON grexis.audit_log(action);

-- 4.9 Runtime settings
CREATE TABLE grexis.settings (
    key                 VARCHAR(100) PRIMARY KEY,
    value               JSONB NOT NULL,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by          TEXT NOT NULL
);

INSERT INTO grexis.settings (key, value, updated_by) VALUES
    ('search_weights',      '{"vector_similarity": 0.40, "structural_match": 0.25, "env_proximity": 0.20, "recency_boost": 0.15}', 'system'),
    ('trust_decay',         '{"default_half_life_days": 30, "consecutive_failure_threshold": 5, "confidence_floor_feedbacks": 1}', 'system'),
    ('rate_limits',         '{"anonymous": {"submissions_per_hour": 10, "queries_per_minute": 5}, "token_only": {"submissions_per_hour": 60, "queries_per_minute": 30}, "registered": {"submissions_per_hour": 300, "queries_per_minute": 120}}', 'system'),
    ('scheduled_agent',     '{"daily_token_budget": 150000, "max_attempts_per_problem": 3}', 'system'),
    ('secret_scanning',     '{"enabled": true}', 'system')
ON CONFLICT (key) DO NOTHING;
