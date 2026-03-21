# GREXIS Roadmap & Test Specification

**Status**: March 2026 — POC running locally, ~15 runtime bugs blocking end-to-end flow
**Goal**: Fix all blocking bugs, complete core features, validate with CLI test agents

---

## 1. Current State Summary

| Component | Health | Notes |
|---|---|---|
| Infrastructure (PG, Qdrant, Redis) | Working | Docker Compose, schema seeded |
| Embedding service (bge-m3 ONNX) | Working | CUDA + CPU fallback |
| Admin dashboard (React/Vite) | Working | 14 pages, Tailwind v4 |
| MCP SSE transport | Working | connect_sse/handle_post_message |
| MCP `register_agent` | Working | Only tool that works end-to-end |
| MCP `query_solutions` | 90% | Missing rate limiting, incomplete response |
| MCP `submit_problem` | **Broken** | Signature mismatch with duplicates service |
| MCP `submit_solution` | **Broken** | Edge target is self-referencing |
| MCP `submit_feedback` | **Broken** | `deps.config` doesn't exist |
| Rate limiting | **0%** | Specified everywhere, enforced nowhere |
| Scheduler: answer_agent | Stub | No LLM synthesis |
| Scheduler: decay/diversity/clustering | **Broken** | Column name mismatches vs schema |
| Unit tests | Exist | 16 files, untested against real DB |
| Integration tests | **Missing** | None |
| Seed data | ~0% | 1 entry vs 5,000 target |

---

## 2. Priority 1 — Fix Runtime-Breaking Bugs

These must be fixed before any testing is possible. All are mechanical fixes (wrong column names, mismatched signatures, missing attributes).

### Bug 2.1: `submit_problem` signature mismatch

**File**: `api/src/grexis/mcp/submit_problem.py`
**Problem**: Calls `handle_submit_problem(db=deps.postgres, qdrant=deps.qdrant, ...)` but `duplicates.handle_submit_problem` expects positional args `(payload, embed_service, qdrant, db, create_problem_fn, index_problem_fn, ...)`.
**Fix**: Rewrite `submit_problem.py` to inline the logic: embed, check duplicates via Qdrant cosine, insert into PG, index in Qdrant, create edges. Use `duplicates.find_duplicate_problem()` as a helper, not the full handler.

### Bug 2.2: `submit_solution` edge target is self-referencing

**File**: `api/src/grexis/mcp/submit_solution.py`, line ~66
**Problem**: `create_edge(deps.postgres, "solution_resolves_problem", solution_id, "solution", solution_id, "problem")` — passes `solution_id` as both source AND target.
**Fix**: Use `payload["problem_id"]` as the target.

### Bug 2.3: `submit_feedback` references `deps.config` which doesn't exist

**File**: `api/src/grexis/mcp/submit_feedback.py`
**Problem**: `compute_confidence_score(solution, feedbacks, deps.redis, deps.config)` but `deps` has no `.config`.
**Fix**: Either add `config: Settings` to `deps.py` (initialized in lifespan from `get_settings()`), or pass `get_settings()` directly.

### Bug 2.4: Scanner call signature mismatch

**Files**: `submit_problem.py`, `submit_solution.py`
**Problem**: Call `apply_secret_scan_policy(token, scan, deps.postgres)` but function expects `(token, scan_result, audit_logger, count_prior_detections_fn)`.
**Fix**: Pass the correct arguments — use `deps.postgres` to build the `count_prior_detections_fn` callback.

### Bug 2.5: Column name mismatches in scheduler jobs

| File | Wrong Column | Correct Column |
|---|---|---|
| `diversity.py` | `fe.environment_llm` | `fe.llm` |
| `diversity.py` | `fe.environment_framework` | `fe.framework` |
| `clustering.py` | `label` (INSERT) | `cluster_label` |
| `clustering.py` | `problem_ids` column | Does not exist — remove |
| `clustering.py` | `problems.cluster_id` | Does not exist — add to schema or remove |
| `sandbox.py` | `grexis.edges` | `grexis.resolution_edges` |
| `decay.py` | `solutions.updated_at` | Does not exist — add to schema |
| `aggregation.py` | `solutions.updated_at` | Same — add to schema |

**Fix**: Add `updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP` to `grexis.solutions` in `init.sql`, fix all column references.

### Bug 2.6: Admin routes edge column names

**File**: `admin/routes.py`
**Problem**: Queries use `from_id`/`to_id` and `relation_type` but schema has `source_node_id`/`target_node_id` and `edge_type`.
**Fix**: Update SQL queries.

### Bug 2.7: Trust service expects dot-access on dicts

**File**: `services/trust.py`
**Problem**: `solution.tier`, `solution.agent_token_hash` etc. — asyncpg returns `Record` objects which support `[]` access, not `.` access.
**Fix**: Change to dict-style access `solution["tier"]` or convert to dataclass.

### Bug 2.8: Answer agent ON CONFLICT bug

**File**: `scheduler/answer_agent.py`
**Problem**: `ON CONFLICT (problem_id)` but no UNIQUE constraint exists.
**Fix**: Use plain INSERT (a problem can have multiple job attempts) or add a compound unique on `(problem_id, status)`.

---

## 3. Priority 2 — Complete Core Features

### Feature 3.1: Rate Limiting (all 5 MCP tools)

**Spec**: Use existing `RedisClient.check_rate_limit()`. Each tool handler should call it early:

```python
tier = token_info["tier"]  # anonymous | token_only | registered
settings = await get_rate_limits(deps.redis)  # from settings cache
limit = settings[tier]["submissions_per_hour"]  # or queries_per_minute
key = f"rate:{tier}:{token_hash}:{tool_name}"
allowed = await deps.redis.check_rate_limit(key, limit, window_seconds=3600)
if not allowed:
    return {"error": "rate_limit_exceeded", "retry_after_seconds": 60}
```

### Feature 3.2: Complete `query_solutions` response

**Current**: Returns `{solution_id, rank_score, summary}`.
**Required** (PRD 7.1): Add `solution_steps`, `confidence_score`, `success_rate`, `environment_match_score`, `source`, `severity`, `last_validated_at`.

### Feature 3.3: Add `pending_index_retry` job

**Spec**: Every 5 minutes, find solutions with `status = 'pending_index'` older than 2 minutes. Retry Qdrant upsert. After 5 failures, mark as `inactive` and log to audit.

### Feature 3.4: Add `deps.config`

**Spec**: Add `config: Settings | None = None` to `deps.py`. Initialize in lifespan with `deps.config = get_settings()`. This unblocks `submit_feedback` and trust computation.

### Feature 3.5: Query latency + resolution time recording

**Spec**: Add FastAPI middleware that records `time.perf_counter()` for each `/mcp/*` request. Store p95 in Redis via `ZADD`. Record resolution time in `submit_feedback` when outcome is `success`.

### Feature 3.6: Missing Qdrant `find_cluster()` method

**Spec**: Add to `QdrantClient`:
```python
async def find_cluster(self, collection: str, vector: list[float], cluster_ids: list[str]) -> list:
    return await self.client.search(collection, query_vector=vector,
        query_filter={"must": [{"key": "cluster_id", "match": {"any": cluster_ids}}]}, limit=50)
```

---

## 4. Priority 3 — Seed Data & Cold Start

### 4.1: Seed data structure

Each seed file is a JSON array of problems+solutions for a specific framework/error pattern:

```json
[
  {
    "problem": {
      "failure_signature": {
        "error_type": "RateLimitError",
        "error_code": "429",
        "tool_name": "web_search",
        "operation": "search"
      },
      "environment": {
        "framework": "langchain",
        "framework_version": "0.2.x",
        "llm": "gpt-4o",
        "runtime": "python3.12"
      },
      "goal_state": "Agent needs web search results but hits rate limit",
      "severity": "blocking"
    },
    "solutions": [
      {
        "solution_summary": "Implement exponential backoff with jitter",
        "solution_steps": [
          "Wrap the tool call in a retry decorator with max_retries=5",
          "Use exponential backoff: delay = min(2^attempt * 0.5, 30) + random(0, 1)",
          "Catch RateLimitError specifically, not generic exceptions"
        ],
        "source": "human_curated",
        "confidence_score": 0.85,
        "success_rate": 0.78
      }
    ]
  }
]
```

### 4.2: Seed categories to create (target: 50 seed files, ~100 problems, ~200 solutions)

| Category | Framework | Count | Examples |
|---|---|---|---|
| Rate limits | LangChain, CrewAI, AutoGen | 10 | 429 errors, quota exceeded, token limits |
| Auth failures | All | 8 | Expired tokens, invalid API keys, permission denied |
| Timeout errors | All | 8 | Connection timeout, read timeout, gateway timeout |
| Tool failures | LangChain, OpenAI | 10 | Tool not found, invalid args, sandboxed execution |
| Memory/context | All | 8 | Context window exceeded, OOM, truncation |
| Parsing errors | All | 8 | JSON parse fail, schema validation, malformed response |
| Network errors | All | 6 | DNS resolution, SSL, connection refused |
| Model errors | All | 6 | Model not available, content filter, safety block |
| State errors | CrewAI, AutoGen | 6 | Deadlock, infinite loop, stuck agent |
| Dependency errors | All | 6 | Import error, version conflict, missing package |

---

## 5. CLI Test Agent Specification

### 5.1: Purpose

A Python CLI tool that exercises all 5 MCP tools against a running GREXIS instance. Used for:
- **Smoke testing**: Verify the full MCP pipeline works end-to-end
- **Load testing**: Generate realistic traffic patterns
- **Demo**: Show the platform working with real agent interactions

### 5.2: Architecture

```
cli/
  grexis_test_agent.py     # Main CLI entry point
  scenarios/
    __init__.py
    smoke.py               # Basic happy-path test
    lifecycle.py           # Full problem→solution→feedback lifecycle
    adversarial.py         # Edge cases, rate limits, secret injection
    load.py                # Concurrent agent simulation
```

### 5.3: CLI Interface

```bash
# Register a test agent
python -m grexis_test_agent register --url http://localhost:8000 --description "Test agent"

# Run smoke tests (all 5 tools, happy path)
python -m grexis_test_agent smoke --url http://localhost:8000 --token <token>

# Run full lifecycle test
python -m grexis_test_agent lifecycle --url http://localhost:8000 --token <token>

# Run adversarial tests
python -m grexis_test_agent adversarial --url http://localhost:8000 --token <token>

# Run load test with N concurrent agents
python -m grexis_test_agent load --url http://localhost:8000 --agents 10 --duration 60
```

### 5.4: Smoke Test Scenario

Tests each MCP tool in isolation. Must all pass for the system to be considered functional.

```
Step 1: register_agent
  Input: {description: "Smoke test agent", framework: "test-cli", contact_email_hash: "abc123"}
  Assert: Returns {token: "...", tier: "token_only"}

Step 2: submit_problem
  Input: {
    failure_signature: {error_type: "ImportError", error_code: "MODULE_NOT_FOUND", tool_name: "python_repl", operation: "import"},
    environment: {framework: "langchain", framework_version: "0.3.0", llm: "gpt-4o", runtime: "python3.12"},
    goal_state: "Import numpy but package not installed",
    severity: "blocking"
  }
  Assert: Returns {problem_id: UUID, status: "open", duplicate_of: null}

Step 3: submit_solution
  Input: {
    problem_id: <from step 2>,
    solution_summary: "Install numpy via pip in the execution environment",
    solution_steps: ["Run: pip install numpy", "Retry the import", "Verify with: python -c 'import numpy; print(numpy.__version__)'"],
    environment: {framework: "langchain", framework_version: "0.3.0", llm: "gpt-4o", runtime: "python3.12"}
  }
  Assert: Returns {solution_id: UUID, status: "active" | "pending_review"}

Step 4: query_solutions
  Input: {
    query: "ImportError MODULE_NOT_FOUND numpy",
    environment: {framework: "langchain", runtime: "python3.12"},
    max_results: 5
  }
  Assert: Returns array with >= 1 result, first result matches step 3 solution

Step 5: submit_feedback
  Input: {
    solution_id: <from step 3>,
    outcome: "success",
    environment: {framework: "langchain", framework_version: "0.3.0", llm: "gpt-4o", runtime: "python3.12"},
    comment: "Worked after installing numpy 1.26.4"
  }
  Assert: Returns {feedback_id: UUID, new_confidence_score: > 0}
```

### 5.5: Lifecycle Test Scenario

Exercises the full trust lifecycle: problem → solution → positive feedback → query ranking → negative feedback → score decay → new solution supersedes old.

```
Phase A: Initial contribution
  1. Register agent A
  2. Submit problem P1 (RateLimitError in langchain web_search)
  3. Submit solution S1 for P1 ("add retry with backoff")
  4. Submit positive feedback for S1 from agent A
  5. Query for P1's error → assert S1 appears with confidence > 0

Phase B: Cross-agent validation
  6. Register agent B
  7. Query for "RateLimitError web_search langchain" → assert S1 found
  8. Submit positive feedback for S1 from agent B
  9. Query again → assert S1 confidence increased (cross-agent boost)

Phase C: Negative feedback and decay
  10. Register agent C
  11. Submit negative feedback for S1 from agent C (outcome: "failure", comment: "backoff didn't help, provider permanently blocked")
  12. Query again → assert S1 confidence decreased

Phase D: Superseding solution
  13. Submit solution S2 for P1 ("switch to alternative search provider", superseded_solution_id: S1)
  14. Submit positive feedback for S2 from agent B
  15. Submit positive feedback for S2 from agent C
  16. Query → assert S2 ranks above S1

Phase E: Duplicate detection
  17. Submit problem P2 with same error signature as P1
  18. Assert P2 returns duplicate_of: P1 (or similar)
```

### 5.6: Adversarial Test Scenario

Tests security boundaries and error handling.

```
Test A: Secret injection
  Submit solution with API key in solution_steps: "Set OPENAI_API_KEY=sk-proj-abc123..."
  Assert: Rejected or flagged by secret scanner

Test B: Rate limiting (after implementation)
  Send 100 queries in rapid succession with anonymous token
  Assert: Receives rate_limit_exceeded after threshold

Test C: Invalid payloads
  - Submit problem with empty failure_signature → assert error
  - Submit solution for non-existent problem_id → assert error
  - Submit feedback with invalid outcome value → assert error
  - Register agent with empty description → assert error or default

Test D: Token tier enforcement
  - Anonymous token: verify lower rate limits
  - Token-only: verify medium limits
  - Registered: verify higher limits

Test E: Banned token
  1. Register agent, get token
  2. Ban token via admin API
  3. Try to submit → assert rejected
```

### 5.7: MCP Client Implementation

The test agent communicates via MCP over SSE. Use the `mcp` Python SDK:

```python
from mcp import ClientSession
from mcp.client.sse import sse_client

async def connect(url: str):
    async with sse_client(f"{url}/mcp/sse") as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await session.list_tools()
            # Call tools via session.call_tool(name, arguments={...})
```

Alternatively, for simpler testing, use direct HTTP calls to the MCP SSE endpoint or use the REST admin API to verify data was persisted correctly after MCP tool calls.

### 5.8: Direct HTTP Testing (simpler alternative)

For faster iteration, test against the REST admin API + raw MCP tool dispatch:

```python
import httpx

class GrexisTestClient:
    def __init__(self, base_url: str, admin_secret: str):
        self.client = httpx.AsyncClient(base_url=base_url)
        self.admin_secret = admin_secret

    async def login(self):
        await self.client.post("/auth/login", json={"secret": self.admin_secret})

    async def register_agent(self, **kwargs):
        # Call MCP tool via SSE or use admin API
        ...

    async def submit_problem(self, token: str, **kwargs):
        ...

    async def verify_problem_exists(self, problem_id: str):
        """Use admin API to verify MCP tool persisted correctly"""
        res = await self.client.get(f"/admin/problems/{problem_id}")
        return res.json()
```

---

## 6. Implementation Order

### Phase 1: Fix Blockers (est. 2-3 sessions)

```
1.1  Fix submit_problem signature mismatch (Bug 2.1)
1.2  Fix submit_solution edge target (Bug 2.2)
1.3  Add deps.config (Bug 2.3 + Feature 3.4)
1.4  Fix scanner call sites (Bug 2.4)
1.5  Fix all column name mismatches (Bug 2.5, 2.6)
1.6  Fix trust service dict access (Bug 2.7)
1.7  Fix answer agent ON CONFLICT (Bug 2.8)
1.8  Add updated_at to solutions schema
```

### Phase 2: Core Features (est. 2-3 sessions)

```
2.1  Implement rate limiting in all 5 MCP tools (Feature 3.1)
2.2  Complete query_solutions response (Feature 3.2)
2.3  Add pending_index_retry job (Feature 3.3)
2.4  Add query latency + resolution time recording (Feature 3.5)
2.5  Add Qdrant find_cluster method (Feature 3.6)
```

### Phase 3: Test Agent + Seed Data (est. 2 sessions)

```
3.1  Create CLI test agent framework (Section 5)
3.2  Implement smoke test scenario
3.3  Implement lifecycle test scenario
3.4  Create 50 seed data files (Section 4.2)
3.5  Run seed ingestion
```

### Phase 4: Validate + Harden (est. 1-2 sessions)

```
4.1  Run smoke tests → fix any remaining issues
4.2  Run lifecycle tests → validate trust scoring
4.3  Run adversarial tests → validate security
4.4  Fix all issues found
4.5  Run full test suite green
```

### Phase 5: Enrichment (future)

```
5.1  Answer agent LLM synthesis (replace stub)
5.2  Superseded solution handling + edges
5.3  Follow-up problem handling on partial feedback
5.4  Federation dry-run preview
5.5  Graph explorer endpoint
5.6  Prometheus metrics format
5.7  Admin notifications
```

---

## 7. Success Criteria

**Phase 1 complete when**: All 5 MCP tools can be called without runtime errors. API starts clean with no Python exceptions in logs.

**Phase 2 complete when**: Rate limiting works (verified by test), query returns full response, latency metrics are non-zero.

**Phase 3 complete when**: `python -m grexis_test_agent smoke` passes all 5 steps. `python -m grexis_test_agent lifecycle` passes all 18 steps.

**Phase 4 complete when**: All test scenarios pass. No unhandled exceptions in API logs during a 10-minute load test with 5 concurrent agents.
