"""Error resilience test -- verifies graceful handling of bad inputs.

Sends malformed, incomplete, and edge-case payloads to every MCP tool.
The system should return structured errors, never crash or hang.
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
        "Error Resilience Test",
        "Malformed inputs, missing fields, bad UUIDs, empty payloads -- no crashes",
    )

    # 1. Empty failure signature
    with reporter.step("submit_problem with empty failure_signature") as check:
        result = await client.submit_problem(
            token=token, failure_signature={}, environment=ENV, goal_state="test",
        )
        # Should return something (error or partial result), not crash
        check(isinstance(result, dict), f"got {type(result)}: {result}")

    # 2. Missing environment fields
    with reporter.step("submit_problem with incomplete environment") as check:
        result = await client.submit_problem(
            token=token,
            failure_signature={"error_type": "TestError", "details": "test"},
            environment={"framework": "langchain"},  # missing llm, runtime, version
            goal_state="test",
        )
        check(isinstance(result, dict), f"got {type(result)}: {result}")

    # 3. Empty goal state
    with reporter.step("submit_problem with empty goal_state") as check:
        result = await client.submit_problem(
            token=token,
            failure_signature={"error_type": "TestError", "details": "test"},
            environment=ENV,
            goal_state="",
        )
        check(isinstance(result, dict), f"got {type(result)}: {result}")

    # 4. Solution with no steps
    with reporter.step("submit_solution with empty solution_steps") as check:
        result = await client.submit_solution(
            token=token,
            problem={
                "failure_signature": {"error_type": "TestError", "details": "test"},
                "goal_state": "test",
                "environment": ENV,
            },
            resolution={
                "solution_summary": "Do nothing",
                "solution_steps": [],
                "confidence": "empirical",
            },
        )
        check(isinstance(result, dict), f"got {type(result)}: {result}")

    # 5. Feedback for non-existent solution UUID
    with reporter.step("submit_feedback for non-existent solution_id") as check:
        fake_id = str(uuid.uuid4())
        result = await client.submit_feedback(
            token=token, solution_id=fake_id, outcome="success", environment=ENV,
        )
        has_error = result.get("error") is not None
        check(has_error, f"expected error for fake ID {fake_id}, got {result}")

    # 6. Feedback with garbage UUID format
    with reporter.step("submit_feedback with malformed UUID") as check:
        result = await client.submit_feedback(
            token=token, solution_id="not-a-uuid", outcome="success", environment=ENV,
        )
        # Should error gracefully
        check(isinstance(result, dict), f"got {type(result)}: {result}")

    # 7. Query with extremely long error details (5KB)
    with reporter.step("query_solutions with very long error text (5KB)") as check:
        long_failure = {
            "error_type": "OverflowError",
            "details": "x" * 5000,
        }
        result = await client.query_solutions(
            token=token, failure_signature=long_failure, environment=ENV,
            goal_state="handle overflow",
        )
        # Should not crash -- may return empty results or truncated
        check(result is not None, f"got None")

    # 8. Register with very long description
    with reporter.step("register_agent with very long description (2KB)") as check:
        long_desc = "A" * 2000
        result = await client.register_agent(
            f"resilience-{uuid.uuid4().hex[:8]}", long_desc, framework="langchain",
        )
        check(isinstance(result, dict), f"got {type(result)}: {result}")

    # 9. Submit solution referencing non-existent problem_id
    with reporter.step("submit_solution with fake problem_id") as check:
        result = await client.submit_solution(
            token=token,
            problem={
                "failure_signature": {"error_type": "TestError", "details": "test"},
                "goal_state": "test",
                "environment": ENV,
                "problem_id": str(uuid.uuid4()),
            },
            resolution={
                "solution_summary": "Phantom fix",
                "solution_steps": ["Step 1"],
                "confidence": "empirical",
            },
        )
        # May succeed (orphan solution) or error -- both are acceptable
        check(isinstance(result, dict), f"got {type(result)}: {result}")

    result = reporter.end_scenario()
    return result.all_passed
