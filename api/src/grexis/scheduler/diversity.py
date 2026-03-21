"""Diversity factor caching — Task 29.

For each active solution with recent feedback, computes
unique_envs / total_success_feedbacks and writes the ratio to Redis
with a 900-second TTL.

Runs every 15 minutes via APScheduler.
Tech Spec Section 7.
"""

from __future__ import annotations

import logging

from grexis.deps import postgres, redis

logger = logging.getLogger(__name__)


async def recompute_diversity_factors() -> None:
    """Entry point invoked every 15 minutes by APScheduler.

    Queries all active solutions that have at least one success feedback,
    computes the environment diversity factor, and caches it in Redis.
    """
    logger.info("Diversity factor recomputation: starting")

    # Fetch active solutions with success feedback counts and unique env counts
    # in a single query to minimize round-trips.
    rows = await postgres.fetch(
        """
        SELECT
            s.id AS solution_id,
            COUNT(*) FILTER (WHERE fe.outcome = 'success') AS success_count,
            COUNT(DISTINCT (
                fe.environment_llm,
                fe.environment_framework,
                fe.environment_framework_version,
                fe.environment_runtime
            )) FILTER (WHERE fe.outcome = 'success') AS unique_env_count
        FROM grexis.solutions s
        JOIN grexis.feedback_events fe ON fe.solution_id = s.id
        WHERE s.status = 'active'
        GROUP BY s.id
        HAVING COUNT(*) FILTER (WHERE fe.outcome = 'success') > 0
        """,
    )

    if not rows:
        logger.info("Diversity factor recomputation: no active solutions with success feedback")
        return

    cached_count = 0
    for row in rows:
        success_count = row["success_count"]
        unique_envs = row["unique_env_count"]

        factor = unique_envs / success_count if success_count > 0 else 0.0

        await redis.set_diversity_factor(str(row["solution_id"]), factor)
        cached_count += 1

    logger.info("Diversity factor recomputation: cached %d factors", cached_count)
