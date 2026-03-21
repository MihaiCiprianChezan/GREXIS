"""Smoke test -- exercises all 5 MCP tools in a single happy-path sequence.

Verifies the basic contract: register -> submit problem -> submit solution
-> query -> feedback. Every tool must return the expected shape.
"""
import uuid
from reporter import Reporter

TEST_ENV = {
    "framework": "langchain",
    "framework_version": "0.3.0",
    "llm": "gpt-4o",
    "runtime": "python3.12",
}

TEST_FAILURE = {
    "error_type": "ImportError",
    "error_code": "MODULE_NOT_FOUND",
    "tool_name": "python_repl",
    "operation": "import",
    "severity": "blocking",
    "details": "No module named 'numpy'",
}


async def run(client, token: str, reporter: Reporter) -> bool:
    reporter.begin_scenario(
        "Smoke Test",
        "Happy path through all 5 MCP tools in sequence",
    )

    problem_id = None
    solution_id = None

    # 1. Register agent
    with reporter.step("register_agent returns registered=True") as check:
        reg = await client.register_agent(
            token, description="Smoke test agent", framework="langchain",
        )
        check(reg.get("registered") is True, f"got {reg}")

    # 2. Submit problem
    with reporter.step("submit_problem returns problem_id + status=open") as check:
        prob = await client.submit_problem(
            token=token,
            failure_signature=TEST_FAILURE,
            environment=TEST_ENV,
            goal_state="Import numpy but package not installed",
        )
        problem_id = prob.get("problem_id")
        check(
            problem_id is not None and prob.get("status") == "open",
            f"got {prob}",
        )

    # 3. Submit solution
    with reporter.step("submit_solution returns solution_id") as check:
        sol = await client.submit_solution(
            token=token,
            problem={
                "failure_signature": TEST_FAILURE,
                "goal_state": "Import numpy but package not installed",
                "environment": TEST_ENV,
                "problem_id": problem_id,
            },
            resolution={
                "solution_summary": "Install numpy via pip",
                "solution_steps": [
                    "Run: pip install numpy",
                    "Retry the import statement",
                    "Verify: python -c 'import numpy; print(numpy.__version__)'",
                ],
                "confidence": "empirical",
                "time_to_resolution_ms": 5000,
            },
        )
        solution_id = sol.get("solution_id")
        check(solution_id is not None, f"got {sol}")

    # 4. Query solutions
    await client.admin_activate_solution(solution_id)
    with reporter.step("query_solutions finds our solution") as check:
        results = await client.query_solutions(
            token=token,
            failure_signature=TEST_FAILURE,
            environment=TEST_ENV,
            goal_state="Import numpy but module not found",
        )
        if isinstance(results, dict):
            results = [results]
        found = any(r.get("solution_id") == solution_id for r in results)
        check(found, f"solution {solution_id} not in {len(results)} results")

    # 5. Submit feedback
    with reporter.step("submit_feedback returns feedback_id + confidence > 0") as check:
        if solution_id:
            fb = await client.submit_feedback(
                token=token,
                solution_id=solution_id,
                outcome="success",
                environment=TEST_ENV,
                comment="Worked after installing numpy 1.26.4",
            )
            check(
                "feedback_id" in fb and fb.get("new_confidence_score", 0) > 0,
                f"got {fb}",
            )
        else:
            check(False, "no solution_id from step 3")

    result = reporter.end_scenario()
    return result.all_passed
