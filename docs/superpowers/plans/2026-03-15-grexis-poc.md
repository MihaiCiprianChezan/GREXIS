# GREXIS POC Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the GREXIS POC — a semantic resolution graph platform with Python/FastAPI backend, Qdrant+PostgreSQL+Redis infrastructure, 5 MCP tools, admin REST API, scheduler jobs, seeding CLI, and React admin dashboard.

**Architecture:** Split-stack monorepo. Python 3.12 (FastAPI + uvicorn) backend in `api/`, React 18 (Vite + TypeScript) frontend in `web/`. BAAI/bge-m3 embeddings via ONNX Runtime with CUDA/CPU fallback. PostgreSQL source of truth, Qdrant search index, Redis cache/rate-limit. Dual-write pattern: Postgres first, then Qdrant, then Redis.

**Tech Stack:** Python 3.12, FastAPI, asyncpg, qdrant-client, redis-py, onnxruntime-gpu, scikit-learn, NLTK, APScheduler, mcp SDK, pydantic-settings | React 18, Vite, TypeScript | PostgreSQL 15, Qdrant, Redis 7 | Docker Compose

**Specs:**
- `docs/spec/GREXIS-TECH-SPEC-v0.3.md` — full backend/infra spec
- `docs/spec/GREXIS-ADMIN-UI-SPEC-v0.1.md` — admin dashboard UI spec

---

## Chunk 1: Infrastructure & Scaffolding

This chunk creates the project skeleton, Docker infrastructure, database schema, and env configuration. After this chunk, `docker compose up` boots all services (Postgres, Qdrant, Redis, API placeholder, Web placeholder).

### Task 1: Project directory structure

**Files:**
- Create: `api/src/grexis/__init__.py`
- Create: `api/src/grexis/main.py` (placeholder)
- Create: `api/tests/__init__.py`
- Create: `api/tests/unit/__init__.py`
- Create: `api/tests/integration/__init__.py`
- Create: `web/src/main.tsx` (placeholder)

- [ ] **Step 1: Create Python backend directory tree**

```bash
mkdir -p api/src/grexis/{mcp,services,scheduler,admin,db,lib,cli}
mkdir -p api/tests/{unit,integration}
touch api/src/grexis/__init__.py
touch api/src/grexis/mcp/__init__.py
touch api/src/grexis/services/__init__.py
touch api/src/grexis/scheduler/__init__.py
touch api/src/grexis/admin/__init__.py
touch api/src/grexis/db/__init__.py
touch api/src/grexis/lib/__init__.py
touch api/src/grexis/cli/__init__.py
touch api/tests/__init__.py
touch api/tests/unit/__init__.py
touch api/tests/integration/__init__.py
```

- [ ] **Step 2: Create React frontend directory tree**

```bash
mkdir -p web/src/{components,pages,hooks,lib,types}
mkdir -p web/public
```

- [ ] **Step 3: Create placeholder main.py**

Create `api/src/grexis/main.py`:
```python
from fastapi import FastAPI

app = FastAPI(title="GREXIS", version="0.3.0")


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.3.0"}
```

- [ ] **Step 4: Commit scaffolding**

```bash
git add api/ web/
git commit -m "chore: create project directory structure for api/ and web/"
```

### Task 2: Python project configuration

**Files:**
- Create: `api/pyproject.toml`
- Create: `api/requirements.txt`

- [ ] **Step 1: Write pyproject.toml**

Create `api/pyproject.toml`:
```toml
[project]
name = "grexis"
version = "0.3.0"
description = "GREXIS — Semantic Resolution Graph for AI Agents"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "asyncpg>=0.30.0",
    "qdrant-client>=1.12.0",
    "redis[hiredis]>=5.2.0",
    "onnxruntime-gpu>=1.20.0",
    "transformers>=4.46.0",
    "tokenizers>=0.20.0",
    "scikit-learn>=1.6.0",
    "nltk>=3.9.0",
    "apscheduler>=3.10.0",
    "mcp>=1.0.0",
    "pydantic-settings>=2.6.0",
    "pydantic>=2.10.0",
    "httpx>=0.28.0",
    "openai>=1.55.0",
    "itsdangerous>=2.2.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.0",
    "pytest-asyncio>=0.24.0",
    "pytest-cov>=6.0.0",
    "ruff>=0.8.0",
    "mypy>=1.13.0",
]
cpu = [
    "onnxruntime>=1.20.0",
]

[build-system]
requires = ["setuptools>=75.0"]
build-backend = "setuptools.backends._legacy:_Backend"

[tool.setuptools.packages.find]
where = ["src"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.ruff]
target-version = "py312"
line-length = 120

[tool.mypy]
python_version = "3.12"
strict = true
```

- [ ] **Step 2: Write requirements.txt (pinned)**

Create `api/requirements.txt`:
```
-e .[dev]
```

- [ ] **Step 3: Commit**

```bash
git add api/pyproject.toml api/requirements.txt
git commit -m "chore: add Python project configuration (pyproject.toml)"
```

### Task 3: React frontend configuration

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/tsconfig.node.json`
- Create: `web/vite.config.ts`
- Create: `web/index.html`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Create: `web/src/vite-env.d.ts`

- [ ] **Step 1: Write package.json**

Create `web/package.json`:
```json
{
  "name": "grexis-admin",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint ."
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^7.1.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "~5.6.0",
    "vite": "^6.0.0",
    "eslint": "^9.15.0"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

Create `web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write vite.config.ts**

Create `web/vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
```

- [ ] **Step 4: Write index.html and entry files**

Create `web/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GREXIS Admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `web/src/vite-env.d.ts`:
```typescript
/// <reference types="vite/client" />
```

Create `web/src/main.tsx`:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `web/src/App.tsx`:
```tsx
export function App() {
  return <div>GREXIS Admin — loading...</div>;
}
```

- [ ] **Step 5: Commit**

```bash
git add web/
git commit -m "chore: scaffold React frontend with Vite + TypeScript"
```

### Task 4: Database schema (init.sql)

**Files:**
- Create: `db/init.sql`
- Create: `db/seeds/.gitkeep`

- [ ] **Step 1: Write init.sql with all tables from Tech Spec Section 4**

Create `db/init.sql` with the full schema. Copy all CREATE TABLE statements from Tech Spec Sections 4.1–4.9 verbatim, wrapped with:

```sql
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
```

- [ ] **Step 2: Create seeds directory**

```bash
mkdir -p db/seeds
touch db/seeds/.gitkeep
```

- [ ] **Step 3: Commit**

```bash
git add db/
git commit -m "feat: add PostgreSQL schema (init.sql) with all 9 tables"
```

### Task 5: Docker Compose & Dockerfiles

**Files:**
- Create: `docker-compose.yml`
- Create: `api/Dockerfile`
- Create: `web/Dockerfile`
- Create: `.env.example`
- Create: `secret_patterns.json`

- [ ] **Step 1: Write docker-compose.yml**

Create `docker-compose.yml` — copy from Tech Spec Section 3.1 verbatim. All 5 services: qdrant, postgres, redis, api, web.

- [ ] **Step 2: Write api/Dockerfile**

Create `api/Dockerfile`:
```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install system deps for onnxruntime
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

# Download bge-m3 ONNX model at build time
RUN python -c "from huggingface_hub import snapshot_download; snapshot_download('BAAI/bge-m3', local_dir='/models/bge-m3', allow_patterns=['*.onnx', '*.json', '*.txt', 'tokenizer*'])"

EXPOSE 8000

CMD ["uvicorn", "grexis.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 3: Write web/Dockerfile**

Create `web/Dockerfile`:
```dockerfile
FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
```

Create `web/nginx.conf`:
```nginx
server {
    listen 3000;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://api:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

- [ ] **Step 4: Write .env.example**

Create `.env.example` — all env vars from Tech Spec Section 3.2 with comments and safe defaults.

```env
# PostgreSQL
POSTGRES_USER=grexis_admin
POSTGRES_PASSWORD=changeme_in_production
POSTGRES_DB=grexis_graph
POSTGRES_URL=postgresql+asyncpg://grexis_admin:changeme_in_production@postgres:5432/grexis_graph

# Qdrant
QDRANT_URL=http://qdrant:6333

# Redis
REDIS_URL=redis://redis:6379

# Embedding
EMBEDDING_PROVIDER=local
# OPENAI_API_KEY=sk-...  # required only when EMBEDDING_PROVIDER=openai
# CUDA_VISIBLE_DEVICES=  # empty = CPU only; "0" = first GPU

# Admin
GREXIS_API_SECRET=changeme_grexis_admin_secret

# Scheduled agent
SCHEDULED_AGENT_DAILY_TOKEN_BUDGET=150000
SCHEDULED_AGENT_MAX_ATTEMPTS_PER_PROBLEM=3

# Trust
TRUST_DECAY_DEFAULT_HALF_LIFE_DAYS=30
CONSECUTIVE_FAILURE_THRESHOLD=5
CONFIDENCE_FLOOR_FEEDBACKS=1

# Secret scanning
SECRET_SCAN_ENABLED=true

# Sandbox
SANDBOX_MODE=false
```

- [ ] **Step 5: Write secret_patterns.json**

Create `secret_patterns.json`:
```json
{
  "custom_patterns": []
}
```

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml api/Dockerfile web/Dockerfile web/nginx.conf .env.example secret_patterns.json
git commit -m "feat: add Docker Compose infrastructure with all services"
```

- [ ] **Step 7: Test docker compose config**

```bash
docker compose config
```

Expected: valid YAML output, no errors.

---

## Chunk 2: Config, DB Clients & Embedding Service

This chunk implements the foundational Python modules that all services depend on: configuration, database clients, and the embedding service. After this chunk, the API can connect to all 3 data stores and generate embeddings.

### Task 6: Configuration module (pydantic-settings)

**Files:**
- Create: `api/src/grexis/lib/config.py`
- Test: `api/tests/unit/test_config.py`

- [ ] **Step 1: Write failing test for config loading**

Create `api/tests/unit/test_config.py`:
```python
import os
import pytest
from grexis.lib.config import Settings


def test_settings_loads_defaults():
    settings = Settings(
        POSTGRES_URL="postgresql+asyncpg://user:pass@localhost/db",
        QDRANT_URL="http://localhost:6333",
        REDIS_URL="redis://localhost:6379",
        GREXIS_API_SECRET="test-secret",
    )
    assert settings.EMBEDDING_PROVIDER == "local"
    assert settings.SCHEDULED_AGENT_DAILY_TOKEN_BUDGET == 150000
    assert settings.TRUST_DECAY_DEFAULT_HALF_LIFE_DAYS == 30
    assert settings.SECRET_SCAN_ENABLED is True
    assert settings.SANDBOX_MODE is False


def test_settings_requires_api_secret():
    with pytest.raises(Exception):
        Settings(
            POSTGRES_URL="postgresql+asyncpg://user:pass@localhost/db",
            QDRANT_URL="http://localhost:6333",
            REDIS_URL="redis://localhost:6379",
        )
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api && python -m pytest tests/unit/test_config.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'grexis.lib.config'`

- [ ] **Step 3: Implement config.py**

Create `api/src/grexis/lib/config.py`:
```python
from typing import Literal
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Required
    POSTGRES_URL: str
    QDRANT_URL: str
    REDIS_URL: str
    GREXIS_API_SECRET: str

    # Embedding
    EMBEDDING_PROVIDER: Literal["local", "openai"] = "local"
    OPENAI_API_KEY: str = ""
    CUDA_VISIBLE_DEVICES: str | None = None

    # Scheduled agent
    SCHEDULED_AGENT_DAILY_TOKEN_BUDGET: int = 150000
    SCHEDULED_AGENT_MAX_ATTEMPTS_PER_PROBLEM: int = 3

    # Trust
    TRUST_DECAY_DEFAULT_HALF_LIFE_DAYS: int = 30
    CONSECUTIVE_FAILURE_THRESHOLD: int = 5
    CONFIDENCE_FLOOR_FEEDBACKS: int = 1

    # Secret scanning
    SECRET_SCAN_ENABLED: bool = True

    # Sandbox
    SANDBOX_MODE: bool = False

    model_config = {"env_file": ".env", "extra": "ignore"}


settings: Settings | None = None


def get_settings() -> Settings:
    global settings
    if settings is None:
        settings = Settings()  # type: ignore[call-arg]
    return settings
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd api && python -m pytest tests/unit/test_config.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/grexis/lib/config.py api/tests/unit/test_config.py
git commit -m "feat: add configuration module with pydantic-settings"
```

### Task 7: PostgreSQL client

**Files:**
- Create: `api/src/grexis/db/postgres.py`
- Test: `api/tests/unit/test_postgres.py`

- [ ] **Step 1: Write failing test**

Create `api/tests/unit/test_postgres.py`:
```python
from grexis.db.postgres import PostgresClient


def test_postgres_client_initializes():
    client = PostgresClient.__new__(PostgresClient)
    assert client is not None
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api && python -m pytest tests/unit/test_postgres.py -v
```
Expected: FAIL

- [ ] **Step 3: Implement postgres.py**

Create `api/src/grexis/db/postgres.py`:
```python
import asyncpg
from asyncpg import Pool


class PostgresClient:
    def __init__(self) -> None:
        self._pool: Pool | None = None

    async def connect(self, dsn: str) -> None:
        # asyncpg uses its own DSN format (no +asyncpg prefix)
        clean_dsn = dsn.replace("postgresql+asyncpg://", "postgresql://")
        self._pool = await asyncpg.create_pool(clean_dsn, min_size=2, max_size=10)

    async def close(self) -> None:
        if self._pool:
            await self._pool.close()

    @property
    def pool(self) -> Pool:
        if self._pool is None:
            raise RuntimeError("PostgresClient not connected")
        return self._pool

    async def fetchrow(self, query: str, *args: object) -> asyncpg.Record | None:
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(query, *args)

    async def fetch(self, query: str, *args: object) -> list[asyncpg.Record]:
        async with self.pool.acquire() as conn:
            return await conn.fetch(query, *args)

    async def execute(self, query: str, *args: object) -> str:
        async with self.pool.acquire() as conn:
            return await conn.execute(query, *args)

    async def fetchval(self, query: str, *args: object) -> object:
        async with self.pool.acquire() as conn:
            return await conn.fetchval(query, *args)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd api && python -m pytest tests/unit/test_postgres.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/grexis/db/postgres.py api/tests/unit/test_postgres.py
git commit -m "feat: add async PostgreSQL client (asyncpg)"
```

### Task 8: Qdrant client

**Files:**
- Create: `api/src/grexis/db/qdrant.py`
- Test: `api/tests/unit/test_qdrant.py`

- [ ] **Step 1: Write failing test**

Create `api/tests/unit/test_qdrant.py`:
```python
from grexis.db.qdrant import QdrantClient as GQdrantClient, SOLUTIONS_COLLECTION, PROBLEMS_COLLECTION


def test_collection_names():
    assert SOLUTIONS_COLLECTION == "solutions"
    assert PROBLEMS_COLLECTION == "problems"


def test_qdrant_client_initializes():
    client = GQdrantClient.__new__(GQdrantClient)
    assert client is not None
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api && python -m pytest tests/unit/test_qdrant.py -v
```
Expected: FAIL

- [ ] **Step 3: Implement qdrant.py**

Create `api/src/grexis/db/qdrant.py`:
```python
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance,
    Filter,
    PointStruct,
    SearchParams,
    VectorParams,
)

SOLUTIONS_COLLECTION = "solutions"
PROBLEMS_COLLECTION = "problems"


class QdrantClient:
    def __init__(self) -> None:
        self._client: AsyncQdrantClient | None = None

    async def connect(self, url: str) -> None:
        self._client = AsyncQdrantClient(url=url)

    async def close(self) -> None:
        if self._client:
            await self._client.close()

    @property
    def client(self) -> AsyncQdrantClient:
        if self._client is None:
            raise RuntimeError("QdrantClient not connected")
        return self._client

    async def ensure_collections(self, vector_size: int = 1024) -> None:
        for name, segments in [(SOLUTIONS_COLLECTION, 4), (PROBLEMS_COLLECTION, 2)]:
            collections = await self.client.get_collections()
            exists = any(c.name == name for c in collections.collections)
            if not exists:
                await self.client.create_collection(
                    collection_name=name,
                    vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
                    optimizers_config={"default_segment_number": segments},
                    replication_factor=1,
                )
        # Create payload indexes for hard filtering (Tech Spec Section 5.2)
        solution_indexes = [
            ("framework", "keyword"), ("framework_version", "keyword"),
            ("runtime", "keyword"), ("llm", "keyword"), ("error_type", "keyword"),
            ("severity", "keyword"), ("status", "keyword"), ("source", "keyword"),
            ("confidence_score", "float"), ("success_rate", "float"),
            ("last_validated_at", "integer"),
        ]
        for field, schema in solution_indexes:
            await self.client.create_payload_index(
                SOLUTIONS_COLLECTION, field, field_schema=schema
            )
        problem_indexes = [
            ("framework", "keyword"), ("error_type", "keyword"),
            ("status", "keyword"), ("severity", "keyword"),
            ("duplicate_count", "integer"),
        ]
        for field, schema in problem_indexes:
            await self.client.create_payload_index(
                PROBLEMS_COLLECTION, field, field_schema=schema
            )

    async def upsert_point(
        self, collection: str, point_id: str, vector: list[float], payload: dict
    ) -> None:
        await self.client.upsert(
            collection_name=collection,
            points=[PointStruct(id=point_id, vector=vector, payload=payload)],
        )

    async def search(
        self,
        collection: str,
        vector: list[float],
        filter_: Filter | None = None,
        limit: int = 10,
        score_threshold: float | None = None,
    ) -> list:
        return await self.client.search(
            collection_name=collection,
            query_vector=vector,
            query_filter=filter_,
            limit=limit,
            score_threshold=score_threshold,
            search_params=SearchParams(exact=False, hnsw_ef=128),
        )

    async def delete_point(self, collection: str, point_id: str) -> None:
        await self.client.delete(
            collection_name=collection,
            points_selector=[point_id],
        )
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd api && python -m pytest tests/unit/test_qdrant.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/grexis/db/qdrant.py api/tests/unit/test_qdrant.py
git commit -m "feat: add async Qdrant client with collection management"
```

### Task 9: Redis client

**Files:**
- Create: `api/src/grexis/db/redis.py`
- Test: `api/tests/unit/test_redis.py`

- [ ] **Step 1: Write failing test**

Create `api/tests/unit/test_redis.py`:
```python
from grexis.db.redis import RedisClient


def test_redis_client_initializes():
    client = RedisClient.__new__(RedisClient)
    assert client is not None
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api && python -m pytest tests/unit/test_redis.py -v
```
Expected: FAIL

- [ ] **Step 3: Implement redis.py**

Create `api/src/grexis/db/redis.py`:
```python
from redis.asyncio import Redis


class RedisClient:
    def __init__(self) -> None:
        self._client: Redis | None = None

    async def connect(self, url: str) -> None:
        self._client = Redis.from_url(url, decode_responses=True)

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()

    @property
    def client(self) -> Redis:
        if self._client is None:
            raise RuntimeError("RedisClient not connected")
        return self._client

    # Rate limiting helpers
    async def check_rate_limit(self, key: str, limit: int, window_seconds: int) -> bool:
        pipe = self._client.pipeline()  # type: ignore[union-attr]
        pipe.incr(key)
        pipe.expire(key, window_seconds)
        results = await pipe.execute()
        return int(results[0]) <= limit

    # Cache helpers
    async def get_cached(self, key: str) -> str | None:
        return await self.client.get(key)

    async def set_cached(self, key: str, value: str, ttl: int) -> None:
        await self.client.setex(key, ttl, value)

    # Budget helpers
    async def get_counter(self, key: str) -> int:
        val = await self.client.get(key)
        return int(val) if val else 0

    async def increment_counter(self, key: str, ttl: int | None = None) -> int:
        val = await self.client.incr(key)
        if ttl and val == 1:
            await self.client.expire(key, ttl)
        return int(val)

    # Hash helpers (for rep:{token_hash})
    async def hgetall(self, key: str) -> dict[str, str]:
        return await self.client.hgetall(key)  # type: ignore[return-value]

    async def hmset(self, key: str, mapping: dict[str, str]) -> None:
        await self.client.hset(key, mapping=mapping)  # type: ignore[arg-type]

    # Diversity factor cache
    async def get_diversity_factor(self, solution_id: str) -> float | None:
        val = await self.client.get(f"diversity:{solution_id}")
        return float(val) if val else None

    async def set_diversity_factor(self, solution_id: str, factor: float) -> None:
        await self.client.setex(f"diversity:{solution_id}", 900, str(factor))
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd api && python -m pytest tests/unit/test_redis.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/grexis/db/redis.py api/tests/unit/test_redis.py
git commit -m "feat: add async Redis client with rate-limit and cache helpers"
```

### Task 10: Embedding service

**Files:**
- Create: `api/src/grexis/lib/embed.py`
- Test: `api/tests/unit/test_embed.py`

- [ ] **Step 1: Write failing test**

Create `api/tests/unit/test_embed.py`:
```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from grexis.lib.embed import EmbeddingService


def test_embedding_service_initializes():
    service = EmbeddingService.__new__(EmbeddingService)
    assert service is not None


@pytest.mark.asyncio
async def test_embed_returns_vector():
    service = EmbeddingService.__new__(EmbeddingService)
    service._provider = "local"
    service._session = MagicMock()
    service._tokenizer = MagicMock()

    # Mock tokenizer
    service._tokenizer.return_value = {"input_ids": [[1, 2, 3]], "attention_mask": [[1, 1, 1]]}

    # Mock ONNX session
    import numpy as np
    mock_output = np.random.rand(1, 3, 1024).astype(np.float32)
    service._session.run.return_value = [mock_output]

    result = await service.embed("test text")
    assert len(result) == 1024
    assert all(isinstance(v, float) for v in result)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api && python -m pytest tests/unit/test_embed.py -v
```
Expected: FAIL

- [ ] **Step 3: Implement embed.py**

Create `api/src/grexis/lib/embed.py`:
```python
import logging
import numpy as np

logger = logging.getLogger(__name__)

VECTOR_SIZE_LOCAL = 1024
VECTOR_SIZE_OPENAI = 1536


class EmbeddingService:
    def __init__(self) -> None:
        self._provider: str = "local"
        self._session = None
        self._tokenizer = None
        self._openai_client = None

    async def initialize(self, provider: str = "local", model_path: str = "/models/bge-m3", openai_key: str = "") -> None:
        self._provider = provider

        if provider == "local":
            self._init_local(model_path)
        elif provider == "openai":
            self._init_openai(openai_key)
        else:
            raise ValueError(f"Unknown embedding provider: {provider}")

    def _init_local(self, model_path: str) -> None:
        import onnxruntime as ort
        from transformers import AutoTokenizer

        providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
        self._session = ort.InferenceSession(
            f"{model_path}/model.onnx", providers=providers
        )
        active = self._session.get_providers()
        logger.info(f"ONNX providers: {active}")

        self._tokenizer = AutoTokenizer.from_pretrained(model_path)

    def _init_openai(self, api_key: str) -> None:
        from openai import AsyncOpenAI

        self._openai_client = AsyncOpenAI(api_key=api_key)

    @property
    def vector_size(self) -> int:
        return VECTOR_SIZE_LOCAL if self._provider == "local" else VECTOR_SIZE_OPENAI

    async def embed(self, text: str) -> list[float]:
        if self._provider == "local":
            return await self._embed_local(text)
        return await self._embed_openai(text)

    async def _embed_local(self, text: str) -> list[float]:
        inputs = self._tokenizer(
            text, padding=True, truncation=True, max_length=512, return_tensors="np"
        )
        outputs = self._session.run(
            None,
            {
                "input_ids": inputs["input_ids"].astype(np.int64),
                "attention_mask": inputs["attention_mask"].astype(np.int64),
            },
        )
        # Mean pooling over token dimension
        token_embeddings = outputs[0]  # (batch, seq_len, hidden_dim)
        attention_mask = inputs["attention_mask"]
        mask_expanded = np.expand_dims(attention_mask, -1)
        summed = np.sum(token_embeddings * mask_expanded, axis=1)
        counts = np.clip(np.sum(mask_expanded, axis=1), a_min=1e-9, a_max=None)
        pooled = summed / counts
        # Normalize
        norm = np.linalg.norm(pooled, axis=1, keepdims=True)
        normalized = pooled / np.clip(norm, a_min=1e-9, a_max=None)
        return normalized[0].tolist()

    async def _embed_openai(self, text: str) -> list[float]:
        response = await self._openai_client.embeddings.create(
            model="text-embedding-3-small",
            input=text,
        )
        return response.data[0].embedding
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd api && python -m pytest tests/unit/test_embed.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/grexis/lib/embed.py api/tests/unit/test_embed.py
git commit -m "feat: add embedding service with ONNX/CUDA local + OpenAI fallback"
```

### Task 11: Audit log writer

**Files:**
- Create: `api/src/grexis/lib/audit.py`
- Test: `api/tests/unit/test_audit.py`

- [ ] **Step 1: Write failing test**

Create `api/tests/unit/test_audit.py`:
```python
import hashlib
import json
from grexis.lib.audit import compute_payload_hash


def test_compute_payload_hash():
    payload = {"key": "value"}
    expected = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    assert compute_payload_hash(payload) == expected
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api && python -m pytest tests/unit/test_audit.py -v
```
Expected: FAIL

- [ ] **Step 3: Implement audit.py**

Create `api/src/grexis/lib/audit.py`:
```python
import hashlib
import json
from grexis.db.postgres import PostgresClient


def compute_payload_hash(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


async def log_to_audit(
    db: PostgresClient,
    actor_type: str,
    actor_id_hash: str,
    action: str,
    target_id: str | None = None,
    payload: dict | None = None,
    reason: str | None = None,
) -> None:
    payload_hash = compute_payload_hash(payload or {})
    await db.execute(
        """
        INSERT INTO grexis.audit_log (actor_type, actor_id_hash, action, target_id, payload_hash, reason)
        VALUES ($1, $2, $3, $4, $5, $6)
        """,
        actor_type,
        actor_id_hash,
        action,
        target_id,
        payload_hash,
        reason,
    )
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd api && python -m pytest tests/unit/test_audit.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/grexis/lib/audit.py api/tests/unit/test_audit.py
git commit -m "feat: add audit log writer with payload hashing"
```

---

## Chunk 3: Core Services

This chunk implements the core business logic services: token management, secret scanning, edge constraints, duplicate detection, trust scoring, and the search pipeline.

### Task 12: Agent token service

**Files:**
- Create: `api/src/grexis/services/tokens.py`
- Test: `api/tests/unit/test_tokens.py`

- [ ] **Step 1: Write failing test**

Create `api/tests/unit/test_tokens.py`:
```python
import hashlib
from grexis.services.tokens import hash_token


def test_hash_token():
    raw = "test-token-123"
    expected = hashlib.sha256(raw.encode()).hexdigest()
    assert hash_token(raw) == expected
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api && python -m pytest tests/unit/test_tokens.py -v
```
Expected: FAIL

- [ ] **Step 3: Implement tokens.py**

Create `api/src/grexis/services/tokens.py` with:
- `hash_token(raw: str) -> str` — SHA-256
- `resolve_agent_token(db, redis, agent_token) -> AgentToken | None` — from Tech Spec Section 15 token resolution flow
- `create_token_record(db, token_hash) -> None`
- `AgentToken` dataclass with `hash`, `tier`, `multiplier` fields

Full implementation per Tech Spec Section 15 (token resolution pseudocode).

- [ ] **Step 4: Run test to verify it passes**

```bash
cd api && python -m pytest tests/unit/test_tokens.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/grexis/services/tokens.py api/tests/unit/test_tokens.py
git commit -m "feat: add agent token service with Redis-cached resolution"
```

### Task 13: Secret scanner

**Files:**
- Create: `api/src/grexis/services/scanner.py`
- Test: `api/tests/unit/test_scanner.py`

- [ ] **Step 1: Write failing tests**

Create `api/tests/unit/test_scanner.py`:
```python
from grexis.services.scanner import scan_for_secrets, ScanResult


def test_detects_aws_key():
    payload = {"details": "Error with AKIAIOSFODNN7EXAMPLE key"}
    result = scan_for_secrets(payload)
    assert result.detected is True
    assert result.error_code == "SENSITIVE_DATA_DETECTED"


def test_detects_openai_key():
    payload = {"details": "Using sk-abcdefghijklmnopqrstuvwxyz123456"}
    result = scan_for_secrets(payload)
    assert result.detected is True


def test_detects_github_pat():
    payload = {"details": "Token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh"}
    result = scan_for_secrets(payload)
    assert result.detected is True


def test_clean_payload_passes():
    payload = {"error_type": "RateLimitError", "details": "Too many requests"}
    result = scan_for_secrets(payload)
    assert result.detected is False


def test_detects_jwt():
    jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
    payload = {"details": jwt}
    result = scan_for_secrets(payload)
    assert result.detected is True
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd api && python -m pytest tests/unit/test_scanner.py -v
```
Expected: FAIL

- [ ] **Step 3: Implement scanner.py**

Create `api/src/grexis/services/scanner.py` — copy `SECRET_PATTERNS`, `scan_for_secrets`, `apply_secret_scan_policy`, and `redact` from Tech Spec Section 11 verbatim. Add `ScanResult` and `ScanResponse` dataclasses.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd api && python -m pytest tests/unit/test_scanner.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/grexis/services/scanner.py api/tests/unit/test_scanner.py
git commit -m "feat: add secret scanner middleware with warning mode"
```

### Task 14: Edge constraint enforcement

**Files:**
- Create: `api/src/grexis/services/edges.py`
- Test: `api/tests/unit/test_edges.py`

- [ ] **Step 1: Write failing tests**

Create `api/tests/unit/test_edges.py`:
```python
import pytest
from grexis.services.edges import validate_edge, ValidationError, EDGE_CONSTRAINTS


def test_valid_solution_resolves_problem():
    validate_edge("solution_resolves_problem", "solution", "problem")


def test_valid_feedback_on_solution():
    validate_edge("feedback_on_solution", "feedback", "solution")


def test_invalid_edge_type():
    with pytest.raises(ValidationError, match="Unknown edge type"):
        validate_edge("nonexistent_edge", "solution", "problem")


def test_wrong_node_types():
    with pytest.raises(ValidationError, match="Invalid edge"):
        validate_edge("solution_resolves_problem", "problem", "solution")


def test_all_edge_types_defined():
    assert len(EDGE_CONSTRAINTS) == 5
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd api && python -m pytest tests/unit/test_edges.py -v
```
Expected: FAIL

- [ ] **Step 3: Implement edges.py**

Create `api/src/grexis/services/edges.py` — copy `EDGE_CONSTRAINTS` and `validate_edge` from Tech Spec Section 8 verbatim. Add `create_edge` function that validates then inserts into `grexis.resolution_edges`.

```python
class ValidationError(Exception):
    pass


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
            f"Invalid edge: {edge_type} requires {constraint['source']} -> {constraint['target']}, "
            f"got {source_type} -> {target_type}"
        )


async def create_edge(
    db,
    edge_type: str,
    source_node_id: str,
    source_node_type: str,
    target_node_id: str,
    target_node_type: str,
) -> str:
    validate_edge(edge_type, source_node_type, target_node_type)
    record = await db.fetchrow(
        """
        INSERT INTO grexis.resolution_edges (source_node_id, source_node_type, target_node_id, target_node_type, edge_type)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
        """,
        source_node_id,
        source_node_type,
        target_node_id,
        target_node_type,
        edge_type,
    )
    return str(record["id"])
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd api && python -m pytest tests/unit/test_edges.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/grexis/services/edges.py api/tests/unit/test_edges.py
git commit -m "feat: add edge constraint enforcement with 5 edge types"
```

### Task 15: Duplicate problem detection

**Files:**
- Create: `api/src/grexis/services/duplicates.py`
- Test: `api/tests/unit/test_duplicates.py`

- [ ] **Step 1: Write failing test**

Create `api/tests/unit/test_duplicates.py`:
```python
from grexis.services.duplicates import build_duplicate_filter


def test_build_duplicate_filter():
    filter_dict = build_duplicate_filter(framework="langchain", error_type="RateLimitError")
    assert filter_dict["must"][0]["key"] == "framework"
    assert filter_dict["must"][1]["key"] == "error_type"
    assert filter_dict["must"][2]["key"] == "status"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd api && python -m pytest tests/unit/test_duplicates.py -v
```
Expected: FAIL

- [ ] **Step 3: Implement duplicates.py**

Create `api/src/grexis/services/duplicates.py` — implement `build_duplicate_filter`, `find_duplicate_problem`, and `handle_submit_problem` from Tech Spec Section 9. The duplicate threshold is 0.92 cosine similarity.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd api && python -m pytest tests/unit/test_duplicates.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/grexis/services/duplicates.py api/tests/unit/test_duplicates.py
git commit -m "feat: add duplicate problem detection (0.92 cosine threshold)"
```

### Task 16: Trust score computation

**Files:**
- Create: `api/src/grexis/services/trust.py`
- Test: `api/tests/unit/test_trust.py`

- [ ] **Step 1: Write failing tests**

Create `api/tests/unit/test_trust.py`:
```python
import pytest
from unittest.mock import AsyncMock
from grexis.services.trust import compute_base_score, compute_delta_sum


def test_base_score_registered():
    assert compute_base_score("registered") == pytest.approx(0.36, abs=0.01)


def test_base_score_token_only():
    assert compute_base_score("token_only") == pytest.approx(0.30, abs=0.01)


def test_base_score_anonymous():
    assert compute_base_score("anonymous") == pytest.approx(0.21, abs=0.01)


def test_delta_sum_success():
    assert compute_delta_sum(["success"]) == pytest.approx(0.15)


def test_delta_sum_mixed():
    assert compute_delta_sum(["success", "failure", "partial"]) == pytest.approx(0.09, abs=0.01)


def test_delta_sum_empty():
    assert compute_delta_sum([]) == 0.0
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd api && python -m pytest tests/unit/test_trust.py -v
```
Expected: FAIL

- [ ] **Step 3: Implement trust.py**

Create `api/src/grexis/services/trust.py` — implement from Tech Spec Section 7:
- `compute_base_score(tier: str) -> float`
- `compute_delta_sum(outcomes: list[str]) -> float`
- `compute_confidence_score(solution, feedbacks, redis_client, config) -> float` — full formula with time decay, diversity bonus (from Redis cache), age bonus
- `handle_consecutive_failures(db, redis, solution_id, config) -> None`

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd api && python -m pytest tests/unit/test_trust.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/grexis/services/trust.py api/tests/unit/test_trust.py
git commit -m "feat: add trust score computation with decay and diversity bonus"
```

### Task 17: Search pipeline

**Files:**
- Create: `api/src/grexis/services/search.py`
- Test: `api/tests/unit/test_search.py`

- [ ] **Step 1: Write failing tests**

Create `api/tests/unit/test_search.py`:
```python
from grexis.services.search import build_hard_filter, compute_env_match_score


def test_hard_filter_same_framework():
    result = build_hard_filter(framework="langchain", cross_framework=False)
    assert len(result["must"]) == 2
    assert result["must"][0]["key"] == "status"
    assert result["must"][1]["key"] == "framework"


def test_hard_filter_cross_framework():
    result = build_hard_filter(framework="langchain", cross_framework=True)
    assert len(result["must"]) == 1
    assert result["must"][0]["key"] == "status"


def test_env_match_exact():
    payload = {"llm": "claude", "framework": "langchain", "framework_version": "0.3.1", "runtime": "python-3.11"}
    score = compute_env_match_score(payload, llm="claude", framework="langchain", framework_version="0.3.1", runtime="python-3.11")
    assert score == 1.0


def test_env_match_minor_version():
    payload = {"llm": "claude", "framework": "langchain", "framework_version": "0.3.2", "runtime": "python-3.11"}
    score = compute_env_match_score(payload, llm="claude", framework="langchain", framework_version="0.3.1", runtime="python-3.11")
    assert score == 0.8
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd api && python -m pytest tests/unit/test_search.py -v
```
Expected: FAIL

- [ ] **Step 3: Implement search.py**

Create `api/src/grexis/services/search.py` — implement from Tech Spec Section 10:
- `build_hard_filter(framework, cross_framework) -> dict`
- `compute_env_match_score(payload, llm, framework, framework_version, runtime, cross_framework) -> float`
- `compute_structural_match(payload, failure_sig) -> float`
- `compute_recency_boost(last_validated_at) -> float`
- `rank_results(results, query, config) -> list[RankedSolution]`
- `search_solutions(qdrant, embed_service, db, redis, query, config) -> list[RankedSolution]`

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd api && python -m pytest tests/unit/test_search.py -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/src/grexis/services/search.py api/tests/unit/test_search.py
git commit -m "feat: add search pipeline with hard filter + semantic ranking"
```

### Task 18: Federation service

**Files:**
- Create: `api/src/grexis/services/federation.py`
- Test: `api/tests/unit/test_federation.py`

- [ ] **Step 1: Write failing test**

Create `api/tests/unit/test_federation.py`:
```python
from grexis.services.federation import FEDERATED_SOURCE_WEIGHT


def test_federated_source_weight():
    assert FEDERATED_SOURCE_WEIGHT == 0.8
```

- [ ] **Step 2: Run test, implement, verify**

Implement `api/src/grexis/services/federation.py` with `ingest_federated_solution` from Tech Spec Section 13.

- [ ] **Step 3: Commit**

```bash
git add api/src/grexis/services/federation.py api/tests/unit/test_federation.py
git commit -m "feat: add federation service with 0.8x source weight"
```

---

## Chunk 4: MCP Server & FastAPI App

This chunk wires up the FastAPI application with lifecycle management, MCP tool handlers, and health endpoints. After this chunk, the API starts, connects to all stores, and serves 5 MCP tools + health endpoints.

### Task 19: FastAPI app lifecycle

**Files:**
- Modify: `api/src/grexis/main.py`
- Create: `api/src/grexis/deps.py`

- [ ] **Step 1: Implement deps.py — dependency injection container**

Create `api/src/grexis/deps.py`:
```python
from grexis.db.postgres import PostgresClient
from grexis.db.qdrant import QdrantClient
from grexis.db.redis import RedisClient
from grexis.lib.embed import EmbeddingService
from grexis.lib.config import Settings

postgres = PostgresClient()
qdrant = QdrantClient()
redis = RedisClient()
embed_service = EmbeddingService()
```

- [ ] **Step 2: Rewrite main.py with lifespan**

Rewrite `api/src/grexis/main.py`:
```python
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from grexis.lib.config import get_settings
from grexis import deps

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()

    # Connect to data stores
    await deps.postgres.connect(settings.POSTGRES_URL)
    await deps.qdrant.connect(settings.QDRANT_URL)
    await deps.redis.connect(settings.REDIS_URL)

    # Initialize embedding service FIRST (needed for vector_size)
    await deps.embed_service.initialize(
        provider=settings.EMBEDDING_PROVIDER,
        openai_key=settings.OPENAI_API_KEY,
    )

    # Ensure Qdrant collections exist with correct vector dimensions
    await deps.qdrant.ensure_collections(deps.embed_service.vector_size)

    logger.info("GREXIS API started")
    yield

    # Shutdown
    await deps.postgres.close()
    await deps.qdrant.close()
    await deps.redis.close()
    logger.info("GREXIS API stopped")


app = FastAPI(title="GREXIS", version="0.3.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.3.0"}


@app.get("/ready")
async def ready():
    try:
        await deps.postgres.fetchval("SELECT 1")
        await deps.redis.client.ping()
        # Qdrant health is checked via collection list
        await deps.qdrant.client.get_collections()
        return {"status": "ready"}
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=503, content={"status": "not ready", "error": str(e)})
```

- [ ] **Step 3: Commit**

```bash
git add api/src/grexis/main.py api/src/grexis/deps.py
git commit -m "feat: add FastAPI app with lifespan, CORS, health/ready endpoints"
```

### Task 20: MCP server registration

**Files:**
- Create: `api/src/grexis/mcp/server.py`

- [ ] **Step 1: Implement MCP server**

Create `api/src/grexis/mcp/server.py`:
```python
from mcp.server import Server
from mcp.types import Tool, TextContent

server = Server("grexis")

FAILURE_SIG_SCHEMA = {
    "type": "object",
    "properties": {
        "error_type": {"type": "string"},
        "error_code": {"type": "string"},
        "tool_name": {"type": "string"},
        "operation": {"type": "string"},
        "severity": {"type": "string", "enum": ["blocking", "degraded", "cosmetic"]},
        "details": {"type": "string"},
    },
    "required": ["error_type"],
}

ENV_SCHEMA = {
    "type": "object",
    "properties": {
        "llm": {"type": "string"},
        "framework": {"type": "string"},
        "framework_version": {"type": "string"},
        "runtime": {"type": "string"},
    },
    "required": ["llm", "framework", "framework_version", "runtime"],
}


def get_mcp_tools() -> list[Tool]:
    return [
        Tool(
            name="query_solutions",
            description="Search for solutions to a failure signature in the GREXIS resolution graph",
            inputSchema={
                "type": "object",
                "properties": {
                    "failure_signature": FAILURE_SIG_SCHEMA,
                    "execution_context": {"type": "object"},
                    "goal_state": {"type": "string"},
                    "environment": ENV_SCHEMA,
                    "agent_token": {"type": "string"},
                    "cross_framework": {"type": "boolean", "default": False},
                },
                "required": ["failure_signature", "goal_state", "environment"],
            },
        ),
        Tool(
            name="submit_problem",
            description="Submit a new problem that an agent encountered",
            inputSchema={
                "type": "object",
                "properties": {
                    "failure_signature": FAILURE_SIG_SCHEMA,
                    "execution_context": {"type": "object"},
                    "goal_state": {"type": "string"},
                    "environment": ENV_SCHEMA,
                    "agent_token": {"type": "string"},
                },
                "required": ["failure_signature", "goal_state", "environment"],
            },
        ),
        Tool(
            name="submit_solution",
            description="Submit a solution that resolved a problem",
            inputSchema={
                "type": "object",
                "properties": {
                    "problem": {
                        "type": "object",
                        "properties": {
                            "failure_signature": FAILURE_SIG_SCHEMA,
                            "goal_state": {"type": "string"},
                            "environment": ENV_SCHEMA,
                        },
                        "required": ["failure_signature", "goal_state", "environment"],
                    },
                    "resolution": {
                        "type": "object",
                        "properties": {
                            "solution_steps": {"type": "array", "items": {"type": "string"}},
                            "solution_summary": {"type": "string"},
                            "confidence": {"type": "string", "enum": ["empirical", "inferred"]},
                            "attempts_before_success": {"type": "integer"},
                            "time_to_resolution_ms": {"type": "integer"},
                        },
                        "required": ["solution_steps", "solution_summary", "confidence"],
                    },
                    "agent_token": {"type": "string"},
                    "session_id": {"type": "string"},
                },
                "required": ["problem", "resolution"],
            },
        ),
        Tool(
            name="submit_feedback",
            description="Submit feedback on whether a solution worked",
            inputSchema={
                "type": "object",
                "properties": {
                    "solution_id": {"type": "string", "format": "uuid"},
                    "outcome": {"type": "string", "enum": ["success", "failure", "partial"]},
                    "comment": {"type": "string"},
                    "environment": ENV_SCHEMA,
                    "agent_token": {"type": "string"},
                },
                "required": ["solution_id", "outcome", "environment"],
            },
        ),
        Tool(
            name="register_agent",
            description="Register an agent token with metadata for higher rate limits",
            inputSchema={
                "type": "object",
                "properties": {
                    "agent_token": {"type": "string"},
                    "agent_description": {"type": "string"},
                    "human_operator_email": {"type": "string"},
                    "framework": {"type": "string"},
                },
                "required": ["agent_token"],
            },
        ),
    ]
```

- [ ] **Step 2: Commit**

```bash
git add api/src/grexis/mcp/server.py
git commit -m "feat: add MCP server with 5 tool definitions"
```

### Task 21: MCP tool handlers

**Files:**
- Create: `api/src/grexis/mcp/query_solutions.py`
- Create: `api/src/grexis/mcp/submit_problem.py`
- Create: `api/src/grexis/mcp/submit_solution.py`
- Create: `api/src/grexis/mcp/submit_feedback.py`
- Create: `api/src/grexis/mcp/register_agent.py`
- Test: `api/tests/unit/test_mcp_tools.py`

Each handler follows the same pattern:
1. Resolve agent token (via `services.tokens`)
2. Check rate limit (via Redis)
3. Run secret scanner on payload (via `services.scanner`)
4. Execute business logic (via relevant services)
5. Log to audit trail
6. Return MCP-compliant response

- [ ] **Step 1: Write tests for MCP handlers**

Create `api/tests/unit/test_mcp_tools.py`:
```python
import pytest
from unittest.mock import AsyncMock, MagicMock
from grexis.mcp.query_solutions import handle_query_solutions
from grexis.mcp.submit_problem import handle_submit_problem
from grexis.mcp.submit_solution import handle_submit_solution
from grexis.mcp.submit_feedback import handle_submit_feedback
from grexis.mcp.register_agent import handle_register_agent


def test_all_handlers_callable():
    assert callable(handle_query_solutions)
    assert callable(handle_submit_problem)
    assert callable(handle_submit_solution)
    assert callable(handle_submit_feedback)
    assert callable(handle_register_agent)


@pytest.mark.asyncio
async def test_query_solutions_returns_list():
    mock_deps = MagicMock()
    mock_deps.embed_service.embed = AsyncMock(return_value=[0.1] * 1024)
    mock_deps.qdrant.search = AsyncMock(return_value=[])
    mock_deps.redis = AsyncMock()
    mock_deps.postgres = AsyncMock()

    result = await handle_query_solutions(
        deps=mock_deps,
        failure_signature={"error_type": "RateLimitError", "details": "test"},
        goal_state="test goal",
        environment={"llm": "claude", "framework": "langchain", "framework_version": "0.3.1", "runtime": "python-3.11"},
    )
    assert isinstance(result, list)


@pytest.mark.asyncio
async def test_submit_feedback_recomputes_trust():
    mock_deps = MagicMock()
    mock_deps.postgres.fetchrow = AsyncMock(return_value={"id": "test-id", "agent_token_hash": "hash"})
    mock_deps.postgres.fetch = AsyncMock(return_value=[])
    mock_deps.postgres.execute = AsyncMock()
    mock_deps.redis = AsyncMock()
    mock_deps.redis.get_diversity_factor = AsyncMock(return_value=0.5)

    result = await handle_submit_feedback(
        deps=mock_deps,
        solution_id="test-uuid",
        outcome="success",
        environment={"llm": "claude", "framework": "langchain", "framework_version": "0.3.1", "runtime": "python-3.11"},
    )
    # Should have called execute to update confidence_score
    assert mock_deps.postgres.execute.called
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd api && python -m pytest tests/unit/test_mcp_tools.py -v
```
Expected: FAIL — modules don't exist yet

- [ ] **Step 3: Implement query_solutions.py**

Create `api/src/grexis/mcp/query_solutions.py`:
```python
import json
from grexis.services.tokens import resolve_agent_token
from grexis.services.search import search_solutions, build_hard_filter, rank_results
from grexis.lib.audit import log_to_audit


async def handle_query_solutions(
    deps,
    failure_signature: dict,
    goal_state: str,
    environment: dict,
    agent_token: str | None = None,
    cross_framework: bool = False,
    execution_context: dict | None = None,
) -> list[dict]:
    token = await resolve_agent_token(deps.postgres, deps.redis, agent_token)

    # Rate limit check
    tier = token.tier if token else "anonymous"
    rl_key = f"rl:token:{token.hash}" if token else f"rl:anon:{hash(str(environment))}"
    # Rate limits loaded from settings or config

    # Embed query
    embed_text = f"{failure_signature.get('error_type', '')} {failure_signature.get('details', '')} {goal_state}"
    query_vector = await deps.embed_service.embed(embed_text)

    # Search
    hard_filter = build_hard_filter(framework=environment["framework"], cross_framework=cross_framework)
    results = await deps.qdrant.search(
        collection="solutions",
        vector=query_vector,
        filter_=hard_filter,
        limit=20,
    )

    # Rank
    ranked = rank_results(results, failure_signature, environment, cross_framework)

    await log_to_audit(deps.postgres, "agent", token.hash if token else "anonymous", "query_solutions", payload=failure_signature)

    return [{"solution_id": r.payload["postgres_id"], "rank_score": r.rank_score, "summary": r.payload.get("solution_summary", "")} for r in ranked[:10]]
```

- [ ] **Step 4: Implement submit_problem.py**

Create `api/src/grexis/mcp/submit_problem.py`:
```python
from grexis.services.tokens import resolve_agent_token
from grexis.services.scanner import scan_for_secrets, apply_secret_scan_policy
from grexis.services.duplicates import find_duplicate_problem, handle_submit_problem as do_submit
from grexis.lib.audit import log_to_audit


async def handle_submit_problem(
    deps,
    failure_signature: dict,
    goal_state: str,
    environment: dict,
    agent_token: str | None = None,
    execution_context: dict | None = None,
) -> dict:
    token = await resolve_agent_token(deps.postgres, deps.redis, agent_token)

    # Secret scan
    scan = scan_for_secrets({**failure_signature, "goal_state": goal_state})
    if scan.detected:
        policy = await apply_secret_scan_policy(token, scan, deps.postgres)
        if policy.action == "reject":
            return {"error": "SENSITIVE_DATA_DETECTED", "hint": scan.redacted_hint}

    result = await do_submit(
        db=deps.postgres,
        qdrant=deps.qdrant,
        embed_service=deps.embed_service,
        failure_signature=failure_signature,
        goal_state=goal_state,
        environment=environment,
        execution_context=execution_context,
        token_hash=token.hash if token else None,
    )

    await log_to_audit(deps.postgres, "agent", token.hash if token else "anonymous", "submit_problem", target_id=result["problem_id"])
    return result
```

- [ ] **Step 5: Implement submit_solution.py**

Create `api/src/grexis/mcp/submit_solution.py`:
```python
import uuid
from grexis.services.tokens import resolve_agent_token
from grexis.services.scanner import scan_for_secrets, apply_secret_scan_policy
from grexis.services.edges import create_edge
from grexis.lib.audit import log_to_audit


async def handle_submit_solution(
    deps,
    problem: dict,
    resolution: dict,
    agent_token: str | None = None,
    session_id: str | None = None,
) -> dict:
    token = await resolve_agent_token(deps.postgres, deps.redis, agent_token)

    # Secret scan on both problem and resolution
    full_payload = {**problem, **resolution}
    scan = scan_for_secrets(full_payload)
    if scan.detected:
        policy = await apply_secret_scan_policy(token, scan, deps.postgres)
        if policy.action == "reject":
            return {"error": "SENSITIVE_DATA_DETECTED", "hint": scan.redacted_hint}

    env = problem["environment"]
    sig = problem["failure_signature"]
    qdrant_point_id = str(uuid.uuid4())

    # 1. Write to Postgres (source of truth)
    record = await deps.postgres.fetchrow("""
        INSERT INTO grexis.solutions (
            error_type, error_code, tool_name, operation, severity,
            details_summary, goal_state, llm, framework, framework_version,
            runtime, solution_steps, solution_summary, source, confidence_type,
            agent_token_hash, qdrant_point_id, status, confidence_score
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        RETURNING id
    """,
        sig.get("error_type"), sig.get("error_code"), sig.get("tool_name"),
        sig.get("operation"), sig.get("severity"), sig.get("details"),
        problem["goal_state"], env["llm"], env["framework"], env["framework_version"],
        env["runtime"], resolution["solution_steps"], resolution["solution_summary"],
        "agent_contributed", resolution.get("confidence", "empirical"),
        token.hash if token else None, qdrant_point_id, "pending_review", 0.3,
    )
    solution_id = str(record["id"])

    # 2. Index in Qdrant (dual-write)
    embed_text = f"{sig.get('error_type','')} {sig.get('details','')} {problem['goal_state']} {resolution['solution_summary']}"
    vector = await deps.embed_service.embed(embed_text)
    try:
        await deps.qdrant.upsert_point("solutions", qdrant_point_id, vector, {
            "postgres_id": solution_id, "framework": env["framework"],
            "framework_version": env["framework_version"], "runtime": env["runtime"],
            "llm": env["llm"], "error_type": sig.get("error_type"),
            "severity": sig.get("severity"), "status": "pending_review",
            "source": "agent_contributed", "confidence_score": 0.3,
            "success_rate": 0.0, "attempt_count": 0, "last_validated_at": 0,
        })
    except Exception:
        await deps.postgres.execute(
            "UPDATE grexis.solutions SET status = 'pending_index' WHERE id = $1", record["id"]
        )

    # 3. Create edge
    await create_edge(deps.postgres, "solution_resolves_problem", solution_id, "solution", solution_id, "problem")

    await log_to_audit(deps.postgres, "agent", token.hash if token else "anonymous", "submit_solution", target_id=solution_id)
    return {"solution_id": solution_id}
```

- [ ] **Step 6: Implement submit_feedback.py**

Create `api/src/grexis/mcp/submit_feedback.py`:
```python
from grexis.services.tokens import resolve_agent_token
from grexis.services.edges import create_edge
from grexis.services.trust import compute_confidence_score, handle_consecutive_failures
from grexis.lib.audit import log_to_audit


async def handle_submit_feedback(
    deps,
    solution_id: str,
    outcome: str,
    environment: dict,
    agent_token: str | None = None,
    comment: str | None = None,
) -> dict:
    token = await resolve_agent_token(deps.postgres, deps.redis, agent_token)

    # Create feedback event
    record = await deps.postgres.fetchrow("""
        INSERT INTO grexis.feedback_events (
            solution_id, agent_token_hash, outcome, comment,
            llm, framework, framework_version, runtime
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING id
    """,
        solution_id, token.hash if token else None, outcome, comment,
        environment["llm"], environment["framework"],
        environment["framework_version"], environment["runtime"],
    )
    feedback_id = str(record["id"])

    # Create edge
    await create_edge(deps.postgres, "feedback_on_solution", feedback_id, "feedback", solution_id, "solution")

    # Update last_validated_at on success/partial
    if outcome in ("success", "partial"):
        await deps.postgres.execute(
            "UPDATE grexis.solutions SET last_validated_at = NOW() WHERE id = $1", solution_id
        )

    # Recompute trust score
    solution = await deps.postgres.fetchrow("SELECT * FROM grexis.solutions WHERE id = $1", solution_id)
    feedbacks = await deps.postgres.fetch(
        "SELECT outcome FROM grexis.feedback_events WHERE solution_id = $1", solution_id
    )
    new_score = await compute_confidence_score(solution, feedbacks, deps.redis, deps.config)
    await deps.postgres.execute(
        "UPDATE grexis.solutions SET confidence_score = $1 WHERE id = $2", new_score, solution_id
    )

    # Check consecutive failures
    await handle_consecutive_failures(deps.postgres, deps.redis, solution_id, deps.config)

    await log_to_audit(deps.postgres, "agent", token.hash if token else "anonymous", "submit_feedback", target_id=solution_id)
    return {"feedback_id": feedback_id, "new_confidence_score": new_score}
```

- [ ] **Step 7: Implement register_agent.py**

Create `api/src/grexis/mcp/register_agent.py`:
```python
import hashlib
from grexis.services.tokens import resolve_agent_token, hash_token
from grexis.lib.audit import log_to_audit


async def handle_register_agent(
    deps,
    agent_token: str,
    agent_description: str | None = None,
    human_operator_email: str | None = None,
    framework: str | None = None,
) -> dict:
    token = await resolve_agent_token(deps.postgres, deps.redis, agent_token)
    token_hash = hash_token(agent_token)

    email_hash = None
    if human_operator_email:
        email_hash = hashlib.sha256(human_operator_email.encode()).hexdigest()

    await deps.postgres.execute("""
        UPDATE grexis.agent_tokens
        SET tier = 'registered', agent_description = $1,
            operator_email_hash = $2, framework = $3
        WHERE token_hash = $4
    """, agent_description, email_hash, framework, token_hash)

    # Invalidate Redis cache
    await deps.redis.client.delete(f"rep:{token_hash}")

    await log_to_audit(deps.postgres, "agent", token_hash, "register_agent", target_id=token_hash)
    return {"registered": True, "tier": "registered"}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
cd api && python -m pytest tests/unit/test_mcp_tools.py -v
```
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add api/src/grexis/mcp/ api/tests/unit/test_mcp_tools.py
git commit -m "feat: implement 5 MCP tool handlers with tests"
```

### Task 22: Wire MCP into FastAPI

**Files:**
- Modify: `api/src/grexis/main.py`

- [ ] **Step 1: Mount MCP SSE transport on FastAPI**

Add to `main.py`:
```python
from mcp.server.sse import SseServerTransport
from grexis.mcp.server import server as mcp_server
from grexis.mcp.query_solutions import handle_query_solutions
from grexis.mcp.submit_problem import handle_submit_problem
from grexis.mcp.submit_solution import handle_submit_solution
from grexis.mcp.submit_feedback import handle_submit_feedback
from grexis.mcp.register_agent import handle_register_agent

# Register MCP tool dispatch
TOOL_HANDLERS = {
    "query_solutions": handle_query_solutions,
    "submit_problem": handle_submit_problem,
    "submit_solution": handle_submit_solution,
    "submit_feedback": handle_submit_feedback,
    "register_agent": handle_register_agent,
}


@mcp_server.call_tool()
async def call_tool(name: str, arguments: dict):
    handler = TOOL_HANDLERS.get(name)
    if not handler:
        raise ValueError(f"Unknown tool: {name}")
    result = await handler(deps=deps, **arguments)
    return [TextContent(type="text", text=json.dumps(result))]


# Mount MCP SSE endpoint
sse = SseServerTransport("/mcp/messages/")
app.mount("/mcp", sse.get_app())
```

- [ ] **Step 2: Commit**

```bash
git add api/src/grexis/main.py
git commit -m "feat: mount MCP server on FastAPI via SSE transport"
```

---

## Chunk 5: Admin API & Auth

This chunk implements the admin REST API with session-based authentication. After this chunk, the admin dashboard has a complete backend to work against.

### Task 23: Admin authentication

**Files:**
- Create: `api/src/grexis/admin/auth.py`
- Test: `api/tests/unit/test_auth.py`

- [ ] **Step 1: Write failing tests**

Create `api/tests/unit/test_auth.py`:
```python
from grexis.admin.auth import create_session_token, verify_session_token


def test_create_and_verify_session():
    secret = "test-secret-key"
    token = create_session_token(secret)
    assert verify_session_token(token, secret) is True


def test_invalid_token_rejected():
    assert verify_session_token("invalid-token", "test-secret") is False
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd api && python -m pytest tests/unit/test_auth.py -v
```
Expected: FAIL

- [ ] **Step 3: Implement auth.py**

Create `api/src/grexis/admin/auth.py`:
```python
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

SESSION_MAX_AGE = 8 * 60 * 60  # 8 hours


def create_session_token(secret: str) -> str:
    s = URLSafeTimedSerializer(secret)
    return s.dumps({"role": "admin"})


def verify_session_token(token: str, secret: str) -> bool:
    s = URLSafeTimedSerializer(secret)
    try:
        s.loads(token, max_age=SESSION_MAX_AGE)
        return True
    except (BadSignature, SignatureExpired):
        return False
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git add api/src/grexis/admin/auth.py api/tests/unit/test_auth.py
git commit -m "feat: add session-based admin auth with itsdangerous"
```

### Task 24: Admin REST API routes

**Files:**
- Create: `api/src/grexis/admin/routes.py`
- Modify: `api/src/grexis/main.py` (mount router)

- [ ] **Step 1: Implement routes.py**

Create `api/src/grexis/admin/routes.py` — FastAPI APIRouter with all endpoints from Tech Spec Section 15. Split into sub-files if needed for readability (see advisory below).

**Important:** The following endpoints were missing from the original tech spec but are required by the Admin UI Spec:
- `GET /admin/tokens` — list all tokens (UI Spec Section 4.5 agents browser)
- `POST /admin/tokens/{hash}/unban` — unban a token (UI Spec Section 4.5)
- `POST /admin/solutions` — create solution manually (UI Spec Section 4.4 manual resolve)

```python
from fastapi import APIRouter, Request, Response, HTTPException, Depends, Query
from grexis.admin.auth import create_session_token, verify_session_token
from grexis.lib.config import get_settings
from grexis.lib.audit import log_to_audit
from grexis import deps

router = APIRouter(prefix="/admin")
auth_router = APIRouter(prefix="/auth")


# --- Auth ---

@auth_router.post("/login")
async def login(request: Request, response: Response):
    body = await request.json()
    settings = get_settings()
    if body.get("secret") != settings.GREXIS_API_SECRET:
        return {"error": "invalid"}
    token = create_session_token(settings.GREXIS_API_SECRET)
    response.set_cookie(
        "grexis_admin_session", token,
        httponly=True, samesite="strict", max_age=8 * 3600,
    )
    return {"ok": True}

@auth_router.get("/me")
async def me(request: Request):
    token = request.cookies.get("grexis_admin_session")
    if not token or not verify_session_token(token, get_settings().GREXIS_API_SECRET):
        raise HTTPException(401)
    return {"ok": True}

@auth_router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("grexis_admin_session")
    return {"ok": True}


async def require_admin(request: Request):
    token = request.cookies.get("grexis_admin_session")
    if not token or not verify_session_token(token, get_settings().GREXIS_API_SECRET):
        raise HTTPException(401, "Unauthorized")


# --- Solutions ---

@router.get("/solutions")
async def list_solutions(
    status: str | None = None, framework: str | None = None,
    error_type: str | None = None, source: str | None = None,
    page: int = 1, per_page: int = 50,
    admin=Depends(require_admin),
):
    # Build WHERE clause from filters, paginate with LIMIT/OFFSET
    ...  # Each handler delegates to a SQL query on deps.postgres

@router.get("/solutions/{solution_id}")
async def get_solution(solution_id: str, admin=Depends(require_admin)):
    # Fetch solution + feedback history + edges
    ...

@router.post("/solutions")
async def create_solution(request: Request, admin=Depends(require_admin)):
    """Manual solution creation for admin problem resolution (UI Spec Section 4.4)"""
    body = await request.json()
    # INSERT with source='human_curated', status='active'
    # Create solution_resolves_problem edge
    # Log to audit with reason
    ...

@router.patch("/solutions/{solution_id}")
async def update_solution(solution_id: str, request: Request, admin=Depends(require_admin)):
    ...

@router.delete("/solutions/{solution_id}")
async def delete_solution(solution_id: str, request: Request, admin=Depends(require_admin)):
    # Soft-delete: SET status='inactive', require reason in body
    ...


# --- Problems ---

@router.get("/problems")
async def list_problems(
    status: str | None = None, severity: str | None = None,
    framework: str | None = None, page: int = 1, per_page: int = 50,
    admin=Depends(require_admin),
):
    ...

@router.get("/problems/{problem_id}")
async def get_problem(problem_id: str, admin=Depends(require_admin)):
    # Fetch problem + linked solutions + agent_jobs.synthesis_logs
    ...


# --- Tokens ---

@router.get("/tokens")
async def list_tokens(
    tier: str | None = None, is_banned: bool | None = None,
    page: int = 1, per_page: int = 50,
    admin=Depends(require_admin),
):
    """List all agent tokens with filters (UI Spec Section 4.5)"""
    ...

@router.get("/tokens/{token_hash}")
async def get_token(token_hash: str, admin=Depends(require_admin)):
    ...

@router.post("/tokens/{token_hash}/ban")
async def ban_token(token_hash: str, request: Request, admin=Depends(require_admin)):
    ...

@router.post("/tokens/{token_hash}/unban")
async def unban_token(token_hash: str, request: Request, admin=Depends(require_admin)):
    """Unban a previously banned token (UI Spec Section 4.5)"""
    body = await request.json()
    reason = body.get("reason", "")
    await deps.postgres.execute(
        "UPDATE grexis.agent_tokens SET is_banned = FALSE, ban_reason = NULL, banned_at = NULL WHERE token_hash = $1",
        token_hash,
    )
    await log_to_audit(deps.postgres, "human_admin", "admin", "unban_token", target_id=token_hash, reason=reason)
    return {"ok": True}

@router.post("/tokens/{token_hash}/reset")
async def reset_token(token_hash: str, request: Request, admin=Depends(require_admin)):
    ...


# --- Audit, Jobs, Metrics, Clusters, Settings ---

@router.get("/audit")
async def list_audit(
    actor_type: str | None = None, action: str | None = None,
    page: int = 1, per_page: int = 100,
    admin=Depends(require_admin),
):
    ...

@router.get("/jobs")
async def list_jobs(status: str | None = None, page: int = 1, admin=Depends(require_admin)):
    ...

@router.get("/metrics")
async def get_metrics(admin=Depends(require_admin)):
    from grexis.admin.metrics import collect_metrics
    return await collect_metrics(deps.postgres, deps.redis)

@router.get("/clusters")
async def list_clusters(admin=Depends(require_admin)):
    ...

@router.post("/clusters/{cluster_id}/accept")
async def accept_cluster(cluster_id: str, request: Request, admin=Depends(require_admin)):
    ...

@router.post("/clusters/{cluster_id}/dismiss")
async def dismiss_cluster(cluster_id: str, request: Request, admin=Depends(require_admin)):
    ...

@router.post("/clusters/trigger")
async def trigger_clustering(admin=Depends(require_admin)):
    ...

@router.get("/settings")
async def get_settings_route(admin=Depends(require_admin)):
    rows = await deps.postgres.fetch("SELECT key, value, updated_at FROM grexis.settings")
    return {r["key"]: r["value"] for r in rows}

@router.patch("/settings")
async def update_settings(request: Request, admin=Depends(require_admin)):
    body = await request.json()
    # Validate search_weights sum to 1.0 if present
    if "search_weights" in body:
        weights = body["search_weights"]
        total = sum(weights.values())
        if abs(total - 1.0) > 0.001:
            raise HTTPException(422, f"Search weights must sum to 1.0, got {total}")
    # Update each key
    ...
```

**Advisory:** If `routes.py` exceeds ~400 lines during implementation, split into `admin/solutions_routes.py`, `admin/tokens_routes.py`, etc., and assemble via `include_router` in a parent router.

Each endpoint queries Postgres via `deps.postgres` and returns JSON. All mutating actions log to audit via `lib.audit.log_to_audit`.

- [ ] **Step 2: Mount routers in main.py**

Add to `main.py`:
```python
from grexis.admin.routes import router as admin_router, auth_router
app.include_router(auth_router)
app.include_router(admin_router)
```

- [ ] **Step 3: Commit**

```bash
git add api/src/grexis/admin/routes.py api/src/grexis/main.py
git commit -m "feat: add admin REST API with 20+ endpoints and session auth"
```

### Task 25: Metrics endpoint

**Files:**
- Create: `api/src/grexis/admin/metrics.py`

- [ ] **Step 1: Implement metrics.py**

Create `api/src/grexis/admin/metrics.py` — all 12 metrics from Tech Spec Section 14 table.

```python
import asyncio


async def collect_metrics(db, redis) -> dict:
    # Run all queries in parallel for performance
    (
        solutions_active, problems_open, edges_total,
        trust_p50, feedback_queue, agent_success_rate,
        agent_tokens_today, mttr,
    ) = await asyncio.gather(
        db.fetchval("SELECT COUNT(*) FROM grexis.solutions WHERE status = 'active'"),
        db.fetchval("SELECT COUNT(*) FROM grexis.problems WHERE status = 'open'"),
        db.fetchval("SELECT COUNT(*) FROM grexis.resolution_edges"),
        db.fetchval("SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY confidence_score) FROM grexis.solutions WHERE status = 'active'"),
        db.fetchval("SELECT COUNT(*) FROM grexis.feedback_events WHERE aggregated_at IS NULL"),
        _get_agent_success_rate(db),
        redis.get_counter(f"budget:scheduled:{_today()}"),
        _get_mttr(redis),
    )

    # Counters from Redis (queries_total, submissions_total, scan_rejections are incremented live)
    queries_total = await redis.get_counter("metric:queries_total")
    submissions_total = await redis.get_counter("metric:submissions_total")
    scan_rejections = await redis.get_counter("metric:scan_rejections_total")

    return {
        "grexis_queries_total": queries_total,                         # counter — from Redis
        "grexis_query_latency_ms": await _get_latency_percentiles(redis),  # histogram — from Redis list
        "grexis_submissions_total": submissions_total,                 # counter — from Redis
        "grexis_secret_scan_rejections_total": scan_rejections,        # counter — from Redis
        "grexis_solutions_active": solutions_active,                   # gauge — from Postgres
        "grexis_problems_open": problems_open,                        # gauge — from Postgres
        "grexis_graph_edges_total": edges_total,                      # gauge — from Postgres
        "grexis_trust_score_p50": float(trust_p50 or 0),              # gauge — from Postgres
        "grexis_feedback_queue_length": feedback_queue,                # gauge — from Postgres
        "grexis_scheduled_agent_success_rate": agent_success_rate,     # gauge — from Postgres
        "grexis_scheduled_agent_tokens_today": agent_tokens_today,     # gauge — from Redis
        "grexis_mean_time_to_resolution_ms": mttr,                    # gauge — from Redis
    }


async def _get_agent_success_rate(db) -> float:
    row = await db.fetchrow("""
        SELECT COUNT(*) FILTER (WHERE status = 'succeeded') AS ok,
               COUNT(*) AS total
        FROM grexis.agent_jobs
        WHERE created_at > NOW() - INTERVAL '7 days'
    """)
    return (row["ok"] / row["total"]) if row["total"] > 0 else 0.0


async def _get_mttr(redis) -> float:
    samples = await redis.client.lrange("metric:resolution_times_ms", 0, -1)
    if not samples:
        return 0.0
    values = [float(s) for s in samples]
    return sum(values) / len(values)


async def _get_latency_percentiles(redis) -> dict:
    samples = await redis.client.lrange("metric:query_latency_ms", 0, -1)
    if not samples:
        return {"p50": 0, "p95": 0, "p99": 0}
    values = sorted(float(s) for s in samples)
    n = len(values)
    return {
        "p50": values[int(n * 0.5)],
        "p95": values[int(n * 0.95)],
        "p99": values[int(n * 0.99)],
    }


def _today() -> str:
    from datetime import date
    return date.today().isoformat()
```

- [ ] **Step 2: Commit**

```bash
git add api/src/grexis/admin/metrics.py
git commit -m "feat: add metrics collection for admin dashboard"
```

---

## Chunk 6: Scheduler Jobs

This chunk implements the APScheduler jobs: answer agent, decay recomputation, diversity factor caching, failure clustering, and feedback aggregation.

### Task 26: APScheduler setup

**Files:**
- Create: `api/src/grexis/scheduler/jobs.py`
- Modify: `api/src/grexis/main.py` (start scheduler in lifespan)

- [ ] **Step 1: Implement jobs.py**

Create `api/src/grexis/scheduler/jobs.py`:
```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler()


def register_jobs() -> None:
    from grexis.scheduler.answer_agent import attempt_open_problems
    from grexis.scheduler.decay import recompute_decay
    from grexis.scheduler.diversity import recompute_diversity_factors
    from grexis.scheduler.clustering import run_clustering_job
    from grexis.scheduler.aggregation import aggregate_old_feedback

    scheduler.add_job(attempt_open_problems, "interval", minutes=30, id="answer_agent")
    scheduler.add_job(recompute_decay, "interval", hours=6, id="decay")
    scheduler.add_job(recompute_diversity_factors, "interval", minutes=15, id="diversity")
    scheduler.add_job(run_clustering_job, "cron", hour=2, minute=0, id="clustering")
    scheduler.add_job(aggregate_old_feedback, "cron", hour=3, minute=0, id="aggregation")

    # Sandbox purge — only active when SANDBOX_MODE=true
    from grexis.lib.config import get_settings
    if get_settings().SANDBOX_MODE:
        from grexis.scheduler.sandbox import purge_sandbox_data
        scheduler.add_job(purge_sandbox_data, "cron", hour=4, minute=0, id="sandbox_purge")
```

- [ ] **Step 2: Wire into lifespan**

Add to `main.py` lifespan:
```python
from grexis.scheduler.jobs import scheduler, register_jobs
register_jobs()
scheduler.start()
# ... yield ...
scheduler.shutdown()
```

- [ ] **Step 3: Commit**

```bash
git add api/src/grexis/scheduler/jobs.py api/src/grexis/main.py
git commit -m "feat: add APScheduler with 5 scheduled jobs"
```

### Task 27: Scheduled answer agent

**Files:**
- Create: `api/src/grexis/scheduler/answer_agent.py`

- [ ] **Step 1: Implement answer_agent.py**

From Tech Spec Section 12:
- `select_next_problem()` — priority: blocking DESC, duplicate_count DESC, created_at ASC
- `attempt_open_problems()` — main loop, checks budget, selects problem, attempts synthesis
- `check_scheduled_agent_health()` — pauses if 7-day success rate < 35%

- [ ] **Step 2: Commit**

```bash
git add api/src/grexis/scheduler/answer_agent.py
git commit -m "feat: add scheduled answer agent with budget/health guardrails"
```

### Task 28: Decay recomputation

**Files:**
- Create: `api/src/grexis/scheduler/decay.py`

- [ ] **Step 1: Implement decay.py**

Recomputes trust scores for solutions where `last_validated_at` is stale. Batch updates `confidence_score` in Postgres and corresponding Qdrant payloads.

- [ ] **Step 2: Commit**

```bash
git add api/src/grexis/scheduler/decay.py
git commit -m "feat: add trust score decay recomputation job"
```

### Task 29: Diversity factor caching

**Files:**
- Create: `api/src/grexis/scheduler/diversity.py`

- [ ] **Step 1: Implement diversity.py**

From Tech Spec Section 7 — `recompute_diversity_factors()`. Computes `unique_envs / total_success_feedbacks` for each active solution and writes to Redis with 900s TTL.

- [ ] **Step 2: Commit**

```bash
git add api/src/grexis/scheduler/diversity.py
git commit -m "feat: add diversity factor recomputation job (15-min cycle)"
```

### Task 30: Failure clustering

**Files:**
- Create: `api/src/grexis/scheduler/clustering.py`

- [ ] **Step 1: Implement clustering.py**

Uses scikit-learn TF-IDF + KMeans on problem `details` fields. Generates cluster labels from top keywords via NLTK. Writes to `grexis.failure_clusters` table.

- [ ] **Step 2: Commit**

```bash
git add api/src/grexis/scheduler/clustering.py
git commit -m "feat: add failure clustering job (TF-IDF + KMeans)"
```

### Task 31: Feedback aggregation

**Files:**
- Create: `api/src/grexis/scheduler/aggregation.py`

- [ ] **Step 1: Implement aggregation.py**

Aggregates feedback events older than 90 days: updates `solutions.success_rate` and `solutions.attempt_count`, then marks events as `aggregated_at = NOW()`.

- [ ] **Step 2: Commit**

```bash
git add api/src/grexis/scheduler/aggregation.py
git commit -m "feat: add feedback aggregation job (90-day window)"
```

---

## Chunk 7: Seeding CLI

This chunk implements the seeding CLI for cold-start bootstrapping.

### Task 32: Seed CLI command

**Files:**
- Create: `api/src/grexis/cli/seed.py`
- Create: `db/seeds/sample-langchain-rate-limit.json`
- Test: `api/tests/unit/test_seed.py`

- [ ] **Step 1: Write failing test**

Create `api/tests/unit/test_seed.py`:
```python
import json
from grexis.cli.seed import validate_seed_entry


def test_validate_valid_seed():
    seed = {
        "failure_signature": {
            "error_type": "RateLimitError",
            "error_code": "429",
            "tool_name": "web_search",
            "severity": "blocking",
            "details": "Rate limit exceeded",
        },
        "goal_state": "Retrieve search results",
        "environment": {
            "llm": "claude-sonnet-4-6",
            "framework": "langchain",
            "framework_version": "0.3.1",
            "runtime": "python-3.11",
        },
        "resolution": {
            "solution_steps": ["Step 1", "Step 2"],
            "solution_summary": "Use backoff",
            "confidence": "inferred",
        },
        "provenance": "https://example.com",
    }
    errors = validate_seed_entry(seed)
    assert errors == []


def test_validate_missing_fields():
    seed = {"failure_signature": {"error_type": "Error"}}
    errors = validate_seed_entry(seed)
    assert len(errors) > 0
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement seed.py**

Create `api/src/grexis/cli/seed.py` — from Tech Spec Section 16:
- `validate_seed_entry(entry: dict) -> list[str]` — schema validation
- `async def ingest_seeds(source_dir: str, dry_run: bool) -> None` — reads JSON files, validates, deduplicates, ingests
- `__main__` block with argparse for `python -m grexis.cli.seed --source db/seeds/ --dry-run`

Each seed passes through secret scanner and duplicate check before ingestion.

- [ ] **Step 4: Create sample seed file**

Create `db/seeds/sample-langchain-rate-limit.json`:
```json
[
  {
    "failure_signature": {
      "error_type": "RateLimitError",
      "error_code": "429",
      "tool_name": "web_search",
      "severity": "blocking",
      "details": "web_search tool returns 429 when >3 concurrent calls on LangChain 0.3.x"
    },
    "goal_state": "Retrieve search results for research task",
    "environment": {
      "llm": "claude-sonnet-4-6",
      "framework": "langchain",
      "framework_version": "0.3.1",
      "runtime": "python-3.11"
    },
    "resolution": {
      "solution_steps": [
        "Detect 429 response after 2nd consecutive retry",
        "Switch to exponential backoff with 8s base delay",
        "Add random jitter of +/-500ms per attempt",
        "Retry up to 5 times with increasing delay"
      ],
      "solution_summary": "Exponential backoff with jitter (8s base, +/-500ms) resolves web_search rate limiting. Lower base delays still trigger 429.",
      "confidence": "inferred"
    },
    "provenance": "https://github.com/langchain-ai/langchain/issues/12345"
  }
]
```

- [ ] **Step 5: Run tests, verify pass**

- [ ] **Step 6: Commit**

```bash
git add api/src/grexis/cli/seed.py api/tests/unit/test_seed.py db/seeds/
git commit -m "feat: add seeding CLI for cold-start bootstrapping"
```

---

## Chunk 8: Admin UI (React)

This chunk implements the React admin dashboard from GREXIS-ADMIN-UI-SPEC-v0.1.md. After this chunk, the full admin UI is functional against the admin REST API.

### Task 33: Install npm dependencies

- [ ] **Step 1: Install dependencies**

```bash
cd web && npm install
```

- [ ] **Step 2: Verify build works with scaffolding**

```bash
cd web && npm run build
```
Expected: Build succeeds.

- [ ] **Step 3: Commit lock file**

```bash
git add web/package-lock.json
git commit -m "chore: add npm lock file"
```

### Task 34: Shared types and API client

**Files:**
- Create: `web/src/types/api.ts`
- Create: `web/src/lib/api.ts`

- [ ] **Step 1: Define TypeScript types**

Create `web/src/types/api.ts` — types for all API responses: `Solution`, `Problem`, `AgentToken`, `AuditEntry`, `AgentJob`, `FailureCluster`, `Settings`, `Metrics`.

- [ ] **Step 2: Create API client**

Create `web/src/lib/api.ts`:
```typescript
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

  if (res.status === 401) {
    window.location.href = `/login?return=${encodeURIComponent(window.location.pathname)}`;
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
  login: (secret: string) => fetchAPI("/auth/login", { method: "POST", body: JSON.stringify({ secret }) }),
  me: () => fetchAPI("/auth/me"),
  logout: () => fetchAPI("/auth/logout", { method: "POST" }),

  // Solutions
  listSolutions: (params?: URLSearchParams) => fetchAPI(`/admin/solutions?${params || ""}`),
  getSolution: (id: string) => fetchAPI(`/admin/solutions/${id}`),
  updateSolution: (id: string, data: object) => fetchAPI(`/admin/solutions/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteSolution: (id: string, reason: string) => fetchAPI(`/admin/solutions/${id}`, { method: "DELETE", body: JSON.stringify({ reason }) }),

  // Problems
  listProblems: (params?: URLSearchParams) => fetchAPI(`/admin/problems?${params || ""}`),
  getProblem: (id: string) => fetchAPI(`/admin/problems/${id}`),

  // Tokens
  listTokens: (params?: URLSearchParams) => fetchAPI(`/admin/tokens?${params || ""}`),
  getToken: (hash: string) => fetchAPI(`/admin/tokens/${hash}`),
  banToken: (hash: string, reason: string) => fetchAPI(`/admin/tokens/${hash}/ban`, { method: "POST", body: JSON.stringify({ reason }) }),
  unbanToken: (hash: string, reason: string) => fetchAPI(`/admin/tokens/${hash}/unban`, { method: "POST", body: JSON.stringify({ reason }) }),
  resetToken: (hash: string, reason: string) => fetchAPI(`/admin/tokens/${hash}/reset`, { method: "POST", body: JSON.stringify({ reason }) }),

  // Audit
  listAudit: (params?: URLSearchParams) => fetchAPI(`/admin/audit?${params || ""}`),

  // Jobs
  listJobs: (params?: URLSearchParams) => fetchAPI(`/admin/jobs?${params || ""}`),

  // Metrics
  getMetrics: () => fetchAPI("/admin/metrics"),

  // Clusters
  listClusters: () => fetchAPI("/admin/clusters"),
  acceptCluster: (id: string) => fetchAPI(`/admin/clusters/${id}/accept`, { method: "POST" }),
  dismissCluster: (id: string) => fetchAPI(`/admin/clusters/${id}/dismiss`, { method: "POST" }),
  triggerClustering: () => fetchAPI("/admin/clusters/trigger", { method: "POST" }),

  // Settings
  getSettings: () => fetchAPI("/admin/settings"),
  updateSettings: (data: object) => fetchAPI("/admin/settings", { method: "PATCH", body: JSON.stringify(data) }),
};
```

- [ ] **Step 3: Commit**

```bash
git add web/src/types/ web/src/lib/
git commit -m "feat: add TypeScript API types and client"
```

### Task 35: Layout and routing

**Files:**
- Modify: `web/src/App.tsx`
- Create: `web/src/components/Layout.tsx`
- Create: `web/src/components/Sidebar.tsx`
- Create: `web/src/hooks/useAuth.ts`
- Create: `web/src/hooks/usePolling.ts`

- [ ] **Step 1: Implement useAuth hook**

```typescript
// web/src/hooks/useAuth.ts
import { useState, useEffect } from "react";
import { api } from "@/lib/api";

export function useAuth() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    api.me().then(() => setAuthenticated(true)).catch(() => setAuthenticated(false));
  }, []);

  return { authenticated, setAuthenticated };
}
```

- [ ] **Step 2: Implement usePolling hook**

```typescript
// web/src/hooks/usePolling.ts
import { useEffect, useRef } from "react";

export function usePolling(callback: () => void, intervalMs: number) {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") {
        savedCallback.current();
      }
    };
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
```

- [ ] **Step 3: Implement Sidebar with badge polling**

Create `web/src/components/Sidebar.tsx` — from Admin UI Spec Section 3. Sidebar with navigation links, badge counts for Problems/Moderation/Clusters polled every 5s.

- [ ] **Step 4: Implement Layout**

Create `web/src/components/Layout.tsx` — sidebar + main content area.

- [ ] **Step 5: Wire up App.tsx with react-router-dom**

Rewrite `web/src/App.tsx`:
```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { LoginPage } from "@/pages/Login";
import { DashboardPage } from "@/pages/Dashboard";
import { SolutionsPage } from "@/pages/Solutions";
// ... all page imports
import { useAuth } from "@/hooks/useAuth";

export function App() {
  const { authenticated, setAuthenticated } = useAuth();

  if (authenticated === null) return <div>Loading...</div>;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage onLogin={() => setAuthenticated(true)} />} />
        {authenticated ? (
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/solutions" element={<SolutionsPage />} />
            <Route path="/solutions/:id" element={<SolutionDetailPage />} />
            <Route path="/problems" element={<ProblemsPage />} />
            <Route path="/problems/:id" element={<ProblemDetailPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/agents/:hash" element={<AgentDetailPage />} />
            <Route path="/moderation" element={<ModerationPage />} />
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
```

- [ ] **Step 6: Commit**

```bash
git add web/src/
git commit -m "feat: add layout, routing, auth hook, and sidebar with badge polling"
```

### Task 36: Login page

**Files:**
- Create: `web/src/pages/Login.tsx`

- [ ] **Step 1: Implement login page**

From Admin UI Spec Section 4.1 — single password field, submit to `POST /auth/login`, redirect to dashboard on success, inline error on failure.

- [ ] **Step 2: Commit**

```bash
git add web/src/pages/Login.tsx
git commit -m "feat: add login page with session auth"
```

### Task 37: Dashboard page

**Files:**
- Create: `web/src/pages/Dashboard.tsx`

- [ ] **Step 1: Implement dashboard**

From Admin UI Spec Section 5.1:
- Key metrics strip (4 cards)
- Alerts panel (conditional)
- Recent activity feed (last 20 audit entries)
- Platform health row

- [ ] **Step 2: Commit**

```bash
git add web/src/pages/Dashboard.tsx
git commit -m "feat: add dashboard with metrics, alerts, and activity feed"
```

### Task 38: Solutions browser + detail

**Files:**
- Create: `web/src/pages/Solutions.tsx`
- Create: `web/src/pages/SolutionDetail.tsx`
- Create: `web/src/components/StatusBadge.tsx`
- Create: `web/src/components/SourceBadge.tsx`
- Create: `web/src/components/SeverityBadge.tsx`
- Create: `web/src/components/ConfirmModal.tsx`

- [ ] **Step 1: Implement shared badge components**

From Admin UI Spec Section 6 — StatusBadge, SourceBadge, SeverityBadge with correct colors and ARIA labels.

- [ ] **Step 2: Implement ConfirmModal**

From Admin UI Spec Section 6 "Destructive action pattern" — modal with reason textarea (min 10 chars), disabled confirm until reason entered.

- [ ] **Step 3: Implement Solutions browser**

From Admin UI Spec Section 5.2 — table with server-side filtering and sorting, 50 rows per page.

- [ ] **Step 4: Implement Solution detail page**

From Admin UI Spec Section 4.3 — header, failure signature, environment, resolution, trust score breakdown, feedback history, graph edges, provenance, admin notes, action panel.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/Solutions.tsx web/src/pages/SolutionDetail.tsx web/src/components/
git commit -m "feat: add solutions browser and detail page with badges"
```

### Task 39: Problems queue + detail

**Files:**
- Create: `web/src/pages/Problems.tsx`
- Create: `web/src/pages/ProblemDetail.tsx`

- [ ] **Step 1: Implement Problems queue**

From Admin UI Spec Section 5.3 — table with quick resolve button for blocking problems.

- [ ] **Step 2: Implement Problem detail page**

From Admin UI Spec Section 4.4 — full breakdown, existing solutions, scheduled agent attempts, manual resolve editor.

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/Problems.tsx web/src/pages/ProblemDetail.tsx
git commit -m "feat: add problems queue with manual resolution flow"
```

### Task 40: Moderation queue

**Files:**
- Create: `web/src/pages/Moderation.tsx`

- [ ] **Step 1: Implement moderation page**

From Admin UI Spec Section 4.2 — flagged items sorted by severity then age, detail panel slides from right, actions: Dismiss/Edit/Remove/Ban.

- [ ] **Step 2: Commit**

```bash
git add web/src/pages/Moderation.tsx
git commit -m "feat: add moderation queue with slide-in detail panel"
```

### Task 41: Agents browser + detail

**Files:**
- Create: `web/src/pages/Agents.tsx`
- Create: `web/src/pages/AgentDetail.tsx`

- [ ] **Step 1: Implement agents pages**

From Admin UI Spec Section 4.5 — token browser with ban/reset actions.

- [ ] **Step 2: Commit**

```bash
git add web/src/pages/Agents.tsx web/src/pages/AgentDetail.tsx
git commit -m "feat: add agent token browser with ban/reset actions"
```

### Task 42: Remaining pages

**Files:**
- Create: `web/src/pages/Clusters.tsx`
- Create: `web/src/pages/Audit.tsx`
- Create: `web/src/pages/Jobs.tsx`
- Create: `web/src/pages/Metrics.tsx`
- Create: `web/src/pages/Settings.tsx`

- [ ] **Step 1: Implement Clusters page**

From Admin UI Spec Section 4.6 — cluster cards with Accept/Dismiss, trigger clustering button.

- [ ] **Step 2: Implement Audit log page**

From Admin UI Spec Section 5.7 — read-only table, 100 rows/page, CSV export.

- [ ] **Step 3: Implement Jobs page**

From Admin UI Spec Section 5.4 — current status + job queue table + expandable synthesis logs.

- [ ] **Step 4: Implement Metrics page**

From Admin UI Spec Section 5.5 — numeric dashboard with 24h trend arrows, Grafana link if configured.

- [ ] **Step 5: Implement Settings page**

From Admin UI Spec Section 5.6 — form sections for search weights (sum-to-1 validation), trust decay, rate limits, scheduled agent, secret scanning.

- [ ] **Step 6: Verify build**

```bash
cd web && npm run build
```
Expected: Build succeeds with no TypeScript errors. Fix any issues before committing.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/
git commit -m "feat: add clusters, audit, jobs, metrics, and settings pages"
```

---

**Styling approach:** Use CSS modules (`.module.css` files colocated with components). No external CSS framework — the admin UI is functional, not decorative. Badge colors from Admin UI Spec Section 6 are implemented as inline styles or CSS module classes.

---

## Final: Integration verification

### Task 43: End-to-end smoke test

- [ ] **Step 1: Copy .env.example to .env and set values**

```bash
cp .env.example .env
```

- [ ] **Step 2: Start full stack**

```bash
docker compose up --build -d
```

- [ ] **Step 3: Verify health endpoint**

```bash
curl http://localhost:8000/health
```
Expected: `{"status": "ok", "version": "0.3.0"}`

- [ ] **Step 4: Verify ready endpoint**

```bash
curl http://localhost:8000/ready
```
Expected: `{"status": "ready"}`

- [ ] **Step 5: Verify admin login**

```bash
curl -X POST http://localhost:8000/auth/login -H 'Content-Type: application/json' -d '{"secret":"changeme_grexis_admin_secret"}' -c cookies.txt
curl http://localhost:8000/auth/me -b cookies.txt
```

- [ ] **Step 6: Verify web UI loads**

Open `http://localhost:3000` — should show login page.

- [ ] **Step 7: Run seed CLI**

```bash
docker exec grexis-api python -m grexis.cli.seed --source db/seeds/ --dry-run
```

- [ ] **Step 8: Stop stack**

```bash
docker compose down
```
