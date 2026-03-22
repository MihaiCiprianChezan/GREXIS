"""Trust score decay recomputation — Task 28.

Finds solutions where last_validated_at is stale and applies the half-life
decay formula from Tech Spec Section 7. Batch updates confidence_score in
both Postgres and Qdrant.

Runs every 6 hours via APScheduler.
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone

from grexis.db.qdrant import SOLUTIONS_COLLECTION
from grexis.deps import postgres, qdrant, redis
from grexis.lib.config import get_settings

logger = logging.getLogger(__name__)

# Batch size for bulk updates
BATCH_SIZE = 200


def _days_between(earlier: datetime | None, later: datetime) -> float:
    """Return the number of days between two datetimes."""
    if earlier is None:
        return 0.0
    delta = later - earlier
    return max(delta.total_seconds() / 86400.0, 0.0)


def _compute_decay_score(
    *,
    base: float,
    delta_sum: float,
    days_since_validation: float,
    half_life_days: int,
    diversity_factor: float,
    token_age_days: float,
) -> float:
    """Pure computation of the trust score with decay, diversity, and age bonus.

    Mirrors Tech Spec Section 7 exactly.
    """
    pre_decay_score = base + delta_sum

    # Time decay
    if half_life_days > 0 and days_since_validation > 0:
        decay = pre_decay_score * (1 - 0.5 ** (days_since_validation / half_life_days))
    else:
        decay = 0.0

    # Diversity bonus (from Redis cache)
    diversity_bonus = 0.15 * diversity_factor

    # Token age bonus
    age_bonus = min(0.10 * math.log(token_age_days + 1), 0.10)

    raw = pre_decay_score - decay + diversity_bonus + age_bonus
    return max(0.0, min(1.0, raw))


async def recompute_decay() -> None:
    """Entry point invoked every 6 hours by APScheduler.

    Recomputes confidence_score for solutions whose last_validated_at is
    stale (older than half_life_days / 2) or NULL.
    """
    settings = get_settings()
    half_life = settings.TRUST_DECAY_DEFAULT_HALF_LIFE_DAYS
    now = datetime.utcnow()

    logger.info("Decay recomputation: starting (half_life=%d days)", half_life)

    # Fetch solutions that need recomputation:
    # - last_validated_at is NULL, OR
    # - last_validated_at is older than half_life/2 days
    stale_solutions = await postgres.fetch(
        """
        SELECT
            s.id,
            s.confidence_score,
            s.last_validated_at,
            s.created_at,
            s.agent_token_hash,
            s.qdrant_point_id,
            COALESCE(
                (SELECT tier FROM grexis.agent_tokens WHERE token_hash = s.agent_token_hash),
                'anonymous'
            ) AS tier,
            COALESCE(
                (SELECT first_seen_at FROM grexis.agent_tokens WHERE token_hash = s.agent_token_hash),
                s.created_at
            ) AS token_first_seen
        FROM grexis.solutions s
        WHERE s.status = 'active'
          AND (
            s.last_validated_at IS NULL
            OR s.last_validated_at < NOW() - INTERVAL '%s days'
          )
        ORDER BY s.last_validated_at ASC NULLS FIRST
        LIMIT $1
        """.replace("%s", str(half_life // 2)),
        BATCH_SIZE,
    )

    if not stale_solutions:
        logger.info("Decay recomputation: no stale solutions found")
        return

    logger.info("Decay recomputation: processing %d stale solutions", len(stale_solutions))

    updated_count = 0
    for row in stale_solutions:
        solution_id = row["id"]

        # Tier multiplier
        tier = row["tier"]
        initial_multiplier = {"registered": 1.2, "token_only": 1.0, "anonymous": 0.7}.get(
            tier, 1.0
        )
        base = 0.3 * initial_multiplier

        # Feedback delta sum
        feedbacks = await postgres.fetch(
            """
            SELECT outcome FROM grexis.feedback_events
            WHERE solution_id = $1
            """,
            solution_id,
        )
        delta_map = {"success": 0.15, "partial": 0.04, "failure": -0.10}
        delta_sum = sum(delta_map.get(f["outcome"], 0) for f in feedbacks)

        # Days since validation
        validation_anchor = row["last_validated_at"] or row["created_at"]
        days_since = _days_between(validation_anchor, now)

        # Diversity factor from Redis
        cached = await redis.get_diversity_factor(str(solution_id))
        diversity_factor = cached if cached is not None else 0.0

        # Token age
        token_first_seen = row["token_first_seen"]
        token_age_days = _days_between(token_first_seen, now) if token_first_seen else 0.0

        new_score = _compute_decay_score(
            base=base,
            delta_sum=delta_sum,
            days_since_validation=days_since,
            half_life_days=half_life,
            diversity_factor=diversity_factor,
            token_age_days=token_age_days,
        )

        old_score = float(row["confidence_score"]) if row["confidence_score"] else 0.0
        if abs(new_score - old_score) < 0.001:
            continue  # Skip negligible changes

        # Update Postgres
        await postgres.execute(
            """
            UPDATE grexis.solutions
            SET confidence_score = $1
            WHERE id = $2
            """,
            new_score,
            solution_id,
        )

        # Update Qdrant payload
        qdrant_id = row["qdrant_point_id"]
        if qdrant_id:
            try:
                await qdrant.client.set_payload(
                    collection_name=SOLUTIONS_COLLECTION,
                    payload={"confidence_score": new_score},
                    points=[qdrant_id],
                )
            except Exception:
                logger.exception("Failed to update Qdrant payload for solution %s", solution_id)

        updated_count += 1

    logger.info("Decay recomputation: updated %d/%d solutions",
                updated_count, len(stale_solutions))
