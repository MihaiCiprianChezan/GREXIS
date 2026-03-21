"""Feedback aggregation — Task 31.

Aggregates feedback events older than 90 days: updates
solutions.success_rate and solutions.attempt_count, then marks
the aggregated events with aggregated_at = NOW().

Runs daily at 03:00 UTC via APScheduler.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from grexis.deps import postgres

logger = logging.getLogger(__name__)

# Events older than this many days are eligible for aggregation.
AGGREGATION_WINDOW_DAYS = 90


async def aggregate_old_feedback() -> None:
    """Entry point invoked daily at 03:00 UTC by APScheduler.

    For each solution with un-aggregated feedback older than 90 days:
    1. Compute success_rate = successes / total for those events.
    2. Update solutions.success_rate and solutions.attempt_count.
    3. Mark the events as aggregated (aggregated_at = NOW()).
    """
    logger.info("Feedback aggregation: starting")

    cutoff = datetime.now(timezone.utc) - timedelta(days=AGGREGATION_WINDOW_DAYS)

    # Find solutions that have un-aggregated feedback older than the cutoff
    solution_rows = await postgres.fetch(
        """
        SELECT
            fe.solution_id,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE fe.outcome = 'success') AS successes,
            COUNT(*) FILTER (WHERE fe.outcome = 'partial') AS partials
        FROM grexis.feedback_events fe
        WHERE fe.created_at < $1
          AND fe.aggregated_at IS NULL
        GROUP BY fe.solution_id
        """,
        cutoff,
    )

    if not solution_rows:
        logger.info("Feedback aggregation: no events to aggregate")
        return

    aggregated_solutions = 0
    aggregated_events = 0

    for row in solution_rows:
        solution_id = row["solution_id"]
        total = row["total"]
        successes = row["successes"]

        success_rate = successes / total if total > 0 else 0.0

        # Update the solution's aggregate stats.
        # attempt_count is incremented by the batch total; success_rate is
        # recomputed as a weighted blend of old and new.
        await postgres.execute(
            """
            UPDATE grexis.solutions
            SET
                success_rate = CASE
                    WHEN attempt_count + $2 > 0
                    THEN (COALESCE(success_rate, 0) * COALESCE(attempt_count, 0) + $1 * $2)
                         / (COALESCE(attempt_count, 0) + $2)
                    ELSE $1
                END,
                attempt_count = COALESCE(attempt_count, 0) + $2,
                updated_at = NOW()
            WHERE id = $3
            """,
            success_rate,
            total,
            solution_id,
        )

        # Mark events as aggregated
        await postgres.execute(
            """
            UPDATE grexis.feedback_events
            SET aggregated_at = NOW()
            WHERE solution_id = $1
              AND created_at < $2
              AND aggregated_at IS NULL
            """,
            solution_id,
            cutoff,
        )

        aggregated_solutions += 1
        aggregated_events += total

    logger.info(
        "Feedback aggregation: processed %d events across %d solutions",
        aggregated_events, aggregated_solutions,
    )
