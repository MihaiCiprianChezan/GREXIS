"""Recovery test -- agent finds nothing, contributes, then retrieves its own solution.

Simulates the cold-start experience: agent queries for a novel error, gets zero
results, submits its own resolution, then verifies the graph now serves it back.
"""
import uuid
from reporter import Reporter

async def run(client, token: str, reporter: Reporter) -> bool:
    reporter.begin_scenario(
        "Recovery Test",
        "Cold start: no results -> contribute -> retrieve own solution",
    )

    # Use a fully unique framework + error type to guarantee zero prior matches
    unique_tag = uuid.uuid4().hex[:8]
    ENV = {
        "framework": f"recovery_fw_{unique_tag}",
        "framework_version": "0.1.0",
        "llm": "claude-sonnet-4-20250514",
        "runtime": "python3.12",
    }
    failure = {
        "error_type": f"RecoveryTestError_{unique_tag}",
        "error_code": "RECOVERY_TEST",
        "tool_name": "code_executor",
        "operation": "import",
        "severity": "blocking",
        "details": f"Novel unique test error [{unique_tag}]",
    }

    solution_id = None

    # 1. Register
    with reporter.step("Register test agent") as check:
        reg = await client.register_agent(token, "Recovery test agent", framework=ENV["framework"])
        check(reg.get("registered") is True, f"got {reg}")

    # 2. Query -- expect empty results
    with reporter.step("Query for novel error returns zero results") as check:
        results = await client.query_solutions(
            token=token,
            failure_signature=failure,
            environment=ENV,
            goal_state=f"Resolve recovery test error [{unique_tag}]",
        )
        items = results if isinstance(results, list) else [results] if results else []
        # Filter out error responses
        real = [r for r in items if isinstance(r, dict) and "solution_id" in r]
        check(len(real) == 0, f"expected 0 results, got {len(real)}")

    # 3. Submit the problem
    with reporter.step("Submit the novel problem") as check:
        prob = await client.submit_problem(
            token=token,
            failure_signature=failure,
            environment=ENV,
            goal_state=f"Resolve recovery test error [{unique_tag}]",
        )
        check(prob.get("problem_id") is not None, f"got {prob}")
        problem_id = prob.get("problem_id")

    # 4. Contribute a solution
    with reporter.step("Contribute a solution for the problem") as check:
        sol = await client.submit_solution(
            token=token,
            problem={
                "failure_signature": failure,
                "goal_state": f"Resolve recovery test error [{unique_tag}]",
                "environment": ENV,
                "problem_id": problem_id,
            },
            resolution={
                "solution_summary": f"Apply recovery fix [{unique_tag}]",
                "solution_steps": [
                    f"Run: fix-recovery-{unique_tag}",
                    "Retry the import",
                ],
                "confidence": "empirical",
                "time_to_resolution_ms": 3000,
            },
        )
        solution_id = sol.get("solution_id")
        check(solution_id is not None, f"got {sol}")

    # 5. Report success
    with reporter.step("Report success feedback") as check:
        fb = await client.submit_feedback(
            token=token,
            solution_id=solution_id,
            outcome="success",
            environment=ENV,
            comment="Module installed and imported successfully",
        )
        check("feedback_id" in fb, f"got {fb}")

    # 6. Query again -- now we should find our solution
    await client.admin_activate_solution(solution_id)
    with reporter.step("Re-query now returns our contributed solution") as check:
        results2 = await client.query_solutions(
            token=token,
            failure_signature=failure,
            environment=ENV,
            goal_state=f"Resolve recovery test error [{unique_tag}]",
        )
        items2 = results2 if isinstance(results2, list) else [results2]
        found = any(r.get("solution_id") == solution_id for r in items2)
        check(found, f"solution {solution_id} not found in {len(items2)} results")

    result = reporter.end_scenario()
    return result.all_passed
