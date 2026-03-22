import uuid
from grexis.services.tokens import resolve_agent_token
from grexis.services.scanner import scan_for_secrets, apply_secret_scan_policy
from grexis.services.duplicates import build_duplicate_filter
from grexis.services.edges import create_edge
from grexis.services.rate_limit import check_submission_rate
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

    tier = token.tier if token else "anonymous"
    if not await check_submission_rate(deps.redis, deps.postgres, tier, token.hash if token else None):
        return {"error": "RATE_LIMITED", "retry_after_seconds": 3600}

    # Secret scan
    scan = scan_for_secrets({**failure_signature, "goal_state": goal_state})
    if scan.detected:
        policy = await apply_secret_scan_policy(token, scan)
        if policy.action == "reject":
            return {"error": "SENSITIVE_DATA_DETECTED", "hint": scan.redacted_hint}

    # Embed the problem text
    embed_text = (
        f"{failure_signature['error_type']} "
        f"{failure_signature.get('details', '')} "
        f"{goal_state}"
    )
    vec = await deps.embed_service.embed(embed_text)

    # Search Qdrant for duplicates
    filter_dict = build_duplicate_filter(
        framework=environment.get("framework", ""),
        error_type=failure_signature["error_type"],
    )
    candidates = await deps.qdrant.search(
        collection="problems",
        vector=vec,
        filter_=filter_dict,
        limit=5,
        score_threshold=0.92,
    )

    if candidates:
        # Duplicate found — increment count, create edge, return existing
        existing_postgres_id = candidates[0].payload["postgres_id"]
        await deps.postgres.execute(
            "UPDATE grexis.problems SET duplicate_count = duplicate_count + 1 WHERE id = $1::uuid",
            existing_postgres_id,
        )
        existing_id = str(existing_postgres_id)
        # Use a new uuid as a transient source node reference
        transient_ref = str(uuid.uuid4())
        await create_edge(
            deps.postgres, "duplicate_problem",
            transient_ref, "problem",
            existing_id, "problem",
        )
        await log_to_audit(
            deps.postgres, "agent",
            token.hash if token else "anonymous",
            "submit_problem", target_id=existing_id,
        )
        return {"problem_id": existing_id, "status": "open", "duplicate_of": existing_id}

    # No duplicate — INSERT new problem
    record = await deps.postgres.fetchrow("""
        INSERT INTO grexis.problems (
            error_type, error_code, tool_name, operation, severity,
            details, goal_state, llm, framework, framework_version,
            runtime, submitted_by_token_hash, status, duplicate_count
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING id
    """,
        failure_signature.get("error_type"),
        failure_signature.get("error_code"),
        failure_signature.get("tool_name"),
        failure_signature.get("operation"),
        failure_signature.get("severity"),
        failure_signature.get("details"),
        goal_state,
        environment.get("llm"),
        environment.get("framework"),
        environment.get("framework_version"),
        environment.get("runtime"),
        token.hash if token else None,
        "open",
        1,
    )
    problem_id = str(record["id"])
    qdrant_point_id = str(uuid.uuid4())

    # Index in Qdrant
    try:
        await deps.qdrant.upsert_point("problems", qdrant_point_id, vec, {
            "postgres_id": problem_id,
            "framework": environment.get("framework"),
            "error_type": failure_signature.get("error_type"),
            "status": "open",
        })
    except Exception:
        pass  # Non-fatal; Qdrant sync job will retry

    await log_to_audit(
        deps.postgres, "agent",
        token.hash if token else "anonymous",
        "submit_problem", target_id=problem_id,
    )
    return {"problem_id": problem_id, "status": "open", "duplicate_of": None}
