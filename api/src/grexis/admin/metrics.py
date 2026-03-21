import asyncio


async def collect_metrics(db, redis) -> dict:
    # Run all queries in parallel for performance
    (
        solutions_active, solutions_total, problems_open, blocking_problems,
        moderation_queue, agent_success_rate,
        agent_tokens_today, mttr, solved_today, attempted_today,
    ) = await asyncio.gather(
        db.fetchval("SELECT COUNT(*) FROM grexis.solutions WHERE status = 'active'"),
        db.fetchval("SELECT COUNT(*) FROM grexis.solutions"),
        db.fetchval("SELECT COUNT(*) FROM grexis.problems WHERE status = 'open'"),
        db.fetchval("SELECT COUNT(*) FROM grexis.problems WHERE status = 'open' AND severity = 'blocking'"),
        db.fetchval("SELECT COUNT(*) FROM grexis.solutions WHERE status = 'pending_review'"),
        _get_agent_success_rate(db),
        redis.get_counter(f"budget:scheduled:{_today()}"),
        _get_mttr(redis),
        db.fetchval("SELECT COUNT(*) FROM grexis.agent_jobs WHERE status = 'completed' AND created_at > CURRENT_DATE"),
        db.fetchval("SELECT COUNT(*) FROM grexis.agent_jobs WHERE created_at > CURRENT_DATE"),
    )

    latency = await _get_latency_percentiles(redis)

    # Get daily token budget from settings
    budget_row = await db.fetchval("SELECT value FROM grexis.settings WHERE key = 'scheduled_agent'")
    daily_budget = 0
    if budget_row:
        import json
        try:
            daily_budget = json.loads(budget_row).get("daily_token_budget", 0) if isinstance(budget_row, str) else budget_row.get("daily_token_budget", 0)
        except Exception:
            pass

    return {
        "active_solutions": solutions_active,
        "total_solutions": solutions_total,
        "open_problems": problems_open,
        "blocking_problems": blocking_problems,
        "moderation_queue": moderation_queue,
        "agent_7d_success_rate": round(agent_success_rate * 100, 1),
        "daily_tokens_used": agent_tokens_today,
        "daily_token_budget": daily_budget,
        "p95_query_latency_ms": latency["p95"],
        "mean_time_to_resolution_hours": mttr / 3_600_000 if mttr else 0.0,
        "problems_solved_today": solved_today,
        "problems_attempted_today": attempted_today,
    }


async def _get_agent_success_rate(db) -> float:
    row = await db.fetchrow("""
        SELECT COUNT(*) FILTER (WHERE status = 'completed') AS ok,
               COUNT(*) AS total
        FROM grexis.agent_jobs
        WHERE created_at > NOW() - INTERVAL '7 days'
    """)
    return (row["ok"] / row["total"]) if row["total"] > 0 else 0.0


async def _get_mttr(redis) -> float:
    samples = await redis.client.lrange("metrics:resolution_times_ms", 0, 999)
    if not samples:
        return 0.0
    values = [float(s) for s in samples]
    return sum(values) / len(values)


async def _get_latency_percentiles(redis) -> dict:
    samples = await redis.client.lrange("metrics:query_latencies", 0, 999)
    if not samples:
        return {"p50": 0, "p95": 0, "p99": 0}
    values = sorted(float(s) for s in samples)
    n = len(values)
    return {
        "p50": values[min(int(n * 0.5), n - 1)],
        "p95": values[min(int(n * 0.95), n - 1)],
        "p99": values[min(int(n * 0.99), n - 1)],
    }


def _today() -> str:
    from datetime import date
    return date.today().isoformat()
