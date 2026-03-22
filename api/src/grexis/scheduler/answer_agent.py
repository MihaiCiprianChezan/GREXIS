"""Scheduled answer agent — Task 27.

Periodically selects open problems by priority and attempts synthesis.
Includes budget enforcement and 7-day success-rate health guardrails.

Tech Spec Section 12.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone

from grexis.deps import postgres, redis
from grexis.lib.config import get_settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Problem selection
# ---------------------------------------------------------------------------

async def select_next_problem() -> dict | None:
    """Pick the highest-priority open problem that hasn't been exhausted.

    Priority ordering:
      1. severity = 'blocking' first
      2. duplicate_count DESC
      3. created_at ASC (oldest first)
    """
    settings = get_settings()

    # Budget check
    today_key = f"budget:scheduled:{date.today().isoformat()}"
    budget_used = await redis.get_counter(today_key)
    if budget_used >= settings.SCHEDULED_AGENT_DAILY_TOKEN_BUDGET:
        logger.info("Daily token budget exhausted (%d >= %d), skipping run",
                     budget_used, settings.SCHEDULED_AGENT_DAILY_TOKEN_BUDGET)
        return None

    row = await postgres.fetchrow(
        """
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
        """,
        settings.SCHEDULED_AGENT_MAX_ATTEMPTS_PER_PROBLEM,
    )

    if row is None:
        logger.info("No eligible open problems found")
        return None

    return dict(row)


# ---------------------------------------------------------------------------
# Health guardrail
# ---------------------------------------------------------------------------

async def check_scheduled_agent_health() -> bool:
    """Return False if the agent should be paused (7-day success rate < 35%).

    Only triggers when there are at least 20 attempts in the window so that
    the metric is statistically meaningful.
    """
    cutoff = datetime.utcnow() - timedelta(days=7)
    stats = await postgres.fetchrow(
        """
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'succeeded') AS succeeded
        FROM grexis.agent_jobs
        WHERE created_at >= $1
        """,
        cutoff,
    )

    if stats is None or stats["total"] < 20:
        return True  # not enough data — allow runs

    success_rate = stats["succeeded"] / stats["total"]
    if success_rate < 0.35:
        logger.warning(
            "Scheduled agent paused: success rate %.1f%% < 35%% threshold "
            "(%d/%d in last 7 days)",
            success_rate * 100, stats["succeeded"], stats["total"],
        )
        return False

    return True


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def attempt_open_problems() -> None:
    """Entry point invoked every 30 minutes by APScheduler.

    Selects the next open problem, checks health guardrails, and
    attempts synthesis (stub: logs the attempt).
    """
    logger.info("Scheduled answer agent: starting run")

    # Health check
    if not await check_scheduled_agent_health():
        return

    problem = await select_next_problem()
    if problem is None:
        return

    problem_id = problem["id"]
    logger.info("Selected problem %s (severity=%s, duplicates=%s)",
                problem_id, problem.get("severity"), problem.get("duplicate_count"))

    # --- Synthesis stub ---
    # In a future implementation this will call the LLM synthesis pipeline.
    logger.info("Synthesis attempted for problem %s (stub — no LLM call)", problem_id)

    # Record the attempt in agent_jobs (plain INSERT — a problem can have multiple job entries)
    await postgres.execute(
        """
        INSERT INTO grexis.agent_jobs (problem_id, status, attempts_today, created_at)
        VALUES ($1, 'attempted', 1, NOW())
        """,
        problem_id,
    )

    # Increment budget counter (TTL = rest of day, ~86400s)
    today_key = f"budget:scheduled:{date.today().isoformat()}"
    await redis.increment_counter(today_key, ttl=86400)

    logger.info("Scheduled answer agent: run complete")
