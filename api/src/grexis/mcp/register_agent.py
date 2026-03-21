import hashlib
from grexis.services.tokens import resolve_agent_token, hash_token
from grexis.lib.audit import log_to_audit


async def handle_register_agent(
    deps,
    agent_token: str,
    agent_description: str | None = None,
    human_operator_email: str | None = None,
    framework: str | None = None,
) -> dict:
    token = await resolve_agent_token(deps.postgres, deps.redis, agent_token)
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
