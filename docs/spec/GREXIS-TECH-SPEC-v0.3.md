# GREXIS — Technical Specification & POC Blueprint
> *Companion document to GREXIS-PRD-v0.6. The PRD is the stakeholder vision. This document is the implementation spec.*

**Version:** 0.3
**Status:** POC — Implementation Ready
**Architecture:** Hybrid Semantic-Graph Infrastructure (Qdrant + PostgreSQL + Redis)

---

## 1. Overview

This document translates the GREXIS PRD decisions into concrete implementation choices. It is written for engineers building the system, not stakeholders evaluating the vision.

The core architectural challenge GREXIS solves is **environment-constrained semantic retrieval**: given a failure signature, find solutions that are semantically similar AND were verified in a compatible runtime environment. This is the "filterable semantic search" problem — it requires a hybrid approach, not a single database.

---

## 2. Tech Stack

### 2.1 Components

| Component | Technology | Role |
|---|---|---|
| Backend API | Python 3.12 + FastAPI + uvicorn | MCP server, HTTP endpoints, middleware |
| Frontend | Node.js 22 + React (Vite) | Admin dashboard UI |
| Semantic store | Qdrant | Vector embeddings + payload metadata for semantic search |
| Relational store | PostgreSQL 15 | Canonical records, graph edges, audit log, job queue |
| Cache / rate limit | Redis 7 | Token reputation state, rate limit counters, result cache |
| Embedding model | `BAAI/bge-m3` (local, ONNX) | 1024-dimension vectors for failure signatures + goal states |
| Fallback embedding | `text-embedding-3-small` (OpenAI) | 1536-dimension fallback if local model is unavailable or insufficient |
| ML / NLP | scikit-learn, NLTK | TF-IDF clustering, keyword extraction |
| Scheduler | APScheduler | Scheduled answer agent, clustering job, decay recomputation |
| GPU acceleration | CUDA 12+ (optional) | Accelerates ONNX embedding inference; falls back to CPU if unavailable |

### 2.2 Embedding model strategy

**Primary: `BAAI/bge-m3`** — a 1024-dimension multilingual model run locally via ONNX Runtime (`onnxruntime-gpu` with CUDA fallback to `onnxruntime` CPU). Zero external API calls for embeddings, zero per-token cost. Strong multilingual support makes it suitable for a global agent ecosystem. The model is downloaded once at container build time (~2.2 GB) and loaded into memory on server start.

**GPU acceleration:** When CUDA is available (`CUDA_VISIBLE_DEVICES` set, NVIDIA driver detected), ONNX Runtime uses the CUDA Execution Provider for embedding inference — typical speedup is 5-10x over CPU for batch operations. If CUDA is not available, the runtime falls back to the CPU Execution Provider automatically. No code changes are required — the provider is selected at startup based on hardware detection.

```python
import onnxruntime as ort

def create_embedding_session(model_path: str) -> ort.InferenceSession:
    providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    session = ort.InferenceSession(model_path, providers=providers)
    active = session.get_providers()
    logger.info(f"ONNX providers: {active}")  # logs which provider was selected
    return session
```

**Fallback: `text-embedding-3-small` (OpenAI)** — 1536-dimension model accessed via the OpenAI API. Used only if:
- The local model fails to load (corrupted weights, OOM on constrained hardware)
- A future use case requires higher-dimensional embeddings for specific collections

The active embedding model is configured via the `EMBEDDING_PROVIDER` env var (`local` | `openai`, default: `local`).

> **WARNING:** Changing `EMBEDDING_PROVIDER` after initial deployment requires dropping and rebuilding **all** Qdrant collections. Vectors from `local` (1024-dim) and `openai` (1536-dim) are not compatible. Never change this value on a live instance without a full Qdrant rebuild from Postgres.

**Qdrant collection dimensions are set based on the active provider:**
- `local` (bge-m3): 1024 dimensions
- `openai` (text-embedding-3-small): 1536 dimensions

The embedding wrapper (`api/src/grexis/lib/embed.py`) abstracts both providers behind a single `async def embed(text: str) -> list[float]` interface.

### 2.3 Why Qdrant + PostgreSQL, not a native graph DB

The primary GREXIS access pattern is **environment-constrained retrieval**, not deep path traversal. The query is always: "find solutions semantically similar to this failure, within this framework ecosystem." That is a vector search problem with metadata filtering — not a graph traversal problem.

Native graph databases (Neo4j, FalkorDB) excel at multi-hop traversal queries (`MATCH (a)-[:RESOLVES]->(b)-[:BRANCHES_TO]->(c)`). GREXIS uses those edges for lineage tracing and admin visualisation — not for the hot query path. Running a RAM-intensive in-memory graph DB as core infrastructure for a query pattern it is not optimised for would be operationally expensive and fragile.

Qdrant's **filterable HNSW** index allows hard-filtering on `framework`, `framework_version`, `runtime`, and `status` before semantic ranking — equivalent to restricting graph traversal to a sub-graph of a specific environment, but orders of magnitude faster for this use case.

PostgreSQL handles everything requiring ACID guarantees: canonical records, graph edges, audit log, job state. It is the source of truth. Qdrant is a search index over that truth — if Qdrant is lost, it can be rebuilt from Postgres.

Redis handles all sub-millisecond lookups: rate limit counters, token reputation multipliers, short-lived result cache. Postgres is wrong for this hot path.

### 2.4 Dual-write pattern

All writes follow a strict ordering to maintain consistency:

```
Submit solution
      |
      v
1. Write canonical record to PostgreSQL (source of truth)
      |
   success?
    /    \
  yes     no → return 500, do not proceed
   |
   v
2. Index vector + payload to Qdrant
      |
   success?
    /    \
  yes     no → mark solution status: pending_index in Postgres
   |            (background job retries Qdrant indexing)
   v
3. Update Redis cache if applicable
```

**PostgreSQL write always happens first.** If Qdrant indexing fails, the record exists in Postgres and a background job retries indexing. A solution in `pending_index` status is not returned in search results until Qdrant indexing succeeds.

**Retry schedule for `pending_index` records:**

| Attempt | Delay | Notes |
|---|---|---|
| 1 | 5 seconds | Immediate retry — covers transient Qdrant unavailability |
| 2 | 30 seconds | |
| 3 | 2 minutes | |
| 4 | 10 minutes | |
| 5 | 1 hour | Final attempt |

After 5 failed attempts, the record remains in `pending_index` status and is flagged in the admin dashboard for manual investigation. A background cron job (`pending_index_retry`, runs every 60 seconds) picks up eligible records ordered by `created_at ASC`. The retry count and last error are stored in a `pending_index_retries` JSONB column on the solutions table (added in this version).

---

## 3. POC Infrastructure

### 3.1 `docker-compose.yml`

```yaml
version: '3.8'

services:
  qdrant:
    image: qdrant/qdrant:latest
    container_name: grexis-qdrant
    ports:
      - "6333:6333"   # HTTP API
      - "6334:6334"   # gRPC API
    volumes:
      - qdrant_data:/qdrant/storage
    restart: always

  postgres:
    image: postgres:15-alpine
    container_name: grexis-postgres
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-grexis_admin}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-changeme_in_production}
      POSTGRES_DB: ${POSTGRES_DB:-grexis_graph}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql
    restart: always

  redis:
    image: redis:7-alpine
    container_name: grexis-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    restart: always

  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    container_name: grexis-api
    ports:
      - "8000:8000"
    environment:
      - POSTGRES_URL=postgresql+asyncpg://${POSTGRES_USER:-grexis_admin}:${POSTGRES_PASSWORD:-changeme_in_production}@postgres:5432/${POSTGRES_DB:-grexis_graph}
      - QDRANT_URL=http://qdrant:6333
      - REDIS_URL=redis://redis:6379
      - EMBEDDING_PROVIDER=${EMBEDDING_PROVIDER:-local}
      - OPENAI_API_KEY=${OPENAI_API_KEY:-}
      - GREXIS_API_SECRET=${GREXIS_API_SECRET}
    depends_on:
      - postgres
      - qdrant
      - redis
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    # GPU reservation is optional — container starts without GPU if unavailable.
    # To run without GPU, remove the 'deploy.resources' block or use:
    #   docker compose up --no-gpu
    restart: always

  web:
    build:
      context: ./web
      dockerfile: Dockerfile
    container_name: grexis-web
    ports:
      - "3000:3000"
    environment:
      - VITE_API_URL=http://api:8000
    depends_on:
      - api
    restart: always

volumes:
  qdrant_data:
  postgres_data:
  redis_data:
```

### 3.2 Environment variables reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `POSTGRES_URL` | yes | — | PostgreSQL async connection string (`postgresql+asyncpg://...`) |
| `POSTGRES_USER` | yes | `grexis_admin` | PostgreSQL admin user (used in docker-compose) |
| `POSTGRES_PASSWORD` | yes | — | PostgreSQL password — no default in production |
| `POSTGRES_DB` | yes | `grexis_graph` | Database name |
| `QDRANT_URL` | yes | — | Qdrant HTTP endpoint |
| `REDIS_URL` | yes | — | Redis connection string |
| `EMBEDDING_PROVIDER` | no | `local` | `local` (bge-m3 ONNX + CUDA/CPU) or `openai` (text-embedding-3-small) |
| `OPENAI_API_KEY` | if `openai` | — | Required only when `EMBEDDING_PROVIDER=openai` |
| `CUDA_VISIBLE_DEVICES` | no | (all) | Restrict which GPUs ONNX Runtime can use; empty = CPU only |
| `GREXIS_API_SECRET` | yes | — | Admin API authentication |
| `SCHEDULED_AGENT_DAILY_TOKEN_BUDGET` | no | `150000` | Max tokens/day for scheduled answer agent |
| `SCHEDULED_AGENT_MAX_ATTEMPTS_PER_PROBLEM` | no | `3` | Max synthesis attempts per problem per day |
| `TRUST_DECAY_DEFAULT_HALF_LIFE_DAYS` | no | `30` | Default trust score half-life |
| `CONSECUTIVE_FAILURE_THRESHOLD` | no | `5` | Consecutive failures before auto-flag |
| `CONFIDENCE_FLOOR_FEEDBACKS` | no | `1` | Minimum positive feedbacks before solution surfaces in search |
| `SECRET_SCAN_ENABLED` | no | `true` | Enable pre-index secret scanning |
| `SANDBOX_MODE` | no | `false` | Sandbox instance flag — data purged every 7 days |

---

## 4. PostgreSQL Schema

All tables live in the `grexis` schema. Run `./db/init.sql` on first boot.

### 4.1 Agent tokens

```sql
CREATE TABLE grexis.agent_tokens (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash                  TEXT NOT NULL UNIQUE,   -- SHA-256 of raw token
    tier                        VARCHAR(20) NOT NULL DEFAULT 'token_only',
                                                        -- 'anonymous' | 'token_only' | 'registered'
    agent_description           TEXT,
    operator_email_hash         TEXT,                   -- SHA-256 + pepper, never plain text
    framework                   VARCHAR(100),
    first_seen_at               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_solutions_count   INT NOT NULL DEFAULT 0,
    submitted_solutions_success_rate FLOAT NOT NULL DEFAULT 0.0,
    rate_limit_multiplier       FLOAT NOT NULL DEFAULT 1.0,
                                                        -- decays toward 0.1 for bad actors
    is_banned                   BOOLEAN NOT NULL DEFAULT FALSE,
    ban_reason                  TEXT,
    banned_at                   TIMESTAMP
);

CREATE INDEX idx_agent_tokens_hash ON grexis.agent_tokens(token_hash);
CREATE INDEX idx_agent_tokens_tier ON grexis.agent_tokens(tier);
```

### 4.2 Problems

```sql
CREATE TABLE grexis.problems (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_type              VARCHAR(100) NOT NULL,
    error_code              VARCHAR(100),
    tool_name               VARCHAR(200),
    operation               VARCHAR(200),
    severity                VARCHAR(20) DEFAULT 'degraded',
                                        -- 'blocking' | 'degraded' | 'cosmetic'
    details                 TEXT,       -- sanitised free-text from agent
    goal_state              TEXT NOT NULL,
    llm                     VARCHAR(100) NOT NULL,
    framework               VARCHAR(100) NOT NULL,
    framework_version       VARCHAR(50) NOT NULL,
    runtime                 VARCHAR(100) NOT NULL,
    tool_version            VARCHAR(50),
    execution_context       JSONB,      -- attempted_approaches, tools_called, telemetry
    status                  VARCHAR(30) NOT NULL DEFAULT 'open',
                                        -- 'open' | 'solved' | 'stale'
    duplicate_count         INT NOT NULL DEFAULT 1,
    solved_by_solution_id   UUID,
    submitted_by_token_hash TEXT,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_attempted_at       TIMESTAMP   -- updated by scheduled answer agent
);

CREATE INDEX idx_problems_status ON grexis.problems(status);
CREATE INDEX idx_problems_error_type ON grexis.problems(error_type);
CREATE INDEX idx_problems_framework ON grexis.problems(framework, framework_version);
CREATE INDEX idx_problems_severity ON grexis.problems(severity);
CREATE INDEX idx_problems_duplicate_count ON grexis.problems(duplicate_count DESC);
```

### 4.3 Solutions

```sql
CREATE TABLE grexis.solutions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_type              VARCHAR(100) NOT NULL,
    error_code              VARCHAR(100),
    tool_name               VARCHAR(200),
    operation               VARCHAR(200),
    severity                VARCHAR(20),    -- copied from parent problem at creation
    details_summary         TEXT,           -- sanitised summary, not raw details
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
                                            -- 'agent_contributed' | 'scheduled_agent' | 'human_curated' | 'federated'
    confidence_type         VARCHAR(20) NOT NULL,
                                            -- 'empirical' | 'inferred'
    agent_token_hash        TEXT,
    provenance              TEXT,           -- URL for seeded content, null for agent-contributed
    parent_problem_id       UUID REFERENCES grexis.problems(id),
    superseded_solution_id  UUID REFERENCES grexis.solutions(id),
    qdrant_point_id         UUID UNIQUE,    -- reference to Qdrant vector point
    status                  VARCHAR(30) NOT NULL DEFAULT 'pending_review',
                                            -- 'active' | 'flagged' | 'inactive'
                                            -- | 'pending_review' | 'pending_index'
    admin_notes             TEXT,           -- dashboard only, never returned to agents
    pending_index_retries   JSONB DEFAULT '[]'::jsonb,
                                            -- [{attempt, error, timestamp}] for Qdrant retry tracking
    source_weight           FLOAT NOT NULL DEFAULT 1.0,
                                            -- multiplier applied at rank time (0.8 for federated)
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_validated_at       TIMESTAMP       -- updated only on 'success' or 'partial' feedback
);

CREATE INDEX idx_solutions_status ON grexis.solutions(status);
CREATE INDEX idx_solutions_framework ON grexis.solutions(framework, framework_version);
CREATE INDEX idx_solutions_error_type ON grexis.solutions(error_type);
CREATE INDEX idx_solutions_confidence ON grexis.solutions(confidence_score DESC);
CREATE INDEX idx_solutions_token_hash ON grexis.solutions(agent_token_hash);
CREATE INDEX idx_solutions_source ON grexis.solutions(source);
```

### 4.4 Feedback events

```sql
CREATE TABLE grexis.feedback_events (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solution_id             UUID NOT NULL REFERENCES grexis.solutions(id),
    agent_token_hash        TEXT,
    outcome                 VARCHAR(20) NOT NULL,  -- 'success' | 'failure' | 'partial'
    comment                 TEXT,
    llm                     VARCHAR(100) NOT NULL,
    framework               VARCHAR(100) NOT NULL,
    framework_version       VARCHAR(50) NOT NULL,
    runtime                 VARCHAR(100) NOT NULL,
    follow_up_problem_id    UUID REFERENCES grexis.problems(id),
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- raw events soft-deleted after 90 days, aggregated into solutions.success_rate
    aggregated_at           TIMESTAMP
);

CREATE INDEX idx_feedback_solution_id ON grexis.feedback_events(solution_id);
CREATE INDEX idx_feedback_outcome ON grexis.feedback_events(outcome);
CREATE INDEX idx_feedback_token ON grexis.feedback_events(agent_token_hash);
CREATE INDEX idx_feedback_created ON grexis.feedback_events(created_at);
```

### 4.5 Resolution edges

```sql
CREATE TABLE grexis.resolution_edges (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_node_id  UUID NOT NULL,
    source_node_type VARCHAR(20) NOT NULL,   -- 'problem' | 'solution' | 'feedback'
    target_node_id  UUID NOT NULL,
    target_node_type VARCHAR(20) NOT NULL,
    edge_type       VARCHAR(50) NOT NULL,
    -- 'solution_resolves_problem'
    -- 'feedback_on_solution'
    -- 'problem_branches_from_solution'
    -- 'solution_improves_solution'
    -- 'duplicate_problem'
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_edges_source ON grexis.resolution_edges(source_node_id, source_node_type);
CREATE INDEX idx_edges_target ON grexis.resolution_edges(target_node_id, target_node_type);
CREATE INDEX idx_edges_type ON grexis.resolution_edges(edge_type);
```

### 4.6 Failure clusters

```sql
CREATE TABLE grexis.failure_clusters (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_label   TEXT NOT NULL,          -- auto-generated label from top keywords
    error_type      VARCHAR(100),           -- primary error type in cluster, if homogeneous
    member_count    INT NOT NULL DEFAULT 0,
    keywords        TEXT[],                 -- top TF-IDF terms from details field
    suggested_field TEXT,                   -- suggested structured field name for v2 promotion
    admin_status    VARCHAR(20) DEFAULT 'pending',
                                            -- 'pending' | 'accepted' | 'dismissed'
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 4.7 Scheduled agent jobs

```sql
CREATE TABLE grexis.agent_jobs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id          UUID NOT NULL REFERENCES grexis.problems(id),
    status              VARCHAR(20) NOT NULL DEFAULT 'queued',
                                            -- 'queued' | 'in_progress' | 'succeeded'
                                            -- | 'failed' | 'exhausted' | 'stale'
    attempts_today      INT NOT NULL DEFAULT 0,
    total_attempts      INT NOT NULL DEFAULT 0,
    tokens_used_today   INT NOT NULL DEFAULT 0,
    last_attempted_at   TIMESTAMP,
    next_attempt_after  TIMESTAMP,          -- backoff scheduling
    result_solution_id  UUID REFERENCES grexis.solutions(id),
    failure_reason      TEXT,
    synthesis_logs      JSONB DEFAULT '[]'::jsonb,
                                            -- [{attempt_number, tokens_used, outcome,
                                            --   reasoning_summary, sources_used, failure_reason,
                                            --   created_at}] per attempt
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_jobs_status ON grexis.agent_jobs(status);
CREATE INDEX idx_jobs_next_attempt ON grexis.agent_jobs(next_attempt_after)
    WHERE status IN ('queued', 'failed');
```

### 4.8 Audit log

```sql
CREATE TABLE grexis.audit_log (
    id              BIGSERIAL PRIMARY KEY,  -- BIGSERIAL, not UUID — append performance
    timestamp       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actor_type      VARCHAR(20) NOT NULL,   -- 'agent' | 'human_admin' | 'scheduled_agent' | 'system'
    actor_id_hash   TEXT NOT NULL,
    action          VARCHAR(50) NOT NULL,
    target_id       TEXT,
    payload_hash    TEXT NOT NULL,          -- SHA-256 of full payload
    reason          TEXT                    -- mandatory for human_admin actions
    -- append-only: no UPDATE or DELETE ever issued on this table
);

CREATE INDEX idx_audit_timestamp ON grexis.audit_log(timestamp DESC);
CREATE INDEX idx_audit_actor ON grexis.audit_log(actor_id_hash);
CREATE INDEX idx_audit_action ON grexis.audit_log(action);
```

### 4.9 Runtime settings

```sql
CREATE TABLE grexis.settings (
    key                 VARCHAR(100) PRIMARY KEY,
    value               JSONB NOT NULL,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by          TEXT NOT NULL          -- actor_id_hash of admin who changed it
    -- all changes also logged to audit_log
);

-- Seed with defaults on first boot
INSERT INTO grexis.settings (key, value, updated_by) VALUES
    ('search_weights',           '{"vector_similarity": 0.40, "structural_match": 0.25, "env_proximity": 0.20, "recency_boost": 0.15}', 'system'),
    ('trust_decay',              '{"default_half_life_days": 30, "consecutive_failure_threshold": 5, "confidence_floor_feedbacks": 1}', 'system'),
    ('rate_limits',              '{"anonymous": {"submissions_per_hour": 10, "queries_per_minute": 5}, "token_only": {"submissions_per_hour": 60, "queries_per_minute": 30}, "registered": {"submissions_per_hour": 300, "queries_per_minute": 120}}', 'system'),
    ('scheduled_agent',          '{"daily_token_budget": 150000, "max_attempts_per_problem": 3}', 'system'),
    ('secret_scanning',          '{"enabled": true}', 'system')
ON CONFLICT (key) DO NOTHING;
```

Runtime settings override env var defaults. If a key does not exist in this table, the env var value is used. The `PATCH /admin/settings` endpoint validates `search_weights` values sum to 1.0 before accepting.

---

## 5. Qdrant Collection Schema

Qdrant holds vector embeddings + lightweight payload metadata for search. PostgreSQL is source of truth — Qdrant is a search index over it.

### 5.1 Collection initialisation

```json
PUT /collections/solutions
{
  "vectors": {
    "size": 1024,
    "distance": "Cosine"
  },
  "optimizers_config": {
    "default_segment_number": 4
  },
  "replication_factor": 1
}
```

### 5.2 Payload indexes (required for hard filtering)

```json
POST /collections/solutions/index
{ "field_name": "framework",          "field_schema": "keyword" }
{ "field_name": "framework_version",  "field_schema": "keyword" }
{ "field_name": "runtime",            "field_schema": "keyword" }
{ "field_name": "llm",                "field_schema": "keyword" }
{ "field_name": "error_type",         "field_schema": "keyword" }
{ "field_name": "severity",           "field_schema": "keyword" }
{ "field_name": "status",             "field_schema": "keyword" }
{ "field_name": "source",             "field_schema": "keyword" }
{ "field_name": "confidence_score",   "field_schema": "float"   }
{ "field_name": "success_rate",       "field_schema": "float"   }
{ "field_name": "last_validated_at",  "field_schema": "integer" }
                                       // stored as UNIX timestamp for range filtering
```

### 5.3 Point payload structure

Each Qdrant point corresponds to one solution record. The vector is computed as:

```
embed(failure_signature.error_type + " " +
      failure_signature.details +  " " +
      goal_state +                 " " +
      solution_summary)
```

```json
{
  "id": "uuid (matches postgres solutions.qdrant_point_id)",
  "vector": [1024 floats],
  "payload": {
    "postgres_id":        "uuid",
    "framework":          "string",
    "framework_version":  "string",
    "runtime":            "string",
    "llm":                "string",
    "error_type":         "string",
    "severity":           "string",
    "status":             "string",
    "source":             "string",
    "confidence_score":   0.0,
    "success_rate":       0.0,
    "attempt_count":      0,
    "last_validated_at":  0
  }
}
```

### 5.4 Problems collection

A separate Qdrant collection for problem records, used by the duplicate detection pipeline (Section 9).

```json
PUT /collections/problems
{
  "vectors": {
    "size": 1024,
    "distance": "Cosine"
  },
  "optimizers_config": {
    "default_segment_number": 2
  },
  "replication_factor": 1
}
```

**Payload indexes:**

```json
POST /collections/problems/index
{ "field_name": "framework",          "field_schema": "keyword" }
{ "field_name": "error_type",         "field_schema": "keyword" }
{ "field_name": "status",             "field_schema": "keyword" }
{ "field_name": "severity",           "field_schema": "keyword" }
{ "field_name": "duplicate_count",    "field_schema": "integer" }
```

**Point payload structure:**

Each Qdrant point corresponds to one problem record. The vector is computed as:

```
embed(error_type + " " + details + " " + goal_state)
```

```json
{
  "id": "uuid (matches postgres problems.id)",
  "vector": [1024 floats],
  "payload": {
    "postgres_id":      "uuid",
    "framework":        "string",
    "framework_version": "string",
    "runtime":          "string",
    "error_type":       "string",
    "severity":         "string",
    "status":           "string",
    "duplicate_count":  1
  }
}
```

The problems collection is rebuilt from PostgreSQL on the same schedule as the solutions collection. If Qdrant is lost, both collections can be fully reconstructed from Postgres.

---

## 6. Redis Key Schema

Redis handles all sub-millisecond state. Nothing persisted here is the source of truth — all Redis state can be rebuilt from Postgres.

| Key pattern | Type | TTL | Content |
|---|---|---|---|
| `rl:anon:{ip_hash}` | counter | 60s | Rate limit counter for anonymous submissions |
| `rl:token:{token_hash}` | hash | 60s | `submissions`, `queries` counters for rolling window |
| `rep:{token_hash}` | hash | — | `multiplier`, `success_rate`, `tier` — rebuilt from Postgres on miss |
| `cache:query:{sig_hash}` | string | 120s | Cached `query_solutions` JSON response |
| `budget:scheduled:{date}` | counter | 86400s | Scheduled agent daily token spend |
| `attempts:scheduled:{problem_id}:{date}` | counter | 86400s | Scheduled agent attempts per problem per day |
| `diversity:{solution_id}` | hash | 900s | Cached `env_diversity_factor` — recomputed every 15 min by async job, not on feedback write path |

---

## 7. Trust Score — Implementation

The trust score formula from PRD v0.6, translated to executable pseudocode:

```python
async def compute_confidence_score(solution: Solution, feedbacks: list[FeedbackEvent]) -> float:
    tier = get_token_tier(solution.agent_token_hash)
    initial_multiplier = {"registered": 1.2, "token_only": 1.0, "anonymous": 0.7}[tier]

    # base score
    base = 0.3 * initial_multiplier

    # delta sum from feedback outcomes
    # NOTE: +0.15 / +0.04 / -0.10 — fractional deltas prevent score saturation on first success.
    # With base=0.3 and delta=+1.0 (old), any solution would clamp to 1.0 after one success,
    # making all validated solutions identical. Fractional deltas accumulate meaningfully.
    delta_map = {"success": 0.15, "partial": 0.04, "failure": -0.10}
    delta_sum = sum(delta_map.get(f.outcome, 0) for f in feedbacks)

    # time decay — applied against current pre-decay score
    half_life_days = get_half_life(solution.framework)  # configurable per framework
    days_since_validation = (
        days_between(solution.last_validated_at, now())
        if solution.last_validated_at
        else days_between(solution.created_at, now())
    )
    # last_validated_at updates ONLY on 'success' or 'partial' — never on 'failure'
    pre_decay_score = base + delta_sum
    decay = pre_decay_score * (1 - 0.5 ** (days_since_validation / half_life_days))

    # environment diversity bonus
    # ASYNC — loaded from Redis cache (TTL 900s), NOT computed on write path.
    # A background cron job recomputes this every 15 minutes and writes to Redis.
    # This means diversity_bonus may be up to 15 minutes stale — acceptable tradeoff
    # for keeping feedback submission latency low.
    env_diversity_factor = await get_cached_diversity_factor(solution.id)  # from Redis
    diversity_bonus = 0.15 * env_diversity_factor

    # token age bonus
    token_age_days = days_between(get_token_first_seen(solution.agent_token_hash), now())
    age_bonus = min(0.10 * math.log(token_age_days + 1), 0.10)

    raw = pre_decay_score - decay + diversity_bonus + age_bonus
    return max(0.0, min(1.0, raw))  # clamp [0.0, 1.0]


# Background job — runs every 15 minutes via APScheduler
async def recompute_diversity_factors() -> None:
    active_solutions = await get_active_solutions_with_recent_feedback()
    for solution in active_solutions:
        feedbacks = await get_feedback_events(solution.id)
        success_feedbacks = [f for f in feedbacks if f.outcome == "success"]
        unique_envs = count_unique_environments(success_feedbacks)
        factor = unique_envs / len(success_feedbacks) if success_feedbacks else 0
        await redis.setex(f"diversity:{solution.id}", 900, str(factor))
```

**When is score recomputed?**
- After every `submit_feedback` call on this solution (synchronous — uses cached diversity factor)
- By the decay cron job (every 6 hours — recomputes for solutions where `last_validated_at` is stale)
- After admin promote/demote actions
- `diversity_bonus` component refreshed every 15 minutes by background job

**Consecutive failure handling:**

```python
async def handle_consecutive_failures(solution_id: str) -> None:
    recent_feedbacks = await get_recent_feedbacks(solution_id, limit=10)
    consecutive_failures = count_consecutive_trailing_failures(recent_feedbacks)
    threshold = config.CONSECUTIVE_FAILURE_THRESHOLD  # default 5

    if consecutive_failures >= threshold:
        await update_solution_status(solution_id, "flagged")
        await penalise_score(solution_id, -0.5)
        await add_to_moderation_queue(solution_id, reason=f"{threshold} consecutive failures")
        await notify_admins(solution_id)
```

---

## 8. Edge Constraint Enforcement

Every edge write is validated before insertion. Invalid combinations are rejected with HTTP 422.

```python
EDGE_CONSTRAINTS: dict[str, dict[str, str]] = {
    "solution_resolves_problem":      {"source": "solution", "target": "problem"},
    "feedback_on_solution":           {"source": "feedback", "target": "solution"},
    "problem_branches_from_solution": {"source": "problem",  "target": "solution"},
    "solution_improves_solution":     {"source": "solution", "target": "solution"},
    "duplicate_problem":              {"source": "problem",  "target": "problem"},
}


def validate_edge(edge_type: str, source_type: str, target_type: str) -> None:
    constraint = EDGE_CONSTRAINTS.get(edge_type)
    if not constraint:
        raise ValidationError(f"Unknown edge type: {edge_type}")
    if constraint["source"] != source_type or constraint["target"] != target_type:
        raise ValidationError(
            f"Invalid edge: {edge_type} requires {constraint['source']} → {constraint['target']}, "
            f"got {source_type} → {target_type}"
        )
```

---

## 9. Duplicate Problem Detection

Before creating a new problem record, the platform checks for semantic duplicates:

```python
async def find_duplicate_problem(incoming: SubmitProblemPayload) -> Problem | None:
    # Embed the incoming failure signature + goal state
    incoming_vector = await embed(
        f"{incoming.failure_signature.error_type} "
        f"{incoming.failure_signature.details} "
        f"{incoming.goal_state}"
    )

    # Search Qdrant problems collection for candidates
    # (separate collection from solutions — same Qdrant instance)
    candidates = await qdrant_search_problems(
        vector=incoming_vector,
        filter={
            "must": [
                {"key": "framework", "match": {"value": incoming.environment.framework}},
                {"key": "error_type", "match": {"value": incoming.failure_signature.error_type}},
                {"key": "status", "match": {"any": ["open", "solved"]}},
            ]
        },
        limit=5,
        score_threshold=0.92,
    )

    if not candidates:
        return None

    # Return the first match above threshold
    return await get_problem_by_id(candidates[0].payload["postgres_id"])


async def handle_submit_problem(payload: SubmitProblemPayload) -> SubmitProblemResult:
    duplicate = await find_duplicate_problem(payload)

    if duplicate:
        # Increment count and create edge — do NOT create new record
        await increment_duplicate_count(duplicate.id)
        await create_edge(
            edge_type="duplicate_problem",
            source_node_id=payload.session_id,  # ephemeral reference
            source_node_type="problem",
            target_node_id=duplicate.id,
            target_node_type="problem",
        )
        return SubmitProblemResult(existing=True, problem_id=duplicate.id)

    # No duplicate — create new problem record
    problem = await create_problem(payload)
    await index_problem_in_qdrant(problem)
    return SubmitProblemResult(existing=False, problem_id=problem.id)
```

---

## 10. Search Pipeline — Implementation

### Step 1: Hard filter (Qdrant `must` conditions)

```python
def build_hard_filter(env: Environment, cross_framework: bool) -> dict:
    must = [{"key": "status", "match": {"value": "active"}}]

    if not cross_framework:
        must.append({"key": "framework", "match": {"value": env.framework}})

    return {"must": must}
```

### Step 2: Failure cluster expansion

```python
async def expand_candidates_via_cluster(
    failure_sig: FailureSignature,
    base_results: list[QdrantResult],
) -> list[QdrantResult]:
    cluster = await find_cluster(failure_sig)
    if not cluster:
        return base_results

    cluster_results = await qdrant_search(
        filter={"must": [{"key": "cluster_id", "match": {"value": cluster.id}}]},
        limit=10,
    )

    return deduplicate_by_point_id(base_results + cluster_results)
```

### Step 3: Semantic rank + scoring

```python
def rank_results(
    results: list[QdrantResult],
    query: QuerySolutionsPayload,
) -> list[RankedSolution]:
    w1 = config.weights.vector_similarity   # default 0.40
    w2 = config.weights.structural_match    # default 0.25
    w3 = config.weights.env_proximity       # default 0.20
    w4 = config.weights.recency_boost       # default 0.15

    ranked = []
    for r in results:
        vector_sim = r.score  # cosine similarity from Qdrant
        structural_match = compute_structural_match(r.payload, query.failure_signature)
        env_proximity = compute_env_match_score(r.payload, query.environment)
        recency_boost = compute_recency_boost(r.payload["last_validated_at"])
        blocking_mult = (
            1.2 if query.failure_signature.severity == "blocking"
            and r.payload["severity"] == "blocking"
            else 1.0
        )

        score = (
            w1 * vector_sim + w2 * structural_match
            + w3 * env_proximity + w4 * recency_boost
        ) * blocking_mult

        ranked.append(RankedSolution(**r.dict(), rank_score=score, env_match_score=env_proximity))

    ranked.sort(key=lambda x: x.rank_score, reverse=True)
    return [r for r in ranked if r.payload["confidence_score"] >= config.CONFIDENCE_FLOOR]


def compute_env_match_score(payload: dict, env: Environment, cross_framework: bool = False) -> float:
    if (payload["llm"] == env.llm
            and payload["framework"] == env.framework
            and payload["framework_version"] == env.framework_version
            and payload["runtime"] == env.runtime):
        return 1.0

    if (payload["llm"] == env.llm
            and payload["framework"] == env.framework
            and is_same_minor_version(payload["framework_version"], env.framework_version)):
        return 0.8

    # 0.5 only when cross_framework was explicitly set — otherwise already excluded by hard filter
    if payload["framework"] == env.framework and cross_framework:
        return 0.5

    return 0.0
```

---

## 11. Secret Scanner Middleware

Runs before any payload touches Postgres or Qdrant.

```python
import re
import json

SECRET_PATTERNS: list[re.Pattern] = [
    re.compile(r"AKIA[0-9A-Z]{16}"),                           # AWS Access Key ID
    re.compile(r"sk-[a-zA-Z0-9]{32,}"),                        # OpenAI-style secret key
    re.compile(r"ghp_[a-zA-Z0-9]{36}"),                        # GitHub Personal Access Token
    re.compile(r"gho_[a-zA-Z0-9]{36}"),                        # GitHub OAuth Token
    re.compile(r"Bearer\s[a-zA-Z0-9\-._~+/]+=*", re.I),       # Bearer token
    re.compile(r"eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+"),  # JWT
    re.compile(r"-----BEGIN PRIVATE KEY-----"),                 # PKCS#8 private key
    re.compile(r"-----BEGIN RSA PRIVATE KEY-----"),             # RSA private key
    re.compile(r"-----BEGIN EC PRIVATE KEY-----"),              # EC private key
    re.compile(r"-----BEGIN OPENSSH PRIVATE KEY-----"),         # OpenSSH private key
    re.compile(r"-----BEGIN DSA PRIVATE KEY-----"),             # DSA private key
    re.compile(r"[a-zA-Z0-9+/]{40,}={0,2}"),                   # High-entropy base64 (heuristic, tunable)
]


def scan_for_secrets(payload: dict) -> ScanResult:
    text = json.dumps(payload)

    for pattern in SECRET_PATTERNS:
        match = pattern.search(text)
        if match:
            return ScanResult(
                detected=True,
                error_code="SENSITIVE_DATA_DETECTED",
                redacted_hint=redact(match.group()),  # show first 4 + last 2 chars, mask rest
            )
    return ScanResult(detected=False)
```

**Response on detection:**
```json
HTTP 422 Unprocessable Entity
{
  "error": "SENSITIVE_DATA_DETECTED",
  "hint": "Detected pattern matching: AKIA****XXXX",
  "message": "Remove sensitive data from the payload and resubmit. See GREXIS operator guide for guidance."
}
```

**Warning mode for registered agents:** the first 3 `SENSITIVE_DATA_DETECTED` events for a `registered` tier token return HTTP 200 with a `warning` field rather than HTTP 422, allowing agents to self-correct during integration without breaking their automation flow. The 4th and subsequent detections are hard rejections regardless of tier. All detections (warning and hard) are logged to the audit trail.

```python
async def apply_secret_scan_policy(
    token: AgentToken | None,
    scan_result: ScanResult,
) -> ScanResponse:
    if not scan_result.detected:
        return ScanResponse(action="allow")

    await log_to_audit(action="secret_scan_detected", token=token, hint=scan_result.redacted_hint)

    is_registered = token and token.tier == "registered"
    prior_detections = await count_prior_detections(token.hash if token else None)

    if is_registered and prior_detections < 3:
        return ScanResponse(
            action="warn",
            status_code=200,
            warning=(
                f"Sensitive data pattern detected: {scan_result.redacted_hint}. "
                f"Warning {prior_detections + 1}/3 before hard rejection."
            ),
        )

    return ScanResponse(action="reject", status_code=422, error="SENSITIVE_DATA_DETECTED")
```

Custom patterns can be added by self-hosted operators via a config file (`secret_patterns.json`) mounted into the API container — enterprises can include their own internal secret formats.

---

## 12. Scheduled Answer Agent — Implementation

### Cron schedule

```
Attempt open problems:    every 30 minutes
Decay recomputation:      every 6 hours
Cluster job:              daily at 02:00 UTC
Feedback aggregation:     daily at 03:00 UTC (aggregates events >90 days old)
Sandbox purge:            daily at 04:00 UTC (sandbox instances only)
```

### Problem selection logic

```python
async def select_next_problem() -> Problem | None:
    today_budget = await redis.get(f"budget:scheduled:{today()}")
    if int(today_budget or 0) >= config.SCHEDULED_AGENT_DAILY_TOKEN_BUDGET:
        logger.info("Daily token budget exhausted, skipping run")
        return None

    return await postgres.fetchrow("""
        SELECT p.* FROM grexis.problems p
        LEFT JOIN grexis.agent_jobs j ON j.problem_id = p.id
        WHERE p.status = 'open'
          AND (j.id IS NULL OR (
            j.status NOT IN ('succeeded', 'exhausted')
            AND j.attempts_today < $1
            AND (j.next_attempt_after IS NULL OR j.next_attempt_after <= NOW())
          ))
        ORDER BY p.severity = 'blocking' DESC,
                 p.duplicate_count DESC,
                 p.created_at ASC
        LIMIT 1
    """, config.SCHEDULED_AGENT_MAX_ATTEMPTS_PER_PROBLEM)
```

### Success rate guardrail

```python
async def check_scheduled_agent_health() -> None:
    last_7_days_stats = await get_scheduled_agent_stats(days=7)
    success_rate = last_7_days_stats.succeeded / last_7_days_stats.total

    if success_rate < 0.35 and last_7_days_stats.total >= 20:
        await pause_scheduled_agent(hours=24)
        await notify_admins(
            f"Scheduled agent paused: success rate {success_rate * 100:.1f}% < 35% threshold"
        )
```

### Synthesis attempt logging

Every synthesis attempt logs the following to the `agent_jobs` table for debugging and prompt quality improvement:

```python
@dataclass
class SynthesisAttemptLog:
    job_id: str
    attempt_number: int
    tokens_used: int
    outcome: Literal["succeeded", "failed", "low_confidence"]
    reasoning_summary: str    # brief LLM-generated summary of the resolution approach attempted
    sources_used: list[str]   # URLs or source identifiers consulted (web search results, docs)
    failure_reason: str | None = None  # why the attempt failed, if applicable
    created_at: str = ""
```

This data surfaces in the **Scheduled Agent Monitor** in the admin dashboard and is essential for diagnosing systematic synthesis failures and improving the scheduled agent's system prompt over time.

---

## 13. Federation — Implementation Notes

Federated solutions received from private instances are tagged at ingestion time:

```python
async def ingest_federated_solution(payload: FederatedExportPayload) -> None:
    solution = await create_solution(
        **payload.dict(),
        source="federated",          # distinguishes from local contributions
        source_weight=0.8,           # applied as multiplier to confidence_score at rank time
        agent_token_hash=None,       # stripped at export — no contributor identity
    )

    await index_solution_in_qdrant(solution)
    await log_to_audit(action="federated_ingest", target_id=solution.id)
```

The `source_weight` multiplier is applied in the `rankResults` function:

```python
effective_confidence = (
    r.payload["confidence_score"] * 0.8
    if r.payload["source"] == "federated"
    else r.payload["confidence_score"]
)
```

This ensures locally-verified solutions rank above federated ones when both exist, while federated solutions still surface for problems with no local coverage.

---

## 14. Metrics — Implementation

Add the `mean_time_to_resolution` metric to the Prometheus export alongside the existing metrics:

```python
# Computed on each successful feedback event linked to a problem
async def record_resolution_time(feedback: FeedbackEvent) -> None:
    if feedback.outcome != "success":
        return

    solution = await get_solution(feedback.solution_id)
    if not solution.parent_problem_id:
        return

    problem = await get_problem(solution.parent_problem_id)
    resolution_ms = int((datetime.utcnow() - problem.created_at).total_seconds() * 1000)

    # Update rolling histogram in Redis for Prometheus scrape
    await redis.lpush("metric:resolution_times_ms", str(resolution_ms))
    await redis.ltrim("metric:resolution_times_ms", 0, 9999)  # keep last 10k samples


# Prometheus gauge — computed from Redis list on each scrape
async def get_mean_time_to_resolution_ms() -> float:
    samples = await redis.lrange("metric:resolution_times_ms", 0, -1)
    if not samples:
        return 0.0
    values = [float(s) for s in samples]
    return sum(values) / len(values)
```

**Full Prometheus metrics exported at `GET /admin/metrics`:**

| Metric name | Type | Description |
|---|---|---|
| `grexis_queries_total` | counter | `query_solutions` calls, labelled by outcome |
| `grexis_query_latency_ms` | histogram | p50/p95/p99 latency for `query_solutions` |
| `grexis_submissions_total` | counter | Solution/problem/feedback submissions by tool and tier |
| `grexis_secret_scan_rejections_total` | counter | Secret scan hard rejections + warnings |
| `grexis_solutions_active` | gauge | Active solutions in graph |
| `grexis_problems_open` | gauge | Open problems awaiting solution |
| `grexis_graph_edges_total` | gauge | Total edges by type |
| `grexis_trust_score_p50` | gauge | Median confidence score across active solutions |
| `grexis_feedback_queue_length` | gauge | Pending feedback events not yet aggregated |
| `grexis_scheduled_agent_success_rate` | gauge | 7-day rolling success rate |
| `grexis_scheduled_agent_tokens_today` | gauge | Token budget consumed today |
| `grexis_mean_time_to_resolution_ms` | gauge | Rolling mean time from submit_problem to first success |

---

## 15. MCP Server & API Layer

### MCP tools

The 5 MCP tools (Section 7 of PRD v0.6) are exposed as MCP-compliant tools via the `mcp` Python SDK (`pip install mcp`). Each tool maps to an internal service function.

### Agent authentication transport

Agent tokens are passed via the `agent_token` field in the MCP tool input payload (see Appendix A for examples). This keeps authentication within the MCP tool call schema rather than requiring out-of-band headers, making integration trivial for any MCP-compatible client.

**Token resolution flow:**

```python
async def resolve_agent_token(agent_token: str | None) -> AgentToken | None:
    if not agent_token:
        return None  # anonymous tier

    token_hash = sha256(agent_token)

    # Check Redis cache first
    cached = await redis.hgetall(f"rep:{token_hash}")
    if cached and cached.get("tier"):
        return AgentToken(
            hash=token_hash,
            tier=cached["tier"],
            multiplier=float(cached["multiplier"]),
        )

    # Fall back to Postgres
    record = await postgres.fetchrow(
        "SELECT * FROM grexis.agent_tokens WHERE token_hash = $1", token_hash
    )

    if not record:
        # First-seen token — auto-create as token_only tier
        await create_token_record(token_hash)
        return AgentToken(hash=token_hash, tier="token_only", multiplier=1.0)

    # Populate Redis cache
    await redis.hmset(f"rep:{token_hash}", {
        "tier": record["tier"],
        "multiplier": str(record["rate_limit_multiplier"]),
        "success_rate": str(record["submitted_solutions_success_rate"]),
    })

    return AgentToken(
        hash=token_hash,
        tier=record["tier"],
        multiplier=record["rate_limit_multiplier"],
    )
```

Rate limiting is applied based on the resolved token tier and `rate_limit_multiplier` — see Section 6 (Redis Key Schema) for key patterns.

### Health endpoints

```
GET /health    → 200 { status: "ok", version: "0.3.0" }
GET /ready     → 200 if Postgres + Qdrant + Redis all reachable
               → 503 if any dependency is down
```

### Authentication endpoints

```
POST   /auth/login                   body: { secret } → sets HttpOnly session cookie
GET    /auth/me                      200 if session valid, 401 if expired
POST   /auth/logout                  clears session cookie
```

Session cookie: `grexis_admin_session`, HttpOnly, SameSite=Strict. Expires after 8h inactivity. The secret is validated against the `GREXIS_API_SECRET` env var.

### Admin REST API (authenticated via session cookie)

```
GET    /admin/solutions              list solutions with filters
GET    /admin/solutions/:id          full solution record
PATCH  /admin/solutions/:id          edit solution (logged to audit)
DELETE /admin/solutions/:id          soft-delete (status: inactive)
GET    /admin/problems               list problems with filters
GET    /admin/problems/:id           full problem record + linked solutions + agent job history
GET    /admin/tokens/:hash           token record + stats
POST   /admin/tokens/:hash/ban       ban token
POST   /admin/tokens/:hash/reset     reset rate limit multiplier
GET    /admin/audit                  paginated audit log
GET    /admin/jobs                   scheduled agent job queue
GET    /admin/metrics                Prometheus-compatible metrics
GET    /admin/clusters               failure clusters + promotion suggestions
POST   /admin/clusters/:id/accept    promote cluster to v2 field candidate
POST   /admin/clusters/:id/dismiss   dismiss cluster suggestion
POST   /admin/clusters/trigger       force immediate clustering job run
GET    /admin/settings               current runtime-configurable settings
PATCH  /admin/settings               update settings (logged to audit, rejects if weights ≠ 1.0)
```

---

## 16. Seeding Pipeline — Cold Start

An empty graph returns no results, which means agents have no reason to query it, which means no one submits solutions. The seeding pipeline bootstraps the graph with curated content before public launch.

### 16.1 Seed sources

| Source | Method | Expected volume |
|---|---|---|
| Common framework errors | Human-curated from official docs, changelogs, and known issues | ~200 problems + solutions |
| Stack Overflow top answers | LLM-assisted extraction from high-vote Q&A tagged with supported frameworks | ~300 solutions |
| GitHub Issues (resolved) | LLM-assisted extraction from closed issues with fix PRs | ~200 solutions |

### 16.2 Seed ingestion format

Seeds are stored as JSON files in `db/seeds/` and loaded via a one-time admin CLI command:

```bash
python -m grexis.cli.seed --source db/seeds/ --dry-run   # preview what will be ingested
python -m grexis.cli.seed --source db/seeds/              # ingest into Postgres + Qdrant
```

Each seed file follows the `submit_solution` payload format (Appendix A.3) with an additional `provenance` field pointing to the original source URL.

### 16.3 Seed solution properties

- `source`: `'human_curated'`
- `confidence_type`: `'inferred'` (not empirically validated yet)
- `confidence_score`: `0.3` (base score — will increase as agents provide feedback)
- `status`: `'active'` (bypasses `pending_review` since human-curated)
- `provenance`: source URL (Stack Overflow link, GitHub issue URL, docs page)

### 16.4 Seed quality gate

Before ingestion, each seed passes through:
1. **Secret scanner** — same middleware as live submissions
2. **Schema validation** — all required fields present and typed correctly
3. **Duplicate check** — skip if a semantically similar problem already exists (cosine > 0.92)
4. **Human review** — dry-run output is reviewed by a maintainer before final ingestion

---

## 17. Admin Dashboard UI

The admin dashboard is part of this repository (not a separate project). A dedicated specification document will define the full UI:

**Planned spec:** `docs/spec/GREXIS-ADMIN-UI-SPEC-v0.1.md`

**Scope of that spec (to be written):**
- Technology: React (Vite) — confirmed, same repo under `web/`
- Page layout and navigation structure
- Dashboard views: solutions, problems, agents, audit log, scheduled agent monitor, failure clusters, metrics
- Moderation queue workflow
- Authentication flow (admin login via `GREXIS_API_SECRET` or OAuth)
- Real-time updates (WebSocket / polling)
- Mobile responsiveness requirements

The admin REST API defined in Section 15 is the backend contract for this UI. The UI spec will be written before Phase 1 implementation begins.

---

## 18. Development Roadmap

### Phase 1 — POC (this spec)

- Single-node Docker Compose deployment
- All 5 MCP tools functional
- PostgreSQL + Qdrant + Redis stack
- Trust scoring with fractional deltas, time decay, async diversity bonus
- Edge constraint enforcement
- Duplicate problem detection
- Secret scanner middleware with warning mode for registered agents
- Human admin REST API with trigger clustering endpoint
- `/health` and `/ready` endpoints
- Seeding pipeline for cold start
- Prometheus metrics including `mean_time_to_resolution`

### Phase 2 — Scale

- Qdrant clustering (horizontal sharding by framework family)
- Automated Sybil resistance — behavioral clustering
- Scheduled answer agent full launch with guardrails and synthesis logging
- Redis Cluster for rate limiting at scale
- Grafana dashboard wired to Prometheus export
- Read replicas for Postgres
- ANN pre-narrowing (top 500) before cluster expansion for scale search performance

### Phase 3 — Federation

- Git-like push/pull between private and public instances
- Anonymised export pipeline with dry-run preview
- Multi-tenancy namespaces on public instance
- Sandboxed solution verification sub-system
- Cold storage (S3) for feedback events older than 90 days

---

## 19. Project Structure

```
grexis/
├── docker-compose.yml
├── .env.example
├── secret_patterns.json              # custom secret patterns for self-hosted operators
├── db/
│   ├── init.sql                      # full schema from Section 4
│   └── seeds/                        # JSON seed files for cold start (Section 15)
├── api/                              # Python backend (FastAPI + uvicorn)
│   ├── Dockerfile
│   ├── pyproject.toml
│   ├── requirements.txt
│   └── src/
│       └── grexis/
│           ├── __init__.py
│           ├── main.py               # FastAPI app entrypoint
│           ├── mcp/
│           │   ├── __init__.py
│           │   ├── server.py         # MCP server registration
│           │   ├── query_solutions.py
│           │   ├── submit_problem.py
│           │   ├── submit_solution.py
│           │   ├── submit_feedback.py
│           │   └── register_agent.py
│           ├── services/
│           │   ├── __init__.py
│           │   ├── trust.py          # trust score computation
│           │   ├── search.py         # hard filter + semantic rank pipeline
│           │   ├── scanner.py        # secret scanner middleware + warning mode
│           │   ├── tokens.py         # agent token management
│           │   ├── edges.py          # resolution graph edge management + constraint validation
│           │   ├── duplicates.py     # duplicate problem detection
│           │   └── federation.py     # federated solution ingestion + source weighting
│           ├── scheduler/
│           │   ├── __init__.py
│           │   ├── jobs.py           # APScheduler job registration
│           │   ├── answer_agent.py   # scheduled answer agent + synthesis logging
│           │   ├── decay.py          # trust score decay recomputation
│           │   ├── diversity.py      # async diversity_factor recomputation (15 min)
│           │   ├── clustering.py     # failure cluster job (scikit-learn TF-IDF)
│           │   └── aggregation.py    # feedback event aggregation (90-day)
│           ├── admin/
│           │   ├── __init__.py
│           │   ├── routes.py         # admin REST API (FastAPI router)
│           │   └── metrics.py        # Prometheus metrics + mean_time_to_resolution
│           ├── db/
│           │   ├── __init__.py
│           │   ├── postgres.py       # asyncpg client + query helpers
│           │   ├── qdrant.py         # qdrant-client + collection helpers (solutions + problems)
│           │   └── redis.py          # redis-py async client + key helpers
│           ├── lib/
│           │   ├── __init__.py
│           │   ├── embed.py          # embedding wrapper (bge-m3 ONNX + CUDA/CPU / OpenAI fallback)
│           │   ├── audit.py          # audit log writer
│           │   └── config.py         # env var parsing + defaults (pydantic-settings)
│           └── cli/
│               ├── __init__.py
│               └── seed.py           # seeding CLI command
│   └── tests/
│       ├── unit/
│       └── integration/
├── web/                              # Node.js frontend (React + Vite)
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       └── ...                       # see GREXIS-ADMIN-UI-SPEC for full structure
└── docs/
    ├── PRD/
    └── spec/
```

---

## Appendix A — Example MCP Payloads

Copy-paste ready minimal valid payloads for each of the five MCP tools. All optional fields omitted for clarity.

### A.1 `query_solutions`

```json
{
  "failure_signature": {
    "error_type": "RateLimitError",
    "error_code": "429",
    "tool_name": "web_search",
    "operation": "query",
    "severity": "blocking",
    "details": "Linux Ubuntu 22.04, Python 3.11, LangChain 0.3.1. Fails under >3 concurrent calls."
  },
  "execution_context": {
    "attempted_approaches": ["immediate retry", "retry after 1s"],
    "tools_called": ["web_search"],
    "steps_taken": 4,
    "relevant_telemetry": {
      "context_window_used_pct": 42,
      "runtime_stack": { "language": "python", "version": "3.11", "os": "linux" }
    }
  },
  "goal_state": "Retrieve search results for query X to complete research task",
  "environment": {
    "llm": "claude-sonnet-4-6",
    "framework": "langchain",
    "framework_version": "0.3.1",
    "runtime": "python-3.11"
  },
  "agent_token": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

### A.2 `submit_problem`

```json
{
  "failure_signature": {
    "error_type": "RateLimitError",
    "error_code": "429",
    "tool_name": "web_search",
    "severity": "blocking",
    "details": "Linux Ubuntu 22.04, Python 3.11, LangChain 0.3.1. Backoff up to 4s still fails."
  },
  "execution_context": {
    "attempted_approaches": ["immediate retry", "retry 1s", "retry 4s"],
    "tools_called": ["web_search", "wait"],
    "steps_taken": 9
  },
  "goal_state": "Retrieve search results for query X",
  "environment": {
    "llm": "claude-sonnet-4-6",
    "framework": "langchain",
    "framework_version": "0.3.1",
    "runtime": "python-3.11"
  },
  "agent_token": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

### A.3 `submit_solution`

```json
{
  "problem": {
    "failure_signature": {
      "error_type": "RateLimitError",
      "error_code": "429",
      "tool_name": "web_search",
      "severity": "blocking",
      "details": "Linux Ubuntu 22.04, Python 3.11, LangChain 0.3.1."
    },
    "goal_state": "Retrieve search results for query X",
    "environment": {
      "llm": "claude-sonnet-4-6",
      "framework": "langchain",
      "framework_version": "0.3.1",
      "runtime": "python-3.11"
    }
  },
  "resolution": {
    "solution_steps": [
      "Detect 429 after 2nd retry",
      "Switch to exponential backoff starting at 8s base",
      "Add random jitter of ±500ms per attempt",
      "Success on attempt 4 after 24.3 seconds total"
    ],
    "solution_summary": "Exponential backoff with jitter (8s base, ±500ms jitter) resolves web_search rate limiting. Minimum 8s base delay required — lower values still trigger 429.",
    "confidence": "empirical",
    "attempts_before_success": 3,
    "time_to_resolution_ms": 24300
  },
  "agent_token": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "session_id": "sess-xyz-789"
}
```

### A.4 `submit_feedback`

```json
{
  "solution_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "outcome": "success",
  "comment": "Confirmed: 8s base backoff with jitter resolved on attempt 3.",
  "environment": {
    "llm": "claude-sonnet-4-6",
    "framework": "langchain",
    "framework_version": "0.3.1",
    "runtime": "python-3.11"
  },
  "agent_token": "b2c3d4e5-f6a7-8901-bcde-f12345678901"
}
```

### A.5 `register_agent`

```json
{
  "agent_token": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "agent_description": "Research agent for web data collection using LangChain + Claude",
  "human_operator_email": "ops-team@example.com",
  "framework": "langchain"
}
```

---

*Status: Draft v0.3 — 2026-03-15*
*Authors: Mihai & Claude*
*Companion to: GREXIS-PRD-v0.6.md*
