# CHANGELOG

All notable changes to GREXIS documentation are recorded here.  
Format: `[version] — date — document — summary`

---

## PRD

### [v0.6] — 2026-03-15
- Added Section 0.1: Success Metrics and Launch Gates with 8 measurable targets and invite-only gate mechanism
- Fixed trust score delta bug: `success=+0.15`, `partial=+0.04`, `failure=−0.10` (old `+1.0` caused score saturation on first success)
- Added `superseded_solution_id` field to Solutions data model
- Added edge type constraints table with allowed source→target combinations, enforced at write time
- Added Section 4.3: Duplicate problem detection with explicit similarity threshold logic
- Clarified time decay formula: `decayed_score(t) = score × 0.5^(t/half_life)`
- Added async `diversity_bonus` note — recomputed every 15 minutes, not on feedback write path
- Fixed environment match score 0.5 case — only applies when `cross_framework: true` explicitly set
- Added `mean_time_to_resolution` to dashboard metrics
- Added trigger clustering job to admin actions
- Added federation conflict policy — `source_weight: 0.8` for federated, `1.0` for local
- Hardened sandbox purge — hard delete every Sunday 00:00 UTC, `sandbox-` token prefix
- Expanded Section 16 into full v2+ backlog with all deferred items named

### [v0.5] — 2026-03-15
- Added trust score closed-form formula with `diversity_bonus` and `age_bonus`
- Added time decay formula with configurable half-life per framework
- Added explicit rate limit tiers table with real numbers
- Added `framework_version` and `runtime` as required environment fields
- Added `severity` field to failure signatures and Solutions node
- Added `superseded_solution_id` to `submit_solution` tool
- Added Sybil resistance: token age weighting + environment diversity weighting
- Added scheduled answer agent guardrails: 3 attempts/day, 150k token budget, 35% success floor
- Added data retention policy: 90-day aggregation for feedback events
- Added federation export contract with explicit field-level strip rules
- Added sandbox environment spec
- Added 4-week cold start timeline with launch gate
- Added system prompt rules 7 and 8 (sensitive data in details, retry with backoff)
- Added graph explorer to admin dashboard
- Added Prometheus metrics list
- Added `register_agent` updateability
- Added `solution_improves_solution` edge to v1 via `superseded_solution_id`

### [v0.4] — 2026-03-15
- Added explicit resolution graph data model with typed edges
- Added formal Problems store schema
- Added `relevant_telemetry` with `runtime_stack` to execution context
- Added cold start seeding strategy
- Added open core / self-hostable deployment model
- Added recommended agent system prompt instrumentation
- Dropped IP-based blocking in favour of token reputation decay
- Named: **GREXIS** (from graph + nexis)

---

## Tech Spec

### [v0.2] — 2026-03-15
- Fixed trust score pseudocode: fractional deltas, active `failure` delta (`−0.10`), async `diversity_bonus` via Redis cache
- Added Section 8: Edge constraint enforcement with typed allowed combinations
- Added Section 9: Duplicate problem detection via Qdrant problems collection
- Fixed `computeEnvMatchScore` — 0.5 case now correctly requires `crossFramework: true`
- Expanded secret scanner patterns: added OPENSSH, DSA, PKCS#8, EC, RSA, GitHub OAuth
- Added warning mode for registered agents: 3 warnings before hard rejection
- Added synthesis attempt logging: `reasoning_summary` + `sources_used` per scheduled agent attempt
- Added Section 13: Federation ingestion with `source_weight: 0.8` tagging
- Added Section 14: Metrics implementation including `mean_time_to_resolution` with Redis histogram
- Added `POST /admin/clusters/trigger` endpoint
- Added `diversity.ts`, `duplicates.ts`, `federation.ts` to project structure
- Added Appendix A: 5 copy-paste ready example MCP payloads

### [v0.1] — 2026-03-15
- Initial tech spec
- Stack decision: Qdrant + PostgreSQL + Redis — rationale documented
- Full PostgreSQL schema: 8 tables with indexes
- Qdrant collection schema and payload indexes
- Redis key schema
- Trust score TypeScript pseudocode
- Search pipeline: hard filter → cluster expansion → semantic rank
- Secret scanner with regex patterns
- Scheduled answer agent implementation
- Admin REST API endpoints
- Docker Compose with all 3 services
- Project directory structure
