import hashlib
from grexis.services.tokens import resolve_agent_token, hash_token
from grexis.services.rate_limit import check_submission_rate
from grexis.lib.audit import log_to_audit


async def handle_register_agent(
    deps,
    agent_token: str,
    agent_description: str | None = None,
    human_operator_email: str | None = None,
    framework: str | None = None,
) -> dict:
    token = await resolve_agent_token(deps.postgres, deps.redis, agent_token)

    tier = token.tier if token else "anonymous"
    if not await check_submission_rate(deps.redis, deps.postgres, tier, token.hash if token else None):
        return {"error": "RATE_LIMITED", "retry_after_seconds": 3600}

    token_hash = hash_token(agent_token)

    email_hash = None
    if human_operator_email:
        email_hash = hashlib.sha256(human_operator_email.encode()).hexdigest()

    await deps.postgres.execute("""
        UPDATE grexis.agent_tokens
        SET tier = 'registered', agent_description = $1,
            operator_email_hash = $2, framework = $3
        WHERE token_hash = $4
    """, agent_description, email_hash, framework, token_hash)

    # Invalidate Redis cache
    await deps.redis.client.delete(f"rep:{token_hash}")

    await log_to_audit(deps.postgres, "agent", token_hash, "register_agent", target_id=token_hash)
    return {"registered": True, "tier": "registered"}
