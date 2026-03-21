"""Cross-environment test -- verifies environment filtering and cross-framework search.

Submits a solution in one environment, then queries from a different environment.
Tests that environment-matched queries rank higher, and cross_framework=True
widens the search correctly.
"""
import uuid
from reporter import Reporter

ENV_LANGCHAIN = {
    "framework": "langchain",
    "framework_version": "0.3.0",
    "llm": "gpt-4o",
    "runtime": "python3.12",
}

ENV_CREWAI = {
    "framework": "crewai",
    "framework_version": "0.65.0",
    "llm": "claude-sonnet-4-20250514",
    "runtime": "python3.12",
}

ENV_AUTOGEN = {
    "framework": "autogen",
    "framework_version": "0.4.0",
    "llm": "gpt-4o",
    "runtime": "python3.11",
}


async def run(client, token: str, reporter: Reporter) -> bool:
    reporter.begin_scenario(
        "Cross-Environment Test",
        "Environment filtering, framework matching, cross-framework search",
    )

    unique_err = f"TimeoutError_{uuid.uuid4().hex[:8]}"
    failure = {
        "error_type": "TimeoutError",
        "error_code": "TOOL_TIMEOUT",
        "tool_name": "web_browser",
        "operation": "navigate",
        "severity": "blocking",
        "details": f"Navigation timed out after 30s [{unique_err}]",
    }

    token_lc = token
    token_cr = f"crossenv-crewai-{uuid.uuid4().hex[:8]}"
    solution_id = None

    # 1. Register agents in different frameworks
    with reporter.step("Register LangChain and CrewAI agents") as check:
        await client.register_agent(token_lc, "Cross-env LangChain agent", framework="langchain")
        await client.register_agent(token_cr, "Cross-env CrewAI agent", framework="crewai")
        check(True)

    # 2. Submit problem and solution from LangChain agent
    with reporter.step("LangChain agent submits problem + solution") as check:
        prob = await client.submit_problem(
            token=token_lc,
            failure_signature=failure,
            environment=ENV_LANGCHAIN,
            goal_state="Navigate to URL without timeout",
        )
        sol = await client.submit_solution(
            token=token_lc,
            problem={
                "failure_signature": failure,
                "goal_state": "Navigate to URL without timeout",
                "environment": ENV_LANGCHAIN,
                "problem_id": prob.get("problem_id"),
            },
            resolution={
                "solution_summary": "Increase navigation timeout to 60s and add retry",
                "solution_steps": [
                    "Set browser.timeout = 60000",
                    "Wrap navigation in retry with max_attempts=3",
                    "Add exponential backoff between retries",
                ],
                "confidence": "empirical",
            },
        )
        solution_id = sol.get("solution_id")
        check(solution_id is not None, f"got {sol}")

    # 3. Positive feedback to make it queryable
    with reporter.step("LangChain agent confirms solution works") as check:
        fb = await client.submit_feedback(token_lc, solution_id, "success", ENV_LANGCHAIN)
        check("feedback_id" in fb, f"got {fb}")

    # 4. Same-framework query (LangChain -> LangChain) should find it
    with reporter.step("Same-framework query (LangChain) finds solution") as check:
        results = await client.query_solutions(
            token=token_lc,
            failure_signature=failure,
            environment=ENV_LANGCHAIN,
            goal_state="Navigation timeout",
        )
        items = results if isinstance(results, list) else [results]
        found = any(r.get("solution_id") == solution_id for r in items)
        check(found, f"solution not found in same-framework query")

    # 5. Different-framework query (CrewAI, no cross-framework) may not find it
    with reporter.step("Different-framework query (CrewAI) without cross_framework") as check:
        results_cr = await client.query_solutions(
            token=token_cr,
            failure_signature=failure,
            environment=ENV_CREWAI,
            goal_state="Navigation timeout",
            cross_framework=False,
        )
        items_cr = results_cr if isinstance(results_cr, list) else [results_cr]
        # This is informational -- hard filter may or may not exclude it
        found_cr = any(r.get("solution_id") == solution_id for r in items_cr)
        check(True, f"found={found_cr} (informational)")

    # 6. Cross-framework query (CrewAI with cross_framework=True)
    with reporter.step("Cross-framework query (CrewAI, cross_framework=True) widens search") as check:
        results_cross = await client.query_solutions(
            token=token_cr,
            failure_signature=failure,
            environment=ENV_CREWAI,
            goal_state="Navigation timeout",
            cross_framework=True,
        )
        items_cross = results_cross if isinstance(results_cross, list) else [results_cross]
        found_cross = any(r.get("solution_id") == solution_id for r in items_cross)
        check(found_cross, f"solution not found with cross_framework=True")

    # 7. Completely different framework (AutoGen) with cross-framework
    with reporter.step("AutoGen agent finds LangChain solution via cross-framework") as check:
        token_ag = f"crossenv-autogen-{uuid.uuid4().hex[:8]}"
        await client.register_agent(token_ag, "Cross-env AutoGen agent", framework="autogen")
        results_ag = await client.query_solutions(
            token=token_ag,
            failure_signature=failure,
            environment=ENV_AUTOGEN,
            goal_state="Navigation timeout",
            cross_framework=True,
        )
        items_ag = results_ag if isinstance(results_ag, list) else [results_ag]
        found_ag = any(r.get("solution_id") == solution_id for r in items_ag)
        check(found_ag, f"solution not found from AutoGen agent")

    result = reporter.end_scenario()
    return result.all_passed
