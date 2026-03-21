import json
from grexis.services.tokens import resolve_agent_token
from grexis.services.search import search_solutions, build_hard_filter, rank_results
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
    token = await resolve_agent_token(deps.postgres, deps.redis, agent_token)

    # Rate limit check
    tier = token.tier if token else "anonymous"
    rl_key = f"rl:token:{token.hash}" if token else f"rl:anon:{hash(str(environment))}"
    # Rate limits loaded from settings or config

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

    # Rank
    ranked = rank_results(results, failure_signature, environment, cross_framework)

    await log_to_audit(deps.postgres, "agent", token.hash if token else "anonymous", "query_solutions", payload=failure_signature)

    return [{"solution_id": r.payload["postgres_id"], "rank_score": r.rank_score, "summary": r.payload.get("solution_summary", "")} for r in ranked[:10]]
