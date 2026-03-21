"""Smoke test -- exercises all 5 MCP tools in sequence."""
import logging
import uuid

logger = logging.getLogger(__name__)

TEST_ENV = {
    "framework": "langchain",
    "framework_version": "0.3.0",
    "llm": "gpt-4o",
    "runtime": "python3.12",
}

TEST_FAILURE_SIG = {
    "error_type": "ImportError",
    "error_code": "MODULE_NOT_FOUND",
    "tool_name": "python_repl",
    "operation": "import",
    "severity": "blocking",
    "details": "No module named 'numpy'",
}


async def run(client, token: str) -> bool:
    """Run smoke test. Returns True if all steps pass."""
    results = {"passed": 0, "failed": 0, "errors": []}

    def check(name: str, condition: bool, detail: str = ""):
        if condition:
            results["passed"] += 1
            logger.info("  PASS: %s", name)
        else:
            results["failed"] += 1
            results["errors"].append(f"{name}: {detail}")
            logger.error("  FAIL: %s -- %s", name, detail)

    logger.info("=== SMOKE TEST ===")

    # Step 1: register_agent
    logger.info("Step 1: register_agent")
    try:
        reg = await client.register_agent(
            token, description="Smoke test agent", framework="langchain"
        )
        check(
            "register_agent returns registered=True",
            reg.get("registered") is True,
            f"got {reg}",
        )
    except Exception as e:
        check("register_agent", False, str(e))

    # Step 2: submit_problem
    logger.info("Step 2: submit_problem")
    problem_id = None
    try:
        prob = await client.submit_problem(
            token=token,
            failure_signature=TEST_FAILURE_SIG,
            environment=TEST_ENV,
            goal_state="Import numpy but package not installed",
        )
        check(
            "submit_problem returns problem_id",
            "problem_id" in prob,
            f"got {prob}",
        )
        check(
            "submit_problem status is open",
            prob.get("status") == "open",
            f"got {prob.get('status')}",
        )
        problem_id = prob.get("problem_id")
    except Exception as e:
        check("submit_problem", False, str(e))

    # Step 3: submit_solution
    logger.info("Step 3: submit_solution")
    solution_id = None
    try:
        sol = await client.submit_solution(
            token=token,
            problem={
                "failure_signature": TEST_FAILURE_SIG,
                "goal_state": "Import numpy but package not installed",
                "environment": TEST_ENV,
                "problem_id": problem_id,
            },
            resolution={
                "solution_summary": "Install numpy via pip in the execution environment",
                "solution_steps": [
                    "Run: pip install numpy",
                    "Retry the import",
                    "Verify with: python -c 'import numpy; print(numpy.__version__)'",
                ],
                "confidence": "empirical",
                "time_to_resolution_ms": 5000,
            },
        )
        check(
            "submit_solution returns solution_id",
            "solution_id" in sol,
            f"got {sol}",
        )
        solution_id = sol.get("solution_id")
    except Exception as e:
        check("submit_solution", False, str(e))

    # Step 4: query_solutions
    logger.info("Step 4: query_solutions")
    try:
        results_list = await client.query_solutions(
            token=token,
            failure_signature=TEST_FAILURE_SIG,
            environment=TEST_ENV,
            goal_state="Import numpy but module not found",
        )
        # query_solutions might return a list or a list wrapped in something
        if isinstance(results_list, dict):
            results_list = [results_list]
        check(
            "query_solutions returns results",
            len(results_list) >= 1,
            f"got {len(results_list)} results",
        )
        if results_list and solution_id:
            found = any(
                r.get("solution_id") == solution_id for r in results_list
            )
            check(
                "query_solutions finds our solution",
                found,
                f"solution {solution_id} not in results",
            )
    except Exception as e:
        check("query_solutions", False, str(e))

    # Step 5: submit_feedback
    logger.info("Step 5: submit_feedback")
    if solution_id:
        try:
            fb = await client.submit_feedback(
                token=token,
                solution_id=solution_id,
                outcome="success",
                environment=TEST_ENV,
                comment="Worked after installing numpy 1.26.4",
            )
            check(
                "submit_feedback returns feedback_id",
                "feedback_id" in fb,
                f"got {fb}",
            )
            check(
                "submit_feedback has confidence_score > 0",
                fb.get("new_confidence_score", 0) > 0,
                f"got {fb.get('new_confidence_score')}",
            )
        except Exception as e:
            check("submit_feedback", False, str(e))
    else:
        check(
            "submit_feedback (skipped, no solution_id)",
            False,
            "no solution_id from step 3",
        )

    # Summary
    total = results["passed"] + results["failed"]
    logger.info("=== SMOKE TEST RESULTS: %d/%d passed ===", results["passed"], total)
    if results["errors"]:
        for err in results["errors"]:
            logger.error("  - %s", err)

    return results["failed"] == 0
