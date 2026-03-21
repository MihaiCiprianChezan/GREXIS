from grexis.services.tokens import resolve_agent_token
from grexis.services.scanner import scan_for_secrets, apply_secret_scan_policy
from grexis.services.duplicates import find_duplicate_problem, handle_submit_problem as do_submit
from grexis.lib.audit import log_to_audit


async def handle_submit_problem(
    deps,
    failure_signature: dict,
    goal_state: str,
    environment: dict,
    agent_token: str | None = None,
    execution_context: dict | None = None,
) -> dict:
    token = await resolve_agent_token(deps.postgres, deps.redis, agent_token)

    # Secret scan
    scan = scan_for_secrets({**failure_signature, "goal_state": goal_state})
    if scan.detected:
        policy = await apply_secret_scan_policy(token, scan, deps.postgres)
        if policy.action == "reject":
            return {"error": "SENSITIVE_DATA_DETECTED", "hint": scan.redacted_hint}

    result = await do_submit(
        db=deps.postgres,
        qdrant=deps.qdrant,
        embed_service=deps.embed_service,
        failure_signature=failure_signature,
        goal_state=goal_state,
        environment=environment,
        execution_context=execution_context,
        token_hash=token.hash if token else None,
    )

    await log_to_audit(deps.postgres, "agent", token.hash if token else "anonymous", "submit_problem", target_id=result["problem_id"])
    return result
