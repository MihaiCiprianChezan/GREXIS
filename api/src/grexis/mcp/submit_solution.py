import uuid
from grexis.services.tokens import resolve_agent_token
from grexis.services.scanner import scan_for_secrets, apply_secret_scan_policy
from grexis.services.edges import create_edge
from grexis.services.rate_limit import check_submission_rate
from grexis.lib.audit import log_to_audit


async def handle_submit_solution(
    deps,
    problem: dict,
    resolution: dict,
    agent_token: str | None = None,
    session_id: str | None = None,
) -> dict:
    token = await resolve_agent_token(deps.postgres, deps.redis, agent_token)

    tier = token.tier if token else "anonymous"
    if not await check_submission_rate(deps.redis, deps.postgres, tier, token.hash if token else None):
        return {"error": "RATE_LIMITED", "retry_after_seconds": 3600}

    # Secret scan on both problem and resolution
    full_payload = {**problem, **resolution}
    scan = scan_for_secrets(full_payload)
    if scan.detected:
        policy = await apply_secret_scan_policy(token, scan)
        if policy.action == "reject":
            return {"error": "SENSITIVE_DATA_DETECTED", "hint": scan.redacted_hint}

    env = problem["environment"]
    sig = problem["failure_signature"]
    qdrant_point_id = str(uuid.uuid4())

    # 1. Write to Postgres (source of truth)
    record = await deps.postgres.fetchrow("""
        INSERT INTO grexis.solutions (
            error_type, error_code, tool_name, operation, severity,
            details_summary, goal_state, llm, framework, framework_version,
            runtime, solution_steps, solution_summary, source, confidence_type,
            agent_token_hash, qdrant_point_id, status, confidence_score
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        RETURNING id
    """,
        sig.get("error_type"), sig.get("error_code"), sig.get("tool_name"),
        sig.get("operation"), sig.get("severity"), sig.get("details"),
        problem["goal_state"], env["llm"], env["framework"], env["framework_version"],
        env["runtime"], resolution["solution_steps"], resolution["solution_summary"],
        "agent_contributed", resolution.get("confidence", "empirical"),
        token.hash if token else None, qdrant_point_id, "pending_review", 0.3,
    )
    solution_id = str(record["id"])

    # 2. Index in Qdrant (dual-write)
    embed_text = f"{sig.get('error_type','')} {sig.get('details','')} {problem['goal_state']} {resolution['solution_summary']}"
    vector = await deps.embed_service.embed(embed_text)
    try:
        await deps.qdrant.upsert_point("solutions", qdrant_point_id, vector, {
            "postgres_id": solution_id, "framework": env["framework"],
            "framework_version": env["framework_version"], "runtime": env["runtime"],
            "llm": env["llm"], "error_type": sig.get("error_type"),
            "severity": sig.get("severity"), "status": "pending_review",
            "source": "agent_contributed", "confidence_score": 0.3,
            "success_rate": 0.0, "attempt_count": 0, "last_validated_at": 0,
        })
    except Exception:
        await deps.postgres.execute(
            "UPDATE grexis.solutions SET status = 'pending_index' WHERE id = $1", record["id"]
        )

    # 3. Create edge (link solution to its originating problem if known)
    problem_id = problem.get("problem_id")
    if problem_id:
        await create_edge(deps.postgres, "solution_resolves_problem", solution_id, "solution", problem_id, "problem")

    # Record resolution time if provided
    time_to_resolution = resolution.get("time_to_resolution_ms")
    if time_to_resolution is not None:
        await deps.redis.client.lpush("metrics:resolution_times_ms", str(time_to_resolution))
        await deps.redis.client.ltrim("metrics:resolution_times_ms", 0, 999)

    await log_to_audit(deps.postgres, "agent", token.hash if token else "anonymous", "submit_solution", target_id=solution_id)
    return {"solution_id": solution_id}
