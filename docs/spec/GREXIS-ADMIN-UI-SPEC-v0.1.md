# GREXIS — Admin UI Specification
> *Companion document to GREXIS-TECH-SPEC-v0.3 and GREXIS-PRD-v0.6.*

**Version:** 0.1  
**Status:** Draft — ready for frontend implementation  
**Scope:** v0.1 basic functionality — intentionally minimal, designed for extension

---

## 1. Overview

The GREXIS admin UI is the human supervision layer. It gives operators full visibility into the resolution graph, the ability to act on flagged content and open problems, and control over platform configuration — without ever losing the audit trail.

This is a tool for technical administrators, not end users. It does not need to be beautiful. It needs to be fast, dense, and trustworthy. Every destructive action requires a reason. Nothing is silently deleted.

**Technology:** React 18 + Vite + TypeScript. Lives in `web/` in the monorepo.  
**Backend contract:** Admin REST API defined in Tech Spec Section 15.  
**Auth:** Session cookie set on login via `GREXIS_API_SECRET`. Expires after 8h inactivity.  
**Real-time:** Polling (5s interval) for moderation queue badge count and scheduled agent status. WebSocket upgrade deferred to v0.2.

---

## 2. Information Architecture

```
/login
/dashboard              ← home — metrics overview + alert badges
/solutions              ← solution browser
/solutions/:id          ← solution detail + action panel
/problems               ← problems queue
/problems/:id           ← problem detail + manual resolve
/agents                 ← agent token browser
/agents/:hash           ← token detail + ban/reset
/moderation             ← flagged content queue
/clusters               ← failure cluster suggestions
/audit                  ← audit log
/jobs                   ← scheduled agent monitor
/metrics                ← observability dashboard
/settings               ← search weights, decay rates, rate limits
```

All routes are protected. Unauthenticated requests redirect to `/login`.

---

## 3. Navigation

Persistent left sidebar. Always visible. Width: 220px.

```
GREXIS admin
─────────────────
  Dashboard
  Solutions
  Problems          [N]   ← badge: open blocking count
  Moderation        [N]   ← badge: items pending review
  Agents
  Clusters          [N]   ← badge: pending promotion suggestions
─────────────────
  Audit log
  Scheduled agent
  Metrics
  Settings
─────────────────
  Logged in as admin
  Sign out
```

Badges are counts pulled every 5s. Zero counts hide the badge — no empty `[0]`.

---

## 4. UX Flows

### 4.1 Login

1. Admin visits any protected route — redirected to `/login`
2. Single field: API secret (`<input type="password">`)
3. Submit → `POST /auth/login` with secret in body
4. On success: session cookie set, redirect to `/dashboard`
5. On failure: inline error "Invalid secret", field cleared, focus restored
6. Session expires after 8h inactivity — silent redirect to `/login` with return URL preserved

No username. No OAuth in v0.1. Single admin secret matches `GREXIS_API_SECRET` env var.

### 4.2 Daily moderation routine

1. Admin arrives at `/dashboard` — moderation badge in sidebar shows pending count
2. Admin clicks "Moderation" → `/moderation`
3. Queue displays flagged items sorted by severity (blocking first), then age
4. Admin clicks an item → detail panel slides in from right (no navigation — stays on queue page)
5. Admin reads: full payload, flag reason, agent token tier, prior detections if secret scan hit
6. Admin chooses action:
   - **Dismiss** — clears flag, solution returns to `active`, requires reason
   - **Edit then reactivate** — opens inline editor, save → `active`, all changes logged
   - **Remove** — soft-deletes solution (`inactive`), requires reason
   - **Ban token** — soft-deletes + flags token, requires reason
7. Confirm modal appears for Remove and Ban — shows exactly what will happen, reason field required
8. Action submitted → item removed from queue → next item auto-focuses
9. Queue empty state: "Queue is clear" + timestamp of last check

### 4.3 Solution review and action

1. Admin navigates to `/solutions`
2. Table view: `solution_summary`, `framework`, `confidence_score`, `success_rate`, `source`, `status`, `last_validated_at`
3. Filters: framework, error_type, source, status, severity. Search by summary text.
4. Sort: confidence_score, success_rate, created_at, last_validated_at
5. Click row → `/solutions/:id`
6. Detail page sections:
   - **Header**: summary, status badge, source badge, severity badge
   - **Failure signature**: error_type, error_code, tool_name, details_summary
   - **Environment**: llm, framework, framework_version, runtime
   - **Resolution**: solution_steps as numbered list, confidence_type
   - **Trust score**: current score, success_rate, attempt_count, last_validated_at, diversity_bonus, age_bonus (read-only breakdown)
   - **Feedback history**: table of last 20 feedback events — outcome, environment, comment, timestamp
   - **Graph edges**: list of edges in and out — edge_type, linked node id (clickable)
   - **Provenance**: link to source if seeded content
   - **Admin notes**: editable freetext, saved inline, never returned to agents
7. Action panel (right column, always visible):
   - Promote to `human_curated`
   - Edit solution
   - Demote (flag)
   - Remove (soft-delete)
   - View agent token →
8. All actions require reason. All actions logged to audit.

### 4.4 Manual problem resolution

1. Admin navigates to `/problems`
2. Table: error_type, framework, severity, duplicate_count, status, created_at, last_attempted_at
3. Filters: status (open/solved/stale), severity, framework. Sort: severity, duplicate_count, age.
4. Click row → `/problems/:id`
5. Detail page sections:
   - **Header**: error_type, severity badge, status badge, duplicate_count
   - **Failure signature**: full breakdown
   - **Goal state**: what the agent was trying to do
   - **Environment**: llm, framework, framework_version, runtime
   - **Execution context**: attempted_approaches, steps_taken, telemetry
   - **Existing solutions**: list of linked solutions with confidence scores (may be empty or all low)
   - **Scheduled agent attempts**: from `agent_jobs.synthesis_logs` — outcome, reasoning_summary, sources_used per attempt
6. If no good solutions exist: "Resolve manually" button appears
7. Click → solution editor opens inline:
   - `solution_steps`: dynamic list, add/remove/reorder rows
   - `solution_summary`: textarea
   - Admin notes: optional freetext
8. Submit → `POST /admin/solutions` with `source: human_curated`, `status: active`
9. Problem status updated to `solved`, `solved_by_solution_id` set
10. Edge created: `solution_resolves_problem`
11. Audit logged. Admin redirected back to problems queue.

### 4.5 Token inspection and action

1. Admin navigates to `/agents`
2. Table: token_hash (truncated), tier, submitted_solutions_count, success_rate, rate_limit_multiplier, first_seen_at, is_banned
3. Filter: tier, is_banned. Sort: success_rate, submitted_solutions_count, first_seen_at.
4. Click row → `/agents/:hash`
5. Detail page:
   - **Identity**: tier, agent_description (if registered), framework, operator_email_hash
   - **Activity**: submitted_solutions_count, success_rate, rate_limit_multiplier, first_seen_at, last_seen_at
   - **Submitted solutions**: paginated table linking to `/solutions/:id`
   - **Secret scan detections**: count of warnings and hard rejections
6. Actions:
   - **Reset rate limit** — sets `rate_limit_multiplier` back to 1.0, logs reason
   - **Ban token** — sets `is_banned: true`, requires reason, logs to audit
   - **Unban token** — sets `is_banned: false`, requires reason

### 4.6 Cluster promotion workflow

1. Admin navigates to `/clusters`
2. List of clusters with `admin_status: pending`, ordered by member_count descending
3. Each cluster card shows: cluster_label, error_type, member_count, top keywords
4. Admin actions per cluster:
   - **Accept** — marks `admin_status: accepted`, promotes to v2 schema candidate list
   - **Dismiss** — marks `admin_status: dismissed`, removes from pending view
5. "Trigger clustering job" button at top → `POST /admin/clusters/trigger` → shows spinner + "Job triggered" confirmation
6. Accepted clusters are shown in a separate "Accepted" tab for reference

---

## 5. Pages

### 5.1 Dashboard (`/dashboard`)

Entry point. Read-only summary.

**Key metrics strip** (top row, 4 cards):

| Card | Value | Source |
|---|---|---|
| Open problems | Count with blocking sub-count | `GET /admin/problems?status=open` |
| Active solutions | Total active | `GET /admin/metrics` |
| Moderation queue | Pending count | `GET /admin/metrics` |
| Scheduled agent | 7-day success rate % | `GET /admin/metrics` |

**Alerts panel** — shown only if conditions exist:
- Scheduled agent paused (success rate < 35%)
- Moderation queue > 20 items
- Solutions with > 5 consecutive failures pending review
- `pending_index` solutions stuck > 1h

**Recent activity feed** — last 20 audit log entries, newest first. Each entry: timestamp, actor_type, action, target_id. Click → `/audit` filtered to that entry.

**Platform health** (bottom row): p95 query latency, mean time to resolution, daily token budget consumed %. Simple numbers, no charts in v0.1.

### 5.2 Solutions browser (`/solutions`)

Table with server-side filtering and sorting. Pagination: 50 rows per page.

**Columns:** summary (truncated to 80 chars), framework + version, error_type, confidence_score (colour-coded: green ≥0.65, amber 0.3–0.65, red <0.3), success_rate, source badge, status badge, last_validated_at.

**Filter bar** (above table): framework multiselect, error_type multiselect, source multiselect, status multiselect, severity multiselect, text search on summary.

**Bulk actions** (v0.1): none. One action at a time via detail page.

### 5.3 Problems queue (`/problems`)

Table with server-side filtering. Pagination: 50 rows per page.

**Columns:** error_type, framework + version, severity badge (blocking = red pill, degraded = amber, cosmetic = gray), duplicate_count, status badge, last_attempted_at, age.

**Filter bar:** status multiselect, severity multiselect, framework multiselect.

**Quick resolve button** on each row for blocking problems with no solutions: opens the manual resolution editor without navigating to detail page. For other severities, click row for full detail.

### 5.4 Scheduled agent monitor (`/jobs`)

Two sections:

**Current status:** is_running, daily_tokens_used / budget, problems attempted today, problems solved today, 7-day success rate, last_run_at.

**Job queue table:** problem_id (linked), status, attempts_today, total_attempts, tokens_used_today, next_attempt_after. Filter: status. Paginated.

**Synthesis logs** (expandable per job row): per-attempt log showing attempt_number, outcome badge, tokens_used, reasoning_summary, sources_used list.

### 5.5 Metrics (`/metrics`)

Numeric dashboard. No charts in v0.1 — raw numbers and trends (arrow up/down vs. yesterday).

Rows: all metrics from Tech Spec Section 14 Prometheus export table. Each row: metric name, current value, change vs. 24h ago.

"Open in Grafana" link if `GRAFANA_URL` env var is set — links out, does not embed.

### 5.6 Settings (`/settings`)

Form with current values. Save → `PATCH /admin/settings`. All changes logged to audit.

**Search weights section:** w1 vector_similarity, w2 structural_match, w3 env_proximity, w4 recency_boost — four number inputs (0.00–1.00). Validation: must sum to 1.0. Server-side validation also rejects if weights do not sum to 1.0 — client validation is for UX only, not a security boundary.

**Trust decay section:** default_half_life_days, consecutive_failure_threshold, confidence_floor_feedbacks — number inputs.

**Rate limits section:** submissions per hour by tier (anonymous, token_only, registered), queries per minute by tier.

**Scheduled agent section:** daily_token_budget, max_attempts_per_problem — number inputs.

**Secret scanning section:** enabled toggle. Custom patterns — textarea (one regex per line). Saved to `secret_patterns.json` on the server.

### 5.7 Audit log (`/audit`)

Read-only. Append-only data — no edit or delete controls anywhere on this page.

Table: timestamp, actor_type badge, actor_id_hash (truncated), action, target_id (linked to relevant page), reason (truncated with expand). Filter: actor_type, action. Date range filter. Paginated, 100 rows per page.

Export button: downloads current filtered view as CSV.

---

## 6. Component Conventions

### Status badges

| Status | Color | Label |
|---|---|---|
| `active` | Green | active |
| `pending_review` | Amber | pending review |
| `flagged` | Red | flagged |
| `inactive` | Gray | inactive |
| `pending_index` | Amber | indexing |

### Source badges

| Source | Color | Label |
|---|---|---|
| `agent_contributed` | Blue | agent |
| `scheduled_agent` | Purple | scheduled |
| `human_curated` | Teal | curated |
| `federated` | Gray | federated |

### Severity badges

| Severity | Color |
|---|---|
| `blocking` | Red pill |
| `degraded` | Amber pill |
| `cosmetic` | Gray pill |

### Destructive action pattern

All Remove, Ban, and Demote actions follow this pattern:

1. Admin clicks action button
2. Confirmation modal appears with: action description, what will happen, mandatory reason textarea (min 10 chars)
3. Confirm button is disabled until reason is non-empty
4. On confirm: action submitted, modal closes, inline success toast, item updates in place

No destructive action is irreversible without a reason logged to audit.

### Edit form pattern

All edit actions open an inline form (not a separate page). Fields pre-populated with current values. Save → PATCH request → success toast → form closes → item updates in place. Cancel → discard with no changes.

### Loading states

- **Initial page load:** skeleton loaders matching the expected layout (table rows, metric cards). No full-page spinners.
- **Table data loading (filter/sort/paginate):** table body grayed out with a subtle overlay spinner. Header and filter bar remain interactive.
- **Action in progress:** button disabled + inline spinner. No optimistic updates in v0.1 — wait for server confirmation before updating UI state.
- **Polling refresh:** silent background refresh. No loading indicators for poll updates — data just appears. If a poll fails, a subtle "connection lost" banner appears after 3 consecutive failures.

### Accessibility baseline

Even as an internal tool, the admin UI must meet basic accessibility standards:

- **Focus management:** after modal close, return focus to the trigger button. After moderation queue action, focus moves to next item.
- **Keyboard navigation:** Enter opens detail panels, Escape closes them. Tab order follows visual layout. All interactive elements are keyboard-reachable.
- **ARIA labels:** badge counts include descriptive labels (e.g., `aria-label="5 items pending moderation"`). Status badges include their text in `aria-label`, not just color.
- **Color is not the only indicator:** all color-coded elements (confidence scores, severity badges) also have text labels. No information conveyed by color alone.
- **Reduced motion:** respect `prefers-reduced-motion` — disable transitions and skeleton shimmer for users who request it.

---

## 7. Authentication

**Login:** `POST /auth/login` — body: `{ secret: string }`. Response: sets `grexis_admin_session` cookie (HttpOnly, SameSite=Strict). Returns `{ ok: true }` or `{ error: "invalid" }`.

**Session check:** every protected page load makes `GET /auth/me` — 200 = still valid, 401 = redirect to `/login`.

**Logout:** `POST /auth/logout` — clears cookie, redirects to `/login`.

**No token storage in localStorage.** Session is cookie-only. If the cookie is cleared or expires, admin must re-authenticate.

---

## 8. Error Handling

- **Network errors:** inline error banner below the relevant section. "Retry" button. No full-page error screens.
- **404 from API:** "Not found" inline message where content would appear.
- **422 from API (validation):** field-level error messages on forms.
- **500 from API:** "Something went wrong. Try again or check the API logs." No stack traces exposed in UI.
- **Session expired (401):** toast "Session expired — please log in again" + redirect to `/login` with `?return=current_path`.

---

## 9. Real-Time Updates

**v0.1 — polling only:**
- Moderation queue badge: every 5s
- Scheduled agent status card on dashboard: every 5s
- Problem queue counts: every 30s

Polling is paused when the browser tab is hidden (`document.visibilityState`). Resumes immediately on tab focus.

**v0.2 planned:** WebSocket upgrade for real-time moderation queue updates and scheduled agent log streaming.

---

## 10. v0.2+ Backlog

- WebSocket for real-time queue updates and live scheduled agent log streaming
- Graph explorer: visual graph view with node and edge rendering (D3 or similar)
- Bulk actions on solutions browser (promote/demote multiple)
- Trust score history chart per solution (sparkline)
- Failure cluster detail view with member problems list
- Mobile responsive layout
- OAuth / multi-admin support
- Dark mode toggle (system preference respected by default via CSS variables — explicit toggle deferred)
- Keyboard shortcuts for common moderation actions

---

*Status: Draft v0.1 — 2026-03-15*  
*Authors: Mihai & Claude*  
*Companion to: GREXIS-PRD-v0.6.md, GREXIS-TECH-SPEC-v0.3.md*
