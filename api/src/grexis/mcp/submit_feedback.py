from grexis.services.tokens import resolve_agent_token
from grexis.services.edges import create_edge
from grexis.services.trust import compute_confidence_score, handle_consecutive_failures
from grexis.lib.audit import log_to_audit


async def handle_submit_feedback(
    deps,
    solution_id: str,
    outcome: str,
    environment: dict,
    agent_token: str | None = None,
    comment: str | None = None,
) -> dict:
    token = await resolve_agent_token(deps.postgres, deps.redis, agent_token)

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
            "UPDATE grexis.solutions SET last_validated_at = NOW() WHERE id = $1", solution_id
        )

    # Recompute trust score
    solution = await deps.postgres.fetchrow("SELECT * FROM grexis.solutions WHERE id = $1", solution_id)
    feedbacks = await deps.postgres.fetch(
        "SELECT outcome FROM grexis.feedback_events WHERE solution_id = $1", solution_id
    )
    new_score = await compute_confidence_score(solution, feedbacks, deps.redis, deps.config)
    await deps.postgres.execute(
        "UPDATE grexis.solutions SET confidence_score = $1 WHERE id = $2", new_score, solution_id
    )

    # Check consecutive failures
    await handle_consecutive_failures(deps.postgres, deps.redis, solution_id, deps.config)

    await log_to_audit(deps.postgres, "agent", token.hash if token else "anonymous", "submit_feedback", target_id=solution_id)
    return {"feedback_id": feedback_id, "new_confidence_score": new_score}
