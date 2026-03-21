"""Ban enforcement test -- verifies that banned tokens are rejected from all tools.

Registers an agent, uses it successfully, then bans it via the admin API,
and confirms that all subsequent MCP tool calls are rejected.

Requires --admin-secret to be provided (skipped otherwise).
"""
import uuid
from reporter import Reporter

ENV = {
    "framework": "langchain",
    "framework_version": "0.3.0",
    "llm": "gpt-4o",
    "runtime": "python3.12",
}


async def run(client, token: str, reporter: Reporter) -> bool:
    reporter.begin_scenario(
        "Ban Enforcement Test",
        "Banned agent tokens are rejected from all MCP tools (requires --admin-secret)",
    )

    ban_token = f"ban-test-{uuid.uuid4().hex[:8]}"

    # 1. Register the agent
    with reporter.step("Register agent (pre-ban)") as check:
        reg = await client.register_agent(ban_token, "Ban test agent", framework="langchain")
        check(reg.get("registered") is True, f"got {reg}")

    # 2. Verify agent can submit a problem
    with reporter.step("Agent can submit a problem (pre-ban)") as check:
        prob = await client.submit_problem(
            token=ban_token,
            failure_signature={"error_type": "TestError", "details": "ban test"},
            environment=ENV,
            goal_state="Test ban enforcement",
        )
        check(prob.get("problem_id") is not None, f"got {prob}")

    # 3. Get the token hash for banning
    with reporter.step("Resolve token hash via admin API") as check:
        import hashlib
        token_hash = hashlib.sha256(ban_token.encode()).hexdigest()
        check(len(token_hash) == 64, f"hash={token_hash}")

    # 4. Ban the token via admin API
    with reporter.step("Ban the agent token via admin API") as check:
        ban_result = await client.admin_ban_token(token_hash, "Automated test ban")
        check(ban_result.get("ok") is True, f"got {ban_result}")

    # 5. Verify submit_problem is rejected
    with reporter.step("submit_problem rejected after ban") as check:
        result = await client.submit_problem(
            token=ban_token,
            failure_signature={"error_type": "TestError", "details": "post-ban test"},
            environment=ENV,
            goal_state="Should be rejected",
        )
        is_banned = result.get("error") == "TOKEN_BANNED"
        check(is_banned, f"expected TOKEN_BANNED, got {result}")

    # 6. Verify query_solutions is rejected
    with reporter.step("query_solutions rejected after ban") as check:
        result = await client.query_solutions(
            token=ban_token,
            failure_signature={"error_type": "TestError"},
            environment=ENV,
            goal_state="Should be rejected",
        )
        err = None
        if isinstance(result, dict):
            err = result.get("error")
        elif isinstance(result, list) and result:
            err = result[0].get("error") if isinstance(result[0], dict) else None
        check(err == "TOKEN_BANNED", f"expected TOKEN_BANNED, got {result}")

    # 7. Verify submit_feedback is rejected
    with reporter.step("submit_feedback rejected after ban") as check:
        result = await client.submit_feedback(
            token=ban_token,
            solution_id=str(uuid.uuid4()),
            outcome="success",
            environment=ENV,
        )
        is_banned = result.get("error") == "TOKEN_BANNED"
        check(is_banned, f"expected TOKEN_BANNED, got {result}")

    # 8. Unban and verify access is restored
    with reporter.step("Unban token and verify access is restored") as check:
        await client.admin_unban_token(token_hash, "Test unban")
        prob2 = await client.submit_problem(
            token=ban_token,
            failure_signature={"error_type": "TestError", "details": "post-unban test"},
            environment=ENV,
            goal_state="Should work again",
        )
        check(prob2.get("problem_id") is not None, f"expected problem_id, got {prob2}")

    result = reporter.end_scenario()
    return result.all_passed
