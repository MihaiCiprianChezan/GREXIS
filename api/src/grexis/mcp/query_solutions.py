import time

from grexis.services.tokens import resolve_agent_token
from grexis.services.search import build_hard_filter
from grexis.services.rate_limit import check_query_rate
from grexis.lib.audit import log_to_audit


async def handle_query_solutions(
    deps,
    failure_signature: dict,
    goal_state: str,
    environment: dict,
    agent_token: str | None = None,
    cross_framework: bool = False,
    execution_context: dict | None = None,
) -> list[dict]:
    _start = time.monotonic()
    token = await resolve_agent_token(deps.postgres, deps.redis, agent_token)

    # Rate limit check
    tier = token.tier if token else "anonymous"
    if not await check_query_rate(deps.redis, deps.postgres, tier, token.hash if token else None):
        return [{"error": "RATE_LIMITED", "retry_after_seconds": 60}]

    # Embed query
    embed_text = f"{failure_signature.get('error_type', '')} {failure_signature.get('details', '')} {goal_state}"
    query_vector = await deps.embed_service.embed(embed_text)

    # Search
    hard_filter = build_hard_filter(framework=environment["framework"], cross_framework=cross_framework)
    results = await deps.qdrant.search(
        collection="solutions",
        vector=query_vector,
        filter_=hard_filter,
        limit=20,
    )

    # Sort by Qdrant similarity score (already the primary ranking signal)
    results.sort(key=lambda r: r.score, reverse=True)

    await log_to_audit(deps.postgres, "agent", token.hash if token else "anonymous", "query_solutions", payload=failure_signature)

    # Fetch full details for top results
    top = results[:10]
    if not top:
        return []

    pg_ids = [r.payload["postgres_id"] for r in top]
    # Build parameterized query
    placeholders = ", ".join(f"${i+1}" for i in range(len(pg_ids)))
    rows = await deps.postgres.fetch(
        f"SELECT * FROM grexis.solutions WHERE id::text IN ({placeholders})",
        *pg_ids,
    )
    row_map = {str(r["id"]): dict(r) for r in rows}

    results_out = []
    for r in top:
        pg_id = r.payload["postgres_id"]
        row = row_map.get(pg_id, {})
        results_out.append({
            "solution_id": pg_id,
            "rank_score": r.score,
            "summary": r.payload.get("solution_summary", row.get("solution_summary", "")),
            "solution_steps": list(row.get("solution_steps", [])) if row else [],
            "confidence_score": float(row.get("confidence_score", 0)) if row else 0.0,
            "success_rate": float(row.get("success_rate", 0)) if row else 0.0,
            "source": row.get("source", r.payload.get("source", "")),
            "severity": row.get("severity", r.payload.get("severity", "")),
            "environment_match_score": getattr(r, "env_match_score", 0.0),
        })
    # Record query latency for metrics
    latency_ms = (time.monotonic() - _start) * 1000
    await deps.redis.client.lpush("metrics:query_latencies", str(latency_ms))
    await deps.redis.client.ltrim("metrics:query_latencies", 0, 999)  # keep last 1000

    return results_out
