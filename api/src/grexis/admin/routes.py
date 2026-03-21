import json
import uuid

from fastapi import APIRouter, Request, Response, HTTPException, Depends, Query
from grexis.admin.auth import create_session_token, verify_session_token
from grexis.lib.config import get_settings
from grexis.lib.audit import log_to_audit
from grexis import deps

router = APIRouter(prefix="/admin")
auth_router = APIRouter(prefix="/auth")


# --- Auth ---

@auth_router.post("/login")
async def login(request: Request, response: Response):
    body = await request.json()
    settings = get_settings()
    if body.get("secret") != settings.GREXIS_API_SECRET:
        return {"error": "invalid"}
    token = create_session_token(settings.GREXIS_API_SECRET)
    response.set_cookie(
        "grexis_admin_session", token,
        httponly=True, samesite="strict", max_age=8 * 3600,
    )
    return {"ok": True}


@auth_router.get("/me")
async def me(request: Request):
    token = request.cookies.get("grexis_admin_session")
    if not token or not verify_session_token(token, get_settings().GREXIS_API_SECRET):
        raise HTTPException(401)
    return {"ok": True}


@auth_router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("grexis_admin_session")
    return {"ok": True}


async def require_admin(request: Request):
    token = request.cookies.get("grexis_admin_session")
    if not token or not verify_session_token(token, get_settings().GREXIS_API_SECRET):
        raise HTTPException(401, "Unauthorized")


# --- Solutions ---

@router.get("/solutions")
async def list_solutions(
    status: str | None = None, framework: str | None = None,
    error_type: str | None = None, source: str | None = None,
    page: int = 1, per_page: int = 50,
    admin=Depends(require_admin),
):
    conditions = []
    params = []
    idx = 1

    if status:
        conditions.append(f"status = ${idx}")
        params.append(status)
        idx += 1
    if framework:
        conditions.append(f"framework = ${idx}")
        params.append(framework)
        idx += 1
    if error_type:
        conditions.append(f"error_type = ${idx}")
        params.append(error_type)
        idx += 1
    if source:
        conditions.append(f"source = ${idx}")
        params.append(source)
        idx += 1

    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    offset = (page - 1) * per_page

    count = await deps.postgres.fetchval(
        f"SELECT COUNT(*) FROM grexis.solutions {where}", *params
    )
    rows = await deps.postgres.fetch(
        f"SELECT * FROM grexis.solutions {where} ORDER BY created_at DESC LIMIT ${idx} OFFSET ${idx + 1}",
        *params, per_page, offset,
    )
    return {"items": [dict(r) for r in rows], "total": count, "page": page, "per_page": per_page}


@router.get("/solutions/{solution_id}")
async def get_solution(solution_id: str, admin=Depends(require_admin)):
    solution = await deps.postgres.fetchrow(
        "SELECT * FROM grexis.solutions WHERE id = $1", solution_id
    )
    if not solution:
        raise HTTPException(404, "Solution not found")

    feedbacks = await deps.postgres.fetch(
        "SELECT * FROM grexis.feedback_events WHERE solution_id = $1 ORDER BY created_at DESC", solution_id
    )
    edges = await deps.postgres.fetch(
        "SELECT * FROM grexis.resolution_edges WHERE source_node_id = $1 OR target_node_id = $1", solution_id
    )
    return {
        "solution": dict(solution),
        "feedback_events": [dict(f) for f in feedbacks],
        "edges": [dict(e) for e in edges],
    }


@router.post("/solutions")
async def create_solution(request: Request, admin=Depends(require_admin)):
    """Manual solution creation for admin problem resolution (UI Spec Section 4.4)"""
    body = await request.json()

    record = await deps.postgres.fetchrow("""
        INSERT INTO grexis.solutions (
            error_type, error_code, tool_name, operation, severity,
            details_summary, goal_state, llm, framework, framework_version,
            runtime, solution_steps, solution_summary, source, confidence_type,
            status, confidence_score
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        RETURNING id
    """,
        body.get("error_type"), body.get("error_code"), body.get("tool_name"),
        body.get("operation"), body.get("severity"), body.get("details_summary"),
        body.get("goal_state"), body.get("llm"), body.get("framework"),
        body.get("framework_version"), body.get("runtime"),
        body.get("solution_steps", []), body.get("solution_summary"),
        "human_curated", body.get("confidence_type", "empirical"),
        "active", body.get("confidence_score", 0.8),
    )
    solution_id = str(record["id"])

    # Create edge if problem_id provided
    problem_id = body.get("problem_id")
    if problem_id:
        from grexis.services.edges import create_edge
        await create_edge(deps.postgres, "solution_resolves_problem", solution_id, "solution", problem_id, "problem")

    await log_to_audit(
        deps.postgres, "human_admin", "admin", "create_solution",
        target_id=solution_id, reason=body.get("reason", "Manual creation"),
    )
    return {"solution_id": solution_id}


@router.patch("/solutions/{solution_id}")
async def update_solution(solution_id: str, request: Request, admin=Depends(require_admin)):
    body = await request.json()

    allowed_fields = {
        "status", "error_type", "error_code", "tool_name", "operation", "severity",
        "details_summary", "goal_state", "llm", "framework", "framework_version",
        "runtime", "solution_steps", "solution_summary", "confidence_type",
        "confidence_score",
    }

    set_clauses = []
    params = []
    idx = 1
    for key, value in body.items():
        if key in allowed_fields:
            set_clauses.append(f"{key} = ${idx}")
            params.append(value)
            idx += 1

    if not set_clauses:
        raise HTTPException(422, "No valid fields to update")

    params.append(solution_id)
    await deps.postgres.execute(
        f"UPDATE grexis.solutions SET {', '.join(set_clauses)} WHERE id = ${idx}",
        *params,
    )

    # Sync updated fields to Qdrant point (dual-write consistency)
    qdrant_syncable = {"status", "confidence_score", "error_type", "severity",
                       "framework", "framework_version", "runtime", "llm"}
    qdrant_updates = {k: v for k, v in body.items() if k in qdrant_syncable}
    if qdrant_updates:
        row = await deps.postgres.fetchrow(
            "SELECT qdrant_point_id FROM grexis.solutions WHERE id = $1", solution_id
        )
        if row and row["qdrant_point_id"]:
            from qdrant_client.models import SetPayload
            await deps.qdrant.client.set_payload(
                collection_name="solutions",
                payload=qdrant_updates,
                points=[row["qdrant_point_id"]],
            )

    await log_to_audit(
        deps.postgres, "human_admin", "admin", "update_solution",
        target_id=solution_id, payload=body,
    )
    return {"ok": True}


@router.delete("/solutions/{solution_id}")
async def delete_solution(solution_id: str, request: Request, admin=Depends(require_admin)):
    body = await request.json()
    reason = body.get("reason")
    if not reason:
        raise HTTPException(422, "Reason is required for deletion")

    await deps.postgres.execute(
        "UPDATE grexis.solutions SET status = 'inactive' WHERE id = $1", solution_id
    )

    await log_to_audit(
        deps.postgres, "human_admin", "admin", "delete_solution",
        target_id=solution_id, reason=reason,
    )
    return {"ok": True}


# --- Problems ---

@router.get("/problems")
async def list_problems(
    status: str | None = None, severity: str | None = None,
    framework: str | None = None, page: int = 1, per_page: int = 50,
    admin=Depends(require_admin),
):
    conditions = []
    params = []
    idx = 1

    if status:
        conditions.append(f"status = ${idx}")
        params.append(status)
        idx += 1
    if severity:
        conditions.append(f"severity = ${idx}")
        params.append(severity)
        idx += 1
    if framework:
        conditions.append(f"framework = ${idx}")
        params.append(framework)
        idx += 1

    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    offset = (page - 1) * per_page

    count = await deps.postgres.fetchval(
        f"SELECT COUNT(*) FROM grexis.problems {where}", *params
    )
    rows = await deps.postgres.fetch(
        f"SELECT * FROM grexis.problems {where} ORDER BY created_at DESC LIMIT ${idx} OFFSET ${idx + 1}",
        *params, per_page, offset,
    )
    return {"items": [dict(r) for r in rows], "total": count, "page": page, "per_page": per_page}


@router.get("/problems/{problem_id}")
async def get_problem(problem_id: str, admin=Depends(require_admin)):
    problem = await deps.postgres.fetchrow(
        "SELECT * FROM grexis.problems WHERE id = $1", problem_id
    )
    if not problem:
        raise HTTPException(404, "Problem not found")

    # Linked solutions via edges
    solutions = await deps.postgres.fetch("""
        SELECT s.* FROM grexis.solutions s
        JOIN grexis.resolution_edges e ON e.source_node_id = s.id::text
        WHERE e.target_node_id = $1 AND e.edge_type = 'solution_resolves_problem'
    """, problem_id)

    # Agent jobs with synthesis logs
    jobs = await deps.postgres.fetch("""
        SELECT * FROM grexis.agent_jobs
        WHERE problem_id = $1
        ORDER BY created_at DESC
    """, problem_id)

    return {
        "problem": dict(problem),
        "solutions": [dict(s) for s in solutions],
        "agent_jobs": [dict(j) for j in jobs],
    }


# --- Tokens ---

@router.get("/tokens")
async def list_tokens(
    tier: str | None = None, is_banned: bool | None = None,
    page: int = 1, per_page: int = 50,
    admin=Depends(require_admin),
):
    """List all agent tokens with filters (UI Spec Section 4.5)"""
    conditions = []
    params = []
    idx = 1

    if tier:
        conditions.append(f"tier = ${idx}")
        params.append(tier)
        idx += 1
    if is_banned is not None:
        conditions.append(f"is_banned = ${idx}")
        params.append(is_banned)
        idx += 1

    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    offset = (page - 1) * per_page

    count = await deps.postgres.fetchval(
        f"SELECT COUNT(*) FROM grexis.agent_tokens {where}", *params
    )
    rows = await deps.postgres.fetch(
        f"SELECT * FROM grexis.agent_tokens {where} ORDER BY first_seen_at DESC LIMIT ${idx} OFFSET ${idx + 1}",
        *params, per_page, offset,
    )
    return {"items": [dict(r) for r in rows], "total": count, "page": page, "per_page": per_page}


@router.get("/tokens/{token_hash}")
async def get_token(token_hash: str, admin=Depends(require_admin)):
    row = await deps.postgres.fetchrow(
        "SELECT * FROM grexis.agent_tokens WHERE token_hash = $1", token_hash
    )
    if not row:
        raise HTTPException(404, "Token not found")
    return dict(row)


@router.post("/tokens/{token_hash}/ban")
async def ban_token(token_hash: str, request: Request, admin=Depends(require_admin)):
    body = await request.json()
    reason = body.get("reason", "")

    await deps.postgres.execute(
        "UPDATE grexis.agent_tokens SET is_banned = TRUE, ban_reason = $1, banned_at = NOW() WHERE token_hash = $2",
        reason, token_hash,
    )
    # Invalidate Redis cache so ban takes effect immediately
    await deps.redis.client.delete(f"rep:{token_hash}")
    await log_to_audit(
        deps.postgres, "human_admin", "admin", "ban_token",
        target_id=token_hash, reason=reason,
    )
    return {"ok": True}


@router.post("/tokens/{token_hash}/unban")
async def unban_token(token_hash: str, request: Request, admin=Depends(require_admin)):
    """Unban a previously banned token (UI Spec Section 4.5)"""
    body = await request.json()
    reason = body.get("reason", "")
    await deps.postgres.execute(
        "UPDATE grexis.agent_tokens SET is_banned = FALSE, ban_reason = NULL, banned_at = NULL WHERE token_hash = $1",
        token_hash,
    )
    # Invalidate Redis cache so unban takes effect immediately
    await deps.redis.client.delete(f"rep:{token_hash}")
    await log_to_audit(deps.postgres, "human_admin", "admin", "unban_token", target_id=token_hash, reason=reason)
    return {"ok": True}


@router.post("/tokens/{token_hash}/reset")
async def reset_token(token_hash: str, request: Request, admin=Depends(require_admin)):
    body = await request.json()
    reason = body.get("reason", "")

    await deps.postgres.execute(
        "UPDATE grexis.agent_tokens SET submitted_solutions_count = 0, submitted_solutions_success_rate = 0 WHERE token_hash = $1",
        token_hash,
    )
    await log_to_audit(
        deps.postgres, "human_admin", "admin", "reset_token",
        target_id=token_hash, reason=reason,
    )
    return {"ok": True}


# --- Audit, Jobs, Metrics, Clusters, Settings ---

@router.get("/audit")
async def list_audit(
    actor_type: str | None = None, action: str | None = None,
    page: int = 1, per_page: int = 100,
    admin=Depends(require_admin),
):
    conditions = []
    params = []
    idx = 1

    if actor_type:
        conditions.append(f"actor_type = ${idx}")
        params.append(actor_type)
        idx += 1
    if action:
        conditions.append(f"action = ${idx}")
        params.append(action)
        idx += 1

    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    offset = (page - 1) * per_page

    count = await deps.postgres.fetchval(
        f"SELECT COUNT(*) FROM grexis.audit_log {where}", *params
    )
    rows = await deps.postgres.fetch(
        f"SELECT * FROM grexis.audit_log {where} ORDER BY timestamp DESC LIMIT ${idx} OFFSET ${idx + 1}",
        *params, per_page, offset,
    )
    return {"items": [dict(r) for r in rows], "total": count, "page": page, "per_page": per_page}


@router.get("/jobs")
async def list_jobs(status: str | None = None, page: int = 1, per_page: int = 50, admin=Depends(require_admin)):
    conditions = []
    params = []
    idx = 1

    if status:
        conditions.append(f"status = ${idx}")
        params.append(status)
        idx += 1

    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    offset = (page - 1) * per_page

    count = await deps.postgres.fetchval(
        f"SELECT COUNT(*) FROM grexis.agent_jobs {where}", *params
    )
    rows = await deps.postgres.fetch(
        f"SELECT * FROM grexis.agent_jobs {where} ORDER BY created_at DESC LIMIT ${idx} OFFSET ${idx + 1}",
        *params, per_page, offset,
    )
    return {"items": [dict(r) for r in rows], "total": count, "page": page, "per_page": per_page}


@router.get("/metrics")
async def get_metrics(admin=Depends(require_admin)):
    from grexis.admin.metrics import collect_metrics
    return await collect_metrics(deps.postgres, deps.redis)


@router.get("/clusters")
async def list_clusters(admin=Depends(require_admin)):
    rows = await deps.postgres.fetch(
        "SELECT * FROM grexis.failure_clusters ORDER BY member_count DESC"
    )
    return [dict(r) for r in rows]


@router.post("/clusters/{cluster_id}/accept")
async def accept_cluster(cluster_id: str, request: Request, admin=Depends(require_admin)):
    body = await request.json()
    reason = body.get("reason", "")

    await deps.postgres.execute(
        "UPDATE grexis.failure_clusters SET admin_status = 'accepted' WHERE id = $1",
        cluster_id,
    )
    await log_to_audit(
        deps.postgres, "human_admin", "admin", "accept_cluster",
        target_id=cluster_id, reason=reason,
    )
    return {"ok": True}


@router.post("/clusters/{cluster_id}/dismiss")
async def dismiss_cluster(cluster_id: str, request: Request, admin=Depends(require_admin)):
    body = await request.json()
    reason = body.get("reason", "")

    await deps.postgres.execute(
        "UPDATE grexis.failure_clusters SET admin_status = 'dismissed' WHERE id = $1",
        cluster_id,
    )
    await log_to_audit(
        deps.postgres, "human_admin", "admin", "dismiss_cluster",
        target_id=cluster_id, reason=reason,
    )
    return {"ok": True}


@router.post("/clusters/trigger")
async def trigger_clustering(admin=Depends(require_admin)):
    from grexis.scheduler.clustering import run_clustering_job
    result = await run_clustering_job()
    await log_to_audit(
        deps.postgres, "human_admin", "admin", "trigger_clustering",
    )
    return {"ok": True, "result": result}


@router.get("/settings")
async def get_settings_route(admin=Depends(require_admin)):
    rows = await deps.postgres.fetch("SELECT key, value, updated_at FROM grexis.settings")
    result = {}
    for r in rows:
        val = r["value"]
        # asyncpg returns JSONB as Python objects, but double-encoded strings can occur
        if isinstance(val, str):
            try:
                val = json.loads(val)
            except (json.JSONDecodeError, TypeError):
                pass
        result[r["key"]] = val
    return result


@router.patch("/settings")
async def update_settings(request: Request, admin=Depends(require_admin)):
    body = await request.json()

    # Validate search_weights sum to 1.0 if present
    if "search_weights" in body:
        weights = body["search_weights"]
        total = sum(weights.values())
        if abs(total - 1.0) > 0.001:
            raise HTTPException(422, f"Search weights must sum to 1.0, got {total}")

    # Update each key — asyncpg handles JSONB encoding from Python dicts
    for key, value in body.items():
        # asyncpg expects Python objects for JSONB columns, not pre-serialized strings
        await deps.postgres.execute(
            "UPDATE grexis.settings SET value = $1::jsonb, updated_at = NOW() WHERE key = $2",
            json.dumps(value), key,
        )

    # Invalidate rate limits cache if rate_limits were updated
    if "rate_limits" in body:
        from grexis.services.rate_limit import invalidate_rate_limits_cache
        invalidate_rate_limits_cache()

    await log_to_audit(
        deps.postgres, "human_admin", "admin", "update_settings",
        payload=body,
    )
    return {"ok": True}


@router.get("/badge-counts")
async def badge_counts(admin=Depends(require_admin)):
    import asyncio
    problems, moderation, clusters = await asyncio.gather(
        deps.postgres.fetchval("SELECT COUNT(*) FROM grexis.problems WHERE status = 'open'"),
        deps.postgres.fetchval("SELECT COUNT(*) FROM grexis.solutions WHERE status = 'pending_review'"),
        deps.postgres.fetchval("SELECT COUNT(*) FROM grexis.failure_clusters WHERE admin_status = 'pending'"),
    )
    return {"problems": problems, "moderation": moderation, "clusters": clusters}
