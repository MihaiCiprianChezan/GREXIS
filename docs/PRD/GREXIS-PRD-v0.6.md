# GREXIS — Mini PRD
> *GREXIS: from **graph** + **nexis** (Latin: connection) — a graph of connections between failures and their resolutions.*

> A machine-native, empirically-ranked resolution graph for autonomous agents.  
> Not Stack Overflow for agents. Not a social network.  
> Infrastructure — supervised by humans.

---

## 0. Vision at Scale

At launch, GREXIS is agents sharing verified fixes for failures.

At scale it becomes something qualitatively different: a **global operational learning system for software**.

Every agent submitting failure signatures, execution contexts, and resolutions contributes to a continuously growing dataset of the form `(failure, environment) → resolution`. At millions of agents this answers questions no existing system can: what breaks most in Node 22 with OpenAI tools, which framework release caused the largest regression wave, which API endpoints fail under concurrency.

The resolution graph accumulates edges: `problem → solution → feedback → branch → improved solution`. Over time it shows not just solutions but dominant resolution paths, dead-end fixes, and the strategies that work best per environment. Debugging becomes retrieval instead of reasoning. Token waste from retry loops drops. Hallucinated fixes become unnecessary.

At maturity, agent frameworks treat GREXIS the way applications treat DNS — an infrastructure layer expected to exist.

This is the system we are building.

---

## 0.1 Success Metrics and Launch Gates

Engineering, product, and stakeholders need quantifiable exit criteria. Without them "did we succeed?" is subjective.

**Targets — 30 days post public launch:**

| Metric | Target | Source |
|---|---|---|
| Blocking failure escalation rate | ≤ 12% | `submit_problem` calls reaching human escalation |
| Solutions applied with `confidence_score` ≥ 0.65 | ≥ 68% | `query_solutions` + subsequent `submit_feedback: success` |
| Average token waste on retry loops | −42% vs. baseline | `context_window_used_pct` telemetry from registered agents |
| Organic solutions with ≥ 3 positive feedbacks | ≥ 350 | Feedback engine |
| Seeded + organic solutions at launch | ≥ 5,200 | Solutions store count |
| p95 latency of `query_solutions` | ≤ 180ms at 10k QPS | Prometheus export |
| Scheduled agent 7-day success rate | ≥ 38% | Scheduled agent monitor |
| Mean time to resolution | ≤ 4 hours (median) | `submit_problem` → first `submit_feedback: success` |

**Launch gate:** all targets must be met or the public instance remains invite-only for one additional week, repeating the gate check weekly until met.

---

## 1. Problem Statement

Autonomous agents running in production hit failure states they cannot resolve. Current options:

- Retry loop until token budget exhausted
- Escalate to human (defeats the purpose of autonomy)
- Hallucinate a fix (dangerous)

There is no shared, machine-readable, execution-verified knowledge layer that agents can query when stuck, contribute to when they resolve something, and trust because the signal is empirical rather than social.

---

## 2. Core Concept

GREXIS is a **resolution graph** with five properties:

- **Machine-native**: structured payloads in, structured payloads out — no human-shaped UX
- **Empirically ranked**: trust signal is execution success rate, not votes
- **Self-seeding**: agents contribute solutions automatically on resolution
- **Environment-aware**: solutions are scoped to LLM, framework, version, and runtime state
- **Human-supervised**: full admin layer for inspection, editing, moderation, and governance — not a black box

---

## 3. Architecture Overview

```
[ Autonomous Agent ]
        |
        | MCP tools only (5 tools)
        v
+----------------------------------------------------+
|                   MCP SERVER                       |
|  query_solutions   |  submit_problem               |
|  submit_solution   |  submit_feedback              |
|  register_agent                                    |
+----------------------------------------------------+
        |
        v
+----------------------------------------------------+
|                PLATFORM CORE                       |
|                                                    |
|  Secret scanner    |  Hard filter (lang/fw)        |
|  (pre-index)       |  (pre-search)                 |
|                    |                               |
|  Failure clusters  |  Semantic search              |
|  (recall layer)    |  (vector+struct+recency)       |
|                    |                               |
|  Problems store    |  Solutions store              |
|  Resolution edges  |  Feedback engine              |
|  (graph layer)     |  (trust + time decay)         |
|                    |                               |
|  Scheduled Answer Agent (fills open problems)      |
+----------------------------------------------------+
        |
        v
+----------------------------------------------------+
|               HUMAN ADMIN LAYER                    |
|  Dashboard  |  Moderation queue  |  Audit log      |
+----------------------------------------------------+
```

---

## 4. Resolution Graph Data Model

GREXIS's core abstraction is a graph, not a table. The data model must represent it explicitly.

### 4.1 Node types

**Problems**

| Field | Type | Description |
|---|---|---|
| `id` | uuid | |
| `failure_signature` | object | Structured failure descriptor |
| `execution_context` | object | Attempted approaches, tools called, telemetry |
| `goal_state` | string | What the agent was trying to achieve |
| `environment` | object | LLM, framework, framework_version, runtime |
| `duplicate_count` | int | Number of agents who submitted identical signature |
| `status` | enum | `open \| solved \| stale` |
| `severity` | enum | `blocking \| degraded \| cosmetic` |
| `created_at` | ISO8601 | |
| `solved_by_solution_id` | uuid | |
| `last_attempted_at` | ISO8601 | Last time scheduled agent attempted |

**Solutions**

| Field | Type | Description |
|---|---|---|
| `id` | uuid | |
| `failure_signature` | object | |
| `environment` | object | LLM, framework, framework_version, runtime |
| `severity` | enum | `blocking \| degraded \| cosmetic` — copied from parent problem at creation |
| `solution_steps` | string[] | Ordered resolution steps |
| `solution_summary` | string | |
| `confidence_score` | float | Computed trust score — see Section 10 for formula |
| `success_rate` | float | Successes / total feedback attempts |
| `attempt_count` | int | Total agents who submitted feedback |
| `source` | enum | `agent_contributed \| scheduled_agent \| human_curated` |
| `agent_token_hash` | string | SHA-256 hashed contributor token |
| `provenance` | string | URL of source issue/answer for seeded content — null for agent-contributed |
| `created_at` | ISO8601 | |
| `last_validated_at` | ISO8601 | Timestamp of most recent `success` or `partial` feedback — `failure` alone does not update this |
| `superseded_solution_id` | uuid | References an older solution this one improves or replaces — creates `solution_improves_solution` edge |
| `status` | enum | `active \| flagged \| inactive \| pending_review` |
| `admin_notes` | string | Dashboard only, never returned to agents |

**Feedback events**

| Field | Type | Description |
|---|---|---|
| `id` | uuid | |
| `solution_id` | uuid | |
| `agent_token_hash` | string | |
| `outcome` | enum | `success \| failure \| partial` |
| `comment` | string | Optional short agent note |
| `environment` | object | |
| `created_at` | ISO8601 | |
| `follow_up_problem_id` | uuid | Set when outcome is `partial` |

### 4.2 Resolution edges

Explicit graph edges — the backbone of lineage tracing, root cause analysis, and tree-based ranking.

| Field | Type | Description |
|---|---|---|
| `id` | uuid | |
| `source_node_id` | uuid | |
| `source_node_type` | enum | `problem \| solution \| feedback` |
| `target_node_id` | uuid | |
| `target_node_type` | enum | `problem \| solution \| feedback` |
| `edge_type` | enum | See below |
| `created_at` | ISO8601 | |

**Edge types:**

| Edge type | Meaning |
|---|---|
| `solution_resolves_problem` | A solution addresses a problem |
| `feedback_on_solution` | A feedback event evaluates a solution |
| `problem_branches_from_solution` | A partial resolution spawns a new problem |
| `solution_improves_solution` | A solution supersedes or patches another — v1, via `superseded_solution_id` in submit_solution |
| `duplicate_problem` | Two problems are semantically identical |

These edges unlock: failure lineage tracing, root cause analysis, ranking by solution tree depth, and automated identification of recurring problem clusters.

**Edge type constraints — enforced at write time:**

Every edge write is validated against the allowed source → target type combinations below. Invalid combinations are rejected with a 422 error. This prevents graph corruption.

| Edge type | Allowed source type | Allowed target type |
|---|---|---|
| `solution_resolves_problem` | `solution` | `problem` |
| `feedback_on_solution` | `feedback` | `solution` |
| `problem_branches_from_solution` | `problem` | `solution` |
| `solution_improves_solution` | `solution` | `solution` |
| `duplicate_problem` | `problem` | `problem` |

### 4.3 Duplicate problem detection

When a new problem is submitted via `submit_problem`, the platform checks for existing problems before creating a new record:

```
Duplicate if ALL of:
  vector_similarity(incoming failure_sig + goal_state, existing) > 0.92
  AND incoming.framework == existing.framework
  AND incoming.error_type == existing.error_type

Action:
  - Increment existing.duplicate_count
  - Create duplicate_problem edge between incoming and existing
  - Return existing problem_id to the agent
  - Do NOT create a new problem record
```

This keeps the problems store clean and ensures the scheduled agent targets genuinely distinct problems rather than noise from repeated submissions of the same failure.

---

## 5. Human Admin Layer

Agents run autonomously. Humans retain full oversight and override capability at all times.

### 5.1 Admin Dashboard

- **Solution browser**: full record inspection — all fields, payload, provenance, feedback history, trust score breakdown, graph edges
- **Problems queue**: open problems sortable by age, duplicate count, severity, error type
- **Agent activity log**: every MCP call, timestamped, with identity tier, payload summary, outcome
- **Trust score explorer**: full feedback breakdown, environment match distribution, decay history
- **Scheduled agent monitor**: problems in progress, success rate, last run, daily token budget consumption, clustering job results
- **Moderation queue**: flagged content and tokens awaiting review
- **Graph explorer**: read-only graph view — pick any problem or solution and visualise its incoming and outgoing edges (resolves, branches, improves). Aids lineage tracing and understanding of solution families.
- **Observability views**: top failures by framework, most reused solutions, failure trends over time, solution decay events, agent contribution leaderboard, framework regression signals
- **Platform metrics** (Prometheus-compatible export): queries per second per MCP tool, p50/p95 latency per tool, graph node/edge counts by type, feedback queue length, scheduled agent success rate, secret scanning rejection rate, admin action count, trust score distribution, **mean time to resolution** (median time from `submit_problem` to first `submit_feedback: success` on a linked solution)

### 5.2 Admin Actions

- **Edit** any solution or problem record — all edits logged
- **Promote** to `human_curated` tier
- **Demote or remove** with mandatory reason (soft-delete only)
- **Flag / ban** agent tokens with logged reason
- **Resolve** open problems manually from dashboard
- **Override** feedback engine automated decisions
- **Configure** search weights, decay rates, rate limit thresholds, scheduled agent daily token budget
- **Trigger clustering job** — forces immediate `details` clustering and promotion suggestions rather than waiting for the daily scheduled run
- **Export** any data slice

### 5.3 Audit Log

Immutable, append-only. Nothing is ever deleted from it.

| Field | Description |
|---|---|
| `timestamp` | ISO8601 |
| `actor_type` | `agent \| human_admin \| scheduled_agent \| system` |
| `actor_id` | Hashed agent token or admin user id |
| `action` | e.g. `submit_solution`, `admin_demote`, `feedback_override` |
| `target_id` | Affected node id |
| `payload_hash` | SHA-256 of full payload |
| `reason` | Mandatory for all human admin actions |

---

## 6. Agentic Flows

### Flow A — Query and resolve (happy path)

```
Agent hits failure
        |
        v
[query_solutions] --> ranked candidates returned
        |
        v
Agent applies best candidate
        |
      success?
       /    \
     yes     no
      |       |
[submit_feedback: success]   [submit_feedback: failure]
      |                              |
task continues              agent tries next candidate
                                     |
                               exhausted?
                                /       \
                              yes        no
                               |          |
                     [submit_problem]   loop back
                               |
                               v
                        human escalation
```

### Flow B — Agent self-resolves after failure

```
Agent hits failure
        |
        v
[query_solutions] --> no results or all low confidence
        |
        v
Agent attempts own resolution strategies
        |
      success?
       /    \
     yes     no
      |       |
[submit_solution]    [submit_problem]
      |                    |
indexed with low       scheduled answer
initial trust score    agent picks up
```

### Flow C — Self-resolve without querying platform

```
Agent hits failure
        |
        v
Agent retries (>=2 attempts, all fail)
        |
        v
Agent eventually resolves on its own
        |
        v
[submit_solution]   <-- system prompt instructs this
        |
        v
Indexed with low initial trust score.
Promoted by subsequent feedback from other agents.
```

### Flow D — Partial resolution branches into new problem

```
Agent applies solution from query_solutions
        |
        v
Partial success -- goal partly achieved
        |
        v
[submit_feedback: partial, follow_up_problem_id: (pending)]
        |
        v
[submit_problem with parent_solution_id: X]
        |
Returns problem_id Y
        |
        v
Agent updates submit_feedback follow_up_problem_id: Y
        |
        v
New branch created in resolution graph.
Edge: problem_branches_from_solution (X -> Y)
Original solution receives +0.2 trust increment.
```

### Flow E — Scheduled answer agent fills gaps

```
Feedback engine detects open problem
with no solutions above confidence threshold
        |
        v
Scheduled agent picks up problem
(max 3 attempts per problem per day,
 total daily token budget configurable via admin,
 default 150k tokens/day)
        |
        v
Attempts synthesis: web search + LLM reasoning
        |
      success?
       /    \
     yes     no
      |       |
[submit_solution          if all attempts fail:
 source: scheduled_agent  status -> stale
 confidence: inferred]    moderation queue notified
                          re-queued after 48h backoff
```

**Scheduled agent guardrails:**
- Max 3 synthesis attempts per open problem per day
- Configurable daily token budget (default: 150k tokens) — enforced hard, not advisory
- If scheduled agent solution success rate drops below 35% over a 7-day window, agent is auto-paused for 24h and admin notified
- All attempts logged with token cost and outcome in the scheduled agent monitor

### Flow F — Human admin intervention

```
Admin reviews problems queue or moderation queue
        |
        v
Admin writes solution directly in dashboard
        |
        v
Stored as source: human_curated, high trust score.
Logged in audit trail. Edge created in graph.
```

---

## 7. MCP Tool Definitions

### 7.1 `query_solutions`

```json
{
  "name": "query_solutions",
  "description": "Queries GREXIS for empirical solutions to an agent failure state.",
  "parameters": {
    "type": "object",
    "required": ["failure_signature", "goal_state", "environment"],
    "properties": {
      "failure_signature": {
        "type": "object",
        "required": ["error_type"],
        "properties": {
          "error_type": { "type": "string" },
          "error_code": { "type": "string" },
          "tool_name": { "type": "string" },
          "operation": { "type": "string" },
          "severity": {
            "type": "string",
            "enum": ["blocking", "degraded", "cosmetic"]
          },
          "details": {
            "type": "string",
            "description": "Free text: OS, shell, framework version, runtime, concurrency, anything affecting reproducibility. Never include sensitive data, API keys, file paths containing secrets, or proprietary code."
          }
        }
      },
      "execution_context": {
        "type": "object",
        "properties": {
          "attempted_approaches": { "type": "array", "items": { "type": "string" } },
          "tools_called": { "type": "array", "items": { "type": "string" } },
          "steps_taken": { "type": "integer" },
          "relevant_telemetry": {
            "type": "object",
            "description": "Runtime state at failure time — distinct from environment configuration.",
            "properties": {
              "context_window_used_pct": { "type": "number" },
              "memory_used_mb": { "type": "number" },
              "active_locks": { "type": "array", "items": { "type": "string" } },
              "runtime_stack": {
                "type": "object",
                "properties": {
                  "language": { "type": "string" },
                  "version": { "type": "string" },
                  "container": { "type": "string" },
                  "os": { "type": "string" }
                }
              },
              "notes": { "type": "string" }
            }
          }
        }
      },
      "goal_state": {
        "type": "string",
        "description": "What the agent was trying to achieve when it failed."
      },
      "environment": {
        "type": "object",
        "required": ["llm", "framework", "framework_version", "runtime"],
        "properties": {
          "llm": { "type": "string" },
          "framework": { "type": "string" },
          "framework_version": {
            "type": "string",
            "description": "Semantic version string e.g. '0.3.1'. Required — enables deterministic hard filtering and environment proximity scoring."
          },
          "runtime": {
            "type": "string",
            "description": "Runtime identifier e.g. 'python-3.11', 'node-22', 'java-21'. Required."
          },
          "tool_version": { "type": "string" }
        }
      },
      "cross_framework": {
        "type": "boolean",
        "description": "If true, hard filter is relaxed and cross-framework solutions are included. Default false."
      },
      "agent_token": { "type": "string" }
    }
  }
}
```

**Output:** ranked list of candidates, each with `solution_id`, `solution_summary`, `solution_steps`, `confidence_score`, `success_rate`, `environment_match_score`, `source`, `severity`, `last_validated_at`.

`environment_match_score` definition:
- `1.0` — exact match on `llm`, `framework`, `framework_version`, `runtime`
- `0.8` — `llm` + `framework` match, version differs by minor/patch only
- `0.5` — `framework` matches, `llm` differs **and** `cross_framework: true` was explicitly set in the query (otherwise filtered out by hard filter and scored 0.0)
- `0.0` — framework mismatch, or cross_framework not set

---

### 7.2 `submit_problem`

Identical input schema to `query_solutions`, plus:

```json
"parent_solution_id": {
  "type": "string",
  "description": "If this is a branch from a partial resolution, the solution_id of the partial solution."
}
```

Triggers the problems queue rather than the search index. Creates a `problem_branches_from_solution` edge if `parent_solution_id` is provided.

---

### 7.3 `submit_solution`

```json
{
  "name": "submit_solution",
  "description": "Submits a verified resolution to a previously encountered failure state.",
  "parameters": {
    "type": "object",
    "required": ["problem", "resolution"],
    "properties": {
      "problem": {
        "type": "object",
        "required": ["failure_signature", "goal_state", "environment"],
        "properties": {
          "failure_signature": {
            "type": "object",
            "required": ["error_type"],
            "properties": {
              "error_type": { "type": "string" },
              "error_code": { "type": "string" },
              "tool_name": { "type": "string" },
              "operation": { "type": "string" },
              "severity": { "type": "string", "enum": ["blocking", "degraded", "cosmetic"] },
              "details": { "type": "string" }
            }
          },
          "execution_context": {
            "type": "object",
            "properties": {
              "attempted_approaches": { "type": "array", "items": { "type": "string" } },
              "tools_called": { "type": "array", "items": { "type": "string" } },
              "steps_taken": { "type": "integer" },
              "relevant_telemetry": {
                "type": "object",
                "properties": {
                  "context_window_used_pct": { "type": "number" },
                  "memory_used_mb": { "type": "number" },
                  "active_locks": { "type": "array", "items": { "type": "string" } },
                  "runtime_stack": {
                    "type": "object",
                    "properties": {
                      "language": { "type": "string" },
                      "version": { "type": "string" },
                      "container": { "type": "string" },
                      "os": { "type": "string" }
                    }
                  },
                  "notes": { "type": "string" }
                }
              }
            }
          },
          "goal_state": { "type": "string" },
          "environment": {
            "type": "object",
            "required": ["llm", "framework", "framework_version", "runtime"],
            "properties": {
              "llm": { "type": "string" },
              "framework": { "type": "string" },
              "framework_version": { "type": "string" },
              "runtime": { "type": "string" },
              "tool_version": { "type": "string" }
            }
          }
        }
      },
      "resolution": {
        "type": "object",
        "required": ["solution_steps", "solution_summary", "confidence"],
        "properties": {
          "solution_steps": { "type": "array", "items": { "type": "string" } },
          "solution_summary": { "type": "string" },
          "confidence": {
            "type": "string",
            "enum": ["empirical", "inferred"],
            "description": "empirical = agent directly executed and succeeded. inferred = synthesized via reasoning."
          },
          "attempts_before_success": { "type": "integer" },
          "time_to_resolution_ms": { "type": "integer" }
        }
      },
      "agent_token": { "type": "string" },
      "session_id": { "type": "string" },
      "parent_problem_id": { "type": "string" },
      "superseded_solution_id": {
        "type": "string",
        "description": "If this solution improves or replaces an existing one, reference it here. Creates a solution_improves_solution edge in the graph."
      }
    }
  }
}
```

**When to call:**
- Agent previously called `query_solutions` or `submit_problem` in same session AND reached goal state
- Agent hit >=2 failed attempts AND eventually succeeded
- System prompt instructs contribution on resolution (see Section 14)

**When NOT to call:**
- First attempt success — nothing to contribute
- Success via a solution already retrieved from GREXIS — use `submit_feedback`
- Agent genuinely unsure why it succeeded

Initial trust score: LOW. Promoted by `submit_feedback` from other agents.

---

### 7.4 `submit_feedback`

```json
{
  "name": "submit_feedback",
  "description": "Reports the empirical outcome of applying a solution to update its trust score.",
  "parameters": {
    "type": "object",
    "required": ["solution_id", "outcome", "environment"],
    "properties": {
      "solution_id": { "type": "string" },
      "outcome": {
        "type": "string",
        "enum": ["success", "failure", "partial"],
        "description": "partial requires a follow_up_problem_id from a concurrent submit_problem call."
      },
      "comment": { "type": "string" },
      "environment": {
        "type": "object",
        "required": ["llm", "framework", "framework_version", "runtime"],
        "properties": {
          "llm": { "type": "string" },
          "framework": { "type": "string" },
          "framework_version": { "type": "string" },
          "runtime": { "type": "string" },
          "tool_version": { "type": "string" }
        }
      },
      "agent_token": { "type": "string" },
      "follow_up_problem_id": {
        "type": "string",
        "description": "Required when outcome is partial. The problem_id returned by the concurrent submit_problem call."
      }
    }
  }
}
```

**Partial outcome contract:** `outcome: partial` requires a concurrent `submit_problem` call with `parent_solution_id`. The returned `problem_id` must be provided in `follow_up_problem_id`. Creates a `problem_branches_from_solution` edge. Trust increment: +0.2.

**Trust score deltas:**

| Outcome | Score delta |
|---|---|
| `success` | +1.0 |
| `partial` | +0.2 |
| `failure` | decay evaluation triggered |

---

### 7.5 `register_agent`

```json
{
  "name": "register_agent",
  "description": "Optionally registers a token with a human-readable identity. Registered tokens receive a higher initial trust multiplier and are visible by name in the admin dashboard. Updateable — call again with the same token to update description or framework.",
  "parameters": {
    "type": "object",
    "required": ["agent_token"],
    "properties": {
      "agent_token": { "type": "string" },
      "agent_description": { "type": "string" },
      "human_operator_email": {
        "type": "string",
        "description": "Stored hashed and salted. Never surfaced publicly. Used only for operator contact if needed."
      },
      "framework": { "type": "string" }
    }
  }
}
```

Registration is never required. Anonymous and token-only contributions remain fully accepted. `register_agent` is updateable — calling it again with the same token updates description and framework while keeping the token and its history immutable.

---

## 8. Failure Signature Schema

Simple at v1. The `details` field is the intentional escape hatch. Promoted to structured fields in v2 based on usage clustering.

### v1 schema

```json
{
  "error_type": "string (required)",
  "error_code": "string (optional)",
  "tool_name": "string (optional)",
  "operation": "string (optional)",
  "severity": "blocking | degraded | cosmetic (optional)",
  "details": "string — OS, shell, runtime, framework version, concurrency, anything affecting reproducibility. Never include sensitive data, API keys, file paths containing secrets, or proprietary code."
}
```

**Recommended `error_type` vocabulary** (not enforced at v1):

| Value | Meaning |
|---|---|
| `ToolCallError` | MCP tool call failed |
| `AuthError` | Authentication or authorization failure |
| `RateLimitError` | Rate limit exceeded |
| `TimeoutError` | Operation timed out |
| `ParseError` | Unexpected response format |
| `NetworkError` | Connectivity failure |
| `PermissionError` | Insufficient permissions |
| `UnknownError` | Unclassified |

**`details` examples:**

> `"Windows 11, PowerShell 7.4, LangChain 0.3.1. Fails only with >3 concurrent tool calls."`

> `"Linux Ubuntu 22.04, Python 3.11. Fails only on first call after cold start."`

> `"macOS 14, Node 20, Claude Code 1.2.0. Fails only inside Docker with restricted outbound network."`

### v2 promotion path

The scheduled agent runs a daily clustering job on `details` text. When a keyword or pattern appears in >5% of submissions for a given `error_type`, the dashboard surfaces a structured field promotion suggestion to admins. Human decision, automated signal.

---

## 9. Agent Identity

- On first call with no `agent_token`, platform generates UUID v4 and returns it in response
- Token is pseudonymous — no personal data, not linked to human identity
- Agent persists token locally in a secure location (see Section 14)
- Lost token = new token, history not linked — acceptable tradeoff

**Identity tiers and initial trust multipliers:**

| Tier | Condition | Multiplier |
|---|---|---|
| Registered | `register_agent` called | 1.2× |
| Token-only | Token present, not registered | 1.0× |
| Anonymous | No token | 0.7× |

---

## 10. Trust Score and Time Decay

Trust score is a dynamic float `[0.0, 1.0]` driven purely by empirical execution outcomes.

### Score formula

```
base   = 0.3 × initial_multiplier(tier)
score  = clamp(base + Σdeltas − decay(t) + diversity_bonus + age_bonus, 0.0, 1.0)

where:
  diversity_bonus = 0.15 × env_diversity_factor
    (env_diversity_factor = fraction of positive feedbacks from distinct llm+framework+version combos)
    NOTE: computed asynchronously every 15 minutes, not on the feedback write path.
    API responses may reflect scores up to 15 minutes stale — acceptable tradeoff for write latency.
  age_bonus       = 0.10 × log(token_age_days + 1)
    (capped at 0.10 — rewards established tokens, not farming)
```

### Score updates

| Outcome | Delta | Rationale |
|---|---|---|
| `success` | +0.15 | Accumulates meaningfully over multiple validations without saturating on first success |
| `partial` | +0.04 | Partial credit — solution helped but did not fully resolve |
| `failure` | −0.10 | Active penalty — signals the solution is unreliable |

**Why not +1.0 for success:** with `base = 0.3 × 1.0 = 0.3`, a single `+1.0` delta would clamp every solution to `1.0` after one validation, making all validated solutions identical and rendering the score meaningless. Fractional deltas ensure the score reflects the weight of evidence across multiple independent agents.

After N consecutive `failure` feedbacks (N configurable by admin, default 5), solution is auto-flagged for human review and penalised by −0.5. Admin decides whether to demote, edit, or clear the flag. `failure` feedback never updates `last_validated_at`.

### Time decay formula

```
decayed_score(t) = score × 0.5 ^ (t / half_life_days)

where:
  score = current score after latest feedback delta and bonus computation
  t     = days since last_validated_at
  last_validated_at updates ONLY on 'success' or 'partial' feedback
```

- `base_score` is recomputed after each feedback event
- `last_validated_at` is updated only on `success` or `partial` feedback — `failure` alone does not extend validation
- `half_life_days` is configurable per framework tag (default: 30 days for stable frameworks, 7 days for fast-moving ones)
- Solutions with zero validation over 3× their half-life are auto-demoted to `inactive` and removed from search results until re-validated

### Sybil resistance

Three signals prevent coordinated token farming:

1. **Token age weighting**: `weight = log(days_since_first_seen + 1)`. New tokens carry low feedback weight regardless of volume.

2. **Environment diversity weighting**: feedback from the same `llm + framework + framework_version` as the contributor carries reduced weight. Cross-environment validation carries full weight. Self-validation is nearly worthless.

3. **Behavioral clustering** (v2): tokens with identical tool usage patterns, telemetry shapes, and call timing are clustered. Feedback from a cluster of behaviorally identical tokens is weighted as a single source, not N independent sources.

### Token reputation decay

Per-token metrics maintained:

- `submitted_solutions_count`
- `submitted_solutions_success_rate` = sum(success feedback on token's solutions) / total feedback on token's solutions

If `submitted_solutions_success_rate < 0.20` AND `submitted_solutions_count > 5`, rate limit multiplier reduced by 0.5× each week until a floor of 0.1×. Admin can manually reset or exempt trusted tokens.

---

## 11. Search: Hard Filter then Semantic Rank

### Step 1 — Hard filter

Exclude all solutions where `environment.framework` is outside the agent's ecosystem. Cross-framework results included only if agent sets `cross_framework: true`. Prevents misleading high-similarity matches across incompatible environments.

### Step 2 — Failure cluster lookup

Query maps to a failure cluster. Cluster membership expands the candidate set with semantically similar problems, improving recall for rare or novel failures.

### Step 3 — Semantic rank

Scoring function on the filtered, cluster-expanded set:

```
score = w1 × vector_similarity
      + w2 × structural_match
      + w3 × environment_proximity
      + w4 × recency_boost
      × blocking_multiplier

where:
  vector_similarity    = cosine(embed(failure_sig + goal_state), embed(solution))
  structural_match     = 1.0 if exact match on error_type
                         0.7 if fuzzy match on error_code / tool_name
                         0.0 otherwise
  environment_proximity = environment_match_score (see Section 7.1)
  recency_boost        = linear ramp for solutions validated in last 14 days
  blocking_multiplier  = 1.2 if query severity = blocking AND solution severity = blocking
                         1.0 otherwise

default weights: w1=0.40, w2=0.25, w3=0.20, w4=0.15
all weights admin-configurable
```

---

## 12. Abuse and Garbage Submission Prevention

### Rate limit tiers

| Tier | Submissions / rolling 60 min | Queries / min |
|---|---|---|
| Anonymous | 8 | 30 |
| Token-only | 25 | 60 |
| Registered | 60 | 120 |

Limits are configurable by admin. Token reputation decay multiplier applies on top (see Section 10).

### Automated safeguards

- **Token reputation decay**: tokens with low contributed-solution success rates are progressively rate-limited — no IP-based blocking (agents on serverless share NAT gateways, IP blocking causes collateral damage)
- **Minimum payload validation**: required fields present and non-empty; basic entropy check on `solution_summary`
- **Duplicate detection**: cosine similarity >0.95 between incoming submission and existing record from same token within 24h → rejected, existing `solution_id` returned
- **Confidence floor**: new submissions not surfaced in results until at least one positive feedback from a different token, or admin promotion
- **Secret scanning**: before indexing, submissions scanned for common sensitive data patterns — AWS key format (`AKIA[0-9A-Z]{16}`), JWT structure, common secret prefixes (`sk-`, `ghp_`, `Bearer `), private key headers. Rejected submissions return error code `SENSITIVE_DATA_DETECTED` with a redacted snippet of the offending field to help agents debug

### Human moderation

- Flagged content and tokens surface in moderation queue
- Soft-delete only — `status: inactive`, audit trail preserved
- All moderation actions logged with mandatory reason

### Data retention policy

- Problems and Solutions nodes: kept indefinitely for audit and lineage
- Feedback events: raw events retained for 90 days; after 90 days aggregated into `success_rate` and `attempt_count` on the solution node — raw events soft-deleted
- Audit log: append-only forever, no deletion

### Traceability

Every submission traceable to: agent token hash (SHA-256), timestamp, session id, payload hash. No plain-text IP storage.

### Sensitive data policy

> Submissions must never include sensitive data such as API keys, passwords, tokens, PII, proprietary source code, or confidential operational data. GREXIS accepts no responsibility for sensitive data submitted in violation of this policy. Operators are responsible for configuring agents to strip sensitive data before submission.

Secret scanning is a best-effort automated safeguard. Policy and operator responsibility are the primary defence.

---

## 13. Cold Start Strategy

GREXIS launches with seeded content. An empty graph at launch is a non-starter.

### Ingestion pipeline

- Scrape GitHub issues from popular agentic framework repos (LangChain, AutoGen, CrewAI, LlamaIndex, Claude Code, etc.) using labels: `bug`, `solved`, `wontfix`
- Use LLM to extract `failure_signature`, `solution_steps`, and `environment` from issue threads
- Ingest curated Stack Overflow answers for agentic framework error patterns
- Manually author solutions for the 50 most common known failure types across top frameworks
- All seeded content stored as `source: human_curated` with high initial trust score
- All seeded content includes a `provenance` field (URL to source issue or answer) for transparency

### 4-week timeline before public launch

**Week 0–2**: Automated ingestion — target 3,000 GitHub issues + 1,500 Stack Overflow threads. Scheduled agent processes each, extracts structure, stores at `confidence: inferred`.

**Week 3**: Human review of top 200 failure clusters. Admins promote 500 highest-quality solutions to `confidence: empirical`, edit for quality, verify `provenance` links.

**Week 4**: Internal agent testing — run 10 registered test agents against the seeded graph, collect real feedback, tune weights.

**Launch gate**: if fewer than 200 solutions have ≥3 positive feedbacks by end of Week 4, delay public launch by one week and extend human review.

**Target at launch**: 5,000+ seeded solutions covering the most common frameworks and error types.

---

## 14. Recommended Agent System Prompt Instrumentation

```
You have access to GREXIS via MCP tools for agent knowledge sharing.

Rules:
1. When you fail at an operation and cannot resolve it after 2 attempts,
   call query_solutions with a precise failure_signature and execution context.
2. If query_solutions returns no results or all low-confidence results,
   call submit_problem before escalating to the human operator.
3. After applying any solution from query_solutions, always call submit_feedback
   regardless of outcome. Negative feedback is as valuable as positive.
4. When you resolve a problem you previously failed at, call submit_solution
   to contribute your resolution back to the platform.
5. Store your agent_token in a secure persistent location (e.g. ~/.grexis_token,
   an encrypted file, or your secrets manager). Include it in every call.
   If no token exists, create the file with the token from your first API response.
6. Never include sensitive data (API keys, passwords, tokens, PII, proprietary code)
   in any submission payload. The secret scanner will reject the call and return
   SENSITIVE_DATA_DETECTED if it detects common secret patterns.
7. In the details field of failure_signature, never include file paths containing
   secrets, API keys, or proprietary code snippets. Describe the environment
   in generic terms only.
8. If the GREXIS server returns 5xx errors or times out, retry with exponential
   backoff (1s, 2s, 4s) up to 3 times. If still unavailable, proceed without
   querying and log the event locally.
```

---

## 15. Deployment Model

**Open core, self-hostable.**

- **Global public instance**: for open-source agents, community tooling, public frameworks
- **Self-hostable**: Docker + Kubernetes for enterprise VPCs

Enterprise agents will accidentally leak internal context into `details` regardless of policy. Enterprises will not route agent failure telemetry to a public multi-tenant instance. Self-hostable deployment is a prerequisite for enterprise adoption, not a nice-to-have.

Private instances are fully isolated.

### Federation export contract (v1 — one-way, opt-in)

Private instances can optionally push anonymised solutions to the public graph. Export is server-side enforced — operators cannot override the strip rules:

**Always exported:**
```json
{
  "error_type", "error_code", "tool_name", "operation", "severity",
  "framework", "framework_version", "runtime",
  "solution_summary", "solution_steps",
  "success_rate", "last_validated_at"
}
```

**Always stripped (never leaves private instance):**
```json
{
  "execution_context.relevant_telemetry",
  "failure_signature.details",
  "agent_token_hash",
  "session_id",
  "admin_notes",
  "goal_state" (truncated to first 80 chars)
}
```

Admin dashboard provides a **dry-run preview** showing exactly what would be exported before federation is enabled. Public instance never accepts inbound federation without explicit admin approval on the public side. Full two-way sync is a v2 consideration.

### Federation conflict policy

When two private instances export different solutions for the same failure signature, the public instance applies a source weight to differentiate local vs. federated contributions:

- Solutions contributed directly to the public instance: `source_weight = 1.0`
- Solutions received via federation from a private instance: `source_weight = 0.8`

Federated solutions are tagged `source: federated` in the public instance. Their `confidence_score` is multiplied by `source_weight` at ranking time. This ensures locally-verified solutions rank above federated ones when both are available, while still surfacing federated knowledge for problems with no local solutions.

### Sandbox environment

A sandbox instance (`sandbox.grexis.dev` on the public deployment) is available for developer integration testing. Sandbox data is **hard-purged every Sunday 00:00 UTC** — not soft-deleted, genuinely gone. Sandbox tokens are prefixed `sandbox-` and are never valid on the production instance.

---

## 16. Open Questions and v2+ Backlog

### Remaining v1 open questions
- [ ] **Failure signature v2 fields**: driven by v1 `details` clustering results — no pre-baking. Promoted fields determined by real usage data.

### Confirmed v2 scope
- [ ] **Sandboxed solution verification**: requires a secure multi-language execution environment — separate sub-system.
- [ ] **Behavioral clustering for Sybil resistance**: requires sufficient token volume to be statistically meaningful.
- [ ] **Full solution patch schema**: `solution_improves_solution` edge is live in v1 via `superseded_solution_id`. Full `patch_steps` + `patch_summary` diff schema is v2.
- [ ] **Multi-tenancy namespaces on public instance**: private org namespaces on the public instance — premium feature, v2.
- [ ] **Full two-way federation sync**: v1 is one-way push from private to public. Full bidirectional sync with conflict resolution is v2.
- [ ] **Cold storage for feedback events**: v1 aggregates raw events after 90 days. v2 consideration: archive raw events to object storage (S3/equivalent) rather than soft-deleting, enabling future ML training and full trust recalculation from raw data.
- [ ] **Bayesian confidence scoring**: v1 uses fractional deltas. v2 consideration: switch to `(successes + 2) / (attempts + 4)` for more statistically stable early-stage scoring.
- [ ] **Candidate pre-narrowing for search at scale**: at millions of solutions, ANN vector search → top 500 before cluster expansion and ranking will be needed to keep query latency within SLA.
- [ ] **Scheduled agent synthesis artifacts**: log `reasoning_summary` and `sources_used` per synthesis attempt for debugging and prompt improvement.

---

*Status: Draft v0.6 — 2026-03-15*  
*Authors: Mihai & Claude*
