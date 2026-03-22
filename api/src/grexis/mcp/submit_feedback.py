from grexis.services.tokens import resolve_agent_token
from grexis.services.edges import create_edge
from grexis.services.trust import compute_base_score, compute_delta_sum
from grexis.services.rate_limit import check_submission_rate
from grexis.lib.audit import log_to_audit

_CONSECUTIVE_FAILURE_THRESHOLD = 5


async def handle_submit_feedback(
    deps,
    solution_id: str,
    outcome: str,
    environment: dict,
    agent_token: str | None = None,
    comment: str | None = None,
) -> dict:
    token = await resolve_agent_token(deps.postgres, deps.redis, agent_token)

    tier = token.tier if token else "anonymous"
    if not await check_submission_rate(deps.redis, deps.postgres, tier, token.hash if token else None):
        return {"error": "RATE_LIMITED", "retry_after_seconds": 3600}

    # Create feedback event
    record = await deps.postgres.fetchrow("""
        INSERT INTO grexis.feedback_events (
            solution_id, agent_token_hash, outcome, comment,
            llm, framework, framework_version, runtime
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING id
    """,
        solution_id, token.hash if token else None, outcome, comment,
        environment["llm"], environment["framework"],
        environment["framework_version"], environment["runtime"],
    )
    feedback_id = str(record["id"])

    # Create edge
    await create_edge(deps.postgres, "feedback_on_solution", feedback_id, "feedback", solution_id, "solution")

    # Update last_validated_at on success/partial
    if outcome in ("success", "partial"):
        await deps.postgres.execute(
            "UPDATE grexis.solutions SET last_validated_at = NOW() WHERE id = $1::uuid", solution_id
        )

    # Recompute trust score — inline simplified formula (decay/diversity/age
    # are handled by the scheduled decay job every 6 hours)
    feedbacks = await deps.postgres.fetch(
        "SELECT outcome FROM grexis.feedback_events WHERE solution_id = $1::uuid", solution_id
    )

    # Resolve tier from agent_tokens table, fall back to 'anonymous'
    tier = "anonymous"
    if token and token.hash:
        tier_row = await deps.postgres.fetchrow(
            "SELECT tier FROM grexis.agent_tokens WHERE token_hash = $1", token.hash
        )
        if tier_row and tier_row["tier"]:
            tier = tier_row["tier"]

    base = compute_base_score(tier)
    delta_sum = compute_delta_sum([row["outcome"] for row in feedbacks])
    new_score = max(0.0, min(1.0, base + delta_sum))

    await deps.postgres.execute(
        "UPDATE grexis.solutions SET confidence_score = $1 WHERE id = $2::uuid", new_score, solution_id
    )

    # Inline consecutive-failure check (threshold = 5)
    recent_feedbacks = await deps.postgres.fetch(
        """
        SELECT outcome FROM grexis.feedback_events
        WHERE solution_id = $1::uuid
        ORDER BY created_at DESC
        LIMIT 10
        """,
        solution_id,
    )
    consecutive_failures = 0
    for row in recent_feedbacks:
        if row["outcome"] == "failure":
            consecutive_failures += 1
        else:
            break

    if consecutive_failures >= _CONSECUTIVE_FAILURE_THRESHOLD:
        await deps.postgres.execute(
            "UPDATE grexis.solutions SET status = 'flagged' WHERE id = $1::uuid",
            solution_id,
        )
        await deps.postgres.execute(
            """
            UPDATE grexis.solutions
            SET confidence_score = GREATEST(0.0, confidence_score - 0.5)
            WHERE id = $1::uuid
            """,
            solution_id,
        )
        await deps.redis.client.delete(f"diversity:{solution_id}")

    await log_to_audit(deps.postgres, "agent", token.hash if token else "anonymous", "submit_feedback", target_id=solution_id)
    return {"feedback_id": feedback_id, "new_confidence_score": new_score}
