"""Agent token service — Task 12.

Provides token hashing, Redis-cached resolution, and token record creation.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass


@dataclass
class AgentToken:
    hash: str
    tier: str          # "registered" | "token_only" | "anonymous"
    multiplier: float


class BannedTokenError(Exception):
    """Raised when a banned agent token attempts to use MCP tools."""
    def __init__(self, token_hash: str):
        self.token_hash = token_hash
        super().__init__(f"Token {token_hash[:8]}... is banned")


def hash_token(raw: str) -> str:
    """Return the SHA-256 hex digest of a raw token string."""
    return hashlib.sha256(raw.encode()).hexdigest()


async def create_token_record(db, token_hash: str) -> None:
    """Insert a new token_only tier record into grexis.agent_tokens."""
    await db.execute(
        """
        INSERT INTO grexis.agent_tokens (token_hash, tier, rate_limit_multiplier)
        VALUES ($1, 'token_only', 1.0)
        ON CONFLICT (token_hash) DO NOTHING
        """,
        token_hash,
    )


async def resolve_agent_token(db, redis, agent_token: str | None) -> AgentToken | None:
    """Resolve an agent token string to an AgentToken, using Redis as a cache.

    Resolution flow (from Tech Spec Section 15):
    1. If no token provided → anonymous tier.
    2. Hash the token.
    3. Check Redis hash key ``rep:<hash>`` for cached tier.
    4. On cache miss, fall back to Postgres.
    5. If not found in Postgres, auto-create as token_only.
    6. Populate Redis cache before returning.
    """
    if not agent_token:
        return None  # anonymous tier

    token_hash = hash_token(agent_token)

    # Check Redis cache first
    cached = await redis.hgetall(f"rep:{token_hash}")
    if cached and cached.get("tier"):
        if cached.get("is_banned") == "true":
            raise BannedTokenError(token_hash)
        return AgentToken(
            hash=token_hash,
            tier=cached["tier"],
            multiplier=float(cached["multiplier"]),
        )

    # Fall back to Postgres
    record = await db.fetchrow(
        "SELECT * FROM grexis.agent_tokens WHERE token_hash = $1",
        token_hash,
    )

    if not record:
        # First-seen token — auto-create as token_only tier
        await create_token_record(db, token_hash)
        return AgentToken(hash=token_hash, tier="token_only", multiplier=1.0)

    # Enforce ban
    if record["is_banned"]:
        # Cache the ban so subsequent calls are fast
        await redis.hmset(f"rep:{token_hash}", {
            "tier": record["tier"],
            "multiplier": str(record["rate_limit_multiplier"]),
            "is_banned": "true",
        })
        raise BannedTokenError(token_hash)

    # Populate Redis cache
    await redis.hmset(f"rep:{token_hash}", {
        "tier": record["tier"],
        "multiplier": str(record["rate_limit_multiplier"]),
        "success_rate": str(record["submitted_solutions_success_rate"]),
        "is_banned": "false",
    })

    return AgentToken(
        hash=token_hash,
        tier=record["tier"],
        multiplier=record["rate_limit_multiplier"],
    )
