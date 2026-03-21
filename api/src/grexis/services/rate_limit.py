import json
import logging

logger = logging.getLogger(__name__)

# In-memory cache of rate limits (refreshed from DB on miss)
_rate_limits_cache: dict | None = None


async def load_rate_limits(postgres) -> dict:
    """Load rate_limits from grexis.settings table, cache in memory."""
    global _rate_limits_cache
    if _rate_limits_cache is not None:
        return _rate_limits_cache
    row = await postgres.fetchrow(
        "SELECT value FROM grexis.settings WHERE key = 'rate_limits'"
    )
    if row:
        val = row["value"]
        if isinstance(val, str):
            val = json.loads(val)
        _rate_limits_cache = val
    else:
        _rate_limits_cache = {}
    return _rate_limits_cache


def invalidate_rate_limits_cache():
    """Call when admin updates settings."""
    global _rate_limits_cache
    _rate_limits_cache = None


async def check_submission_rate(redis, postgres, tier: str, token_hash: str | None) -> bool:
    """Check if a submission (problem/solution/feedback) is within rate limits.
    Returns True if allowed, False if rate limited."""
    limits = await load_rate_limits(postgres)
    tier_limits = limits.get(tier, limits.get("anonymous", {}))
    limit = tier_limits.get("submissions_per_hour", 10)
    key = f"rl:sub:{token_hash or 'anon'}:{tier}"
    return await redis.check_rate_limit(key, limit, 3600)


async def check_query_rate(redis, postgres, tier: str, token_hash: str | None) -> bool:
    """Check if a query is within rate limits.
    Returns True if allowed, False if rate limited."""
    limits = await load_rate_limits(postgres)
    tier_limits = limits.get(tier, limits.get("anonymous", {}))
    limit = tier_limits.get("queries_per_minute", 5)
    key = f"rl:qry:{token_hash or 'anon'}:{tier}"
    return await redis.check_rate_limit(key, limit, 60)
