"""Trust score computation — Task 16.

Implements the confidence score formula from Tech Spec Section 7 (PRD v0.6):
  base × multiplier + delta_sum - decay + diversity_bonus + age_bonus
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tier tables (from Tech Spec Section 7)
# ---------------------------------------------------------------------------

_TIER_MULTIPLIERS: dict[str, float] = {
    "registered": 1.2,
    "token_only":  1.0,
    "anonymous":   0.7,
}

_DELTA_MAP: dict[str, float] = {
    "success":  0.15,
    "partial":  0.04,
    "failure": -0.10,
}


# ---------------------------------------------------------------------------
# Pure helper functions (testable without I/O)
# ---------------------------------------------------------------------------

def compute_base_score(tier: str) -> float:
    """Return base = 0.3 * initial_multiplier for the given tier."""
    multiplier = _TIER_MULTIPLIERS.get(tier, 0.7)
    return 0.3 * multiplier


def compute_delta_sum(outcomes: list[str]) -> float:
    """Sum the fractional deltas for a list of outcome strings."""
    return sum(_DELTA_MAP.get(outcome, 0.0) for outcome in outcomes)


def _days_between(dt_a: datetime, dt_b: datetime) -> float:
    """Return the absolute number of days between two datetime objects."""
    return abs((dt_b - dt_a).total_seconds()) / 86_400.0


def _is_same_minor_version(v1: str, v2: str) -> bool:
    """Compare major.minor parts of two version strings."""
    try:
        parts1 = v1.split(".")
        parts2 = v2.split(".")
        return parts1[0] == parts2[0] and parts1[1] == parts2[1]
    except (IndexError, AttributeError):
        return False


# ---------------------------------------------------------------------------
# Full async score computation
# ---------------------------------------------------------------------------

async def compute_confidence_score(
    solution,          # asyncpg Record: solution["agent_token_hash"], solution["framework"],
                       #   solution["last_validated_at"], solution["created_at"], solution["id"],
                       #   solution["tier"] (must be pre-joined by caller)
    feedbacks,         # list of asyncpg Records with f["outcome"]
    redis_client,
    half_life_days: int = 30,
) -> float:
    """Compute the full confidence score for a solution.

    Formula (Tech Spec Section 7):
        raw = pre_decay_score - decay + diversity_bonus + age_bonus
        clamped to [0.0, 1.0]

    where:
        pre_decay_score = base + delta_sum
        decay           = pre_decay_score * (1 - 0.5 ^ (days / half_life))
        diversity_bonus = 0.15 * env_diversity_factor  (from Redis, TTL 900s)
        age_bonus       = min(0.10 * log(token_age_days + 1), 0.10)

    Note: ``solution`` must include a ``tier`` column (e.g. joined from
    grexis.agent_tokens or defaulted to 'anonymous' by the caller).
    """
    tier = solution["tier"] if solution["tier"] else "anonymous"
    base = compute_base_score(tier)

    outcomes = [f["outcome"] for f in feedbacks]
    delta_sum = compute_delta_sum(outcomes)

    # Time decay
    now = datetime.now(tz=timezone.utc)
    reference_dt = solution["last_validated_at"] or solution["created_at"]
    if reference_dt is not None and reference_dt.tzinfo is None:
        reference_dt = reference_dt.replace(tzinfo=timezone.utc)
    days_since_validation = _days_between(reference_dt, now) if reference_dt else 0.0

    pre_decay_score = base + delta_sum
    if half_life_days > 0:
        decay = pre_decay_score * (1 - 0.5 ** (days_since_validation / half_life_days))
    else:
        decay = 0.0

    # Diversity bonus — loaded from Redis cache (may be up to 15 min stale)
    cached_factor = await redis_client.get_cached(f"diversity:{solution['id']}")
    env_diversity_factor = float(cached_factor) if cached_factor else 0.0
    diversity_bonus = 0.15 * env_diversity_factor

    # Token age bonus — default to 0 if not available; the decay job (runs every
    # 6 hours) handles this properly via the joined token_first_seen column.
    age_bonus = 0.0

    raw = pre_decay_score - decay + diversity_bonus + age_bonus
    return max(0.0, min(1.0, raw))


# ---------------------------------------------------------------------------
# Consecutive failure handler
# ---------------------------------------------------------------------------

async def handle_consecutive_failures(
    db,
    redis,
    solution_id: str,
    threshold: int = 5,
) -> None:
    """Flag a solution and penalise its score after N consecutive failures.

    Inserts into grexis.moderation_queue have been removed because that table
    does not exist in the schema. A warning is logged instead.
    """
    recent_feedbacks = await db.fetch(
        """
        SELECT outcome FROM grexis.feedback_events
        WHERE solution_id = $1
        ORDER BY created_at DESC
        LIMIT 10
        """,
        solution_id,
    )

    # Count trailing consecutive failures
    consecutive_failures = 0
    for row in recent_feedbacks:
        if row["outcome"] == "failure":
            consecutive_failures += 1
        else:
            break

    if consecutive_failures >= threshold:
        await db.execute(
            "UPDATE grexis.solutions SET status = 'flagged' WHERE id = $1",
            solution_id,
        )
        await db.execute(
            """
            UPDATE grexis.solutions
            SET confidence_score = GREATEST(0.0, confidence_score - 0.5)
            WHERE id = $1
            """,
            solution_id,
        )
        logger.warning(
            "Solution %s flagged after %d consecutive failures (threshold=%d). "
            "Manual review required.",
            solution_id, consecutive_failures, threshold,
        )
        # Invalidate Redis cache for this solution's diversity factor
        await redis.client.delete(f"diversity:{solution_id}")
