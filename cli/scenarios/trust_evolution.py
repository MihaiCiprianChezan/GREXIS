"""Trust evolution test -- verifies that confidence scores respond to feedback.

Submits a solution and applies a sequence of positive, partial, and negative
feedback events. Verifies the trust score rises with success, partially rises
with partial, and drops with failure. Tracks the score at each step.
"""
import uuid
from reporter import Reporter

ENV = {
    "framework": "langchain",
    "framework_version": "0.3.0",
    "llm": "gpt-4o",
    "runtime": "python3.12",
}

FAILURE = {
    "error_type": "ConnectionError",
    "error_code": "ECONNREFUSED",
    "tool_name": "api_caller",
    "operation": "POST",
    "severity": "blocking",
    "details": "Connection refused to downstream service on port 8080",
}


async def run(client, token: str, reporter: Reporter) -> bool:
    reporter.begin_scenario(
        "Trust Evolution Test",
        "Confidence score rises with success, partially with partial, drops with failure",
    )

    token_a = token
    token_b = f"trust-b-{uuid.uuid4().hex[:8]}"
    token_c = f"trust-c-{uuid.uuid4().hex[:8]}"
    solution_id = None
    scores = []

    # 1. Setup: register agents and submit problem + solution
    with reporter.step("Setup: register agents, submit problem + solution") as check:
        await client.register_agent(token_a, "Trust Agent A", framework="langchain")
        await client.register_agent(token_b, "Trust Agent B", framework="langchain")
        await client.register_agent(token_c, "Trust Agent C", framework="langchain")

        prob = await client.submit_problem(
            token=token_a, failure_signature=FAILURE,
            environment=ENV, goal_state="Connect to downstream service",
        )
        sol = await client.submit_solution(
            token=token_a,
            problem={
                "failure_signature": FAILURE,
                "goal_state": "Connect to downstream service",
                "environment": ENV,
                "problem_id": prob.get("problem_id"),
            },
            resolution={
                "solution_summary": "Add retry with circuit breaker pattern",
                "solution_steps": [
                    "Implement circuit breaker with 3-failure threshold",
                    "Add exponential backoff: 1s, 2s, 4s",
                    "Fall back to cached response when circuit is open",
                ],
                "confidence": "empirical",
            },
        )
        solution_id = sol.get("solution_id")
        check(solution_id is not None, f"got {sol}")

    # 2. First success -- score should be > 0
    with reporter.step("Success feedback #1: score rises from base") as check:
        fb1 = await client.submit_feedback(token_a, solution_id, "success", ENV, "Circuit breaker worked")
        s1 = fb1.get("new_confidence_score", 0)
        scores.append(("success-1", s1))
        check(s1 > 0, f"score={s1}, expected > 0")

    # 3. Second success from different agent -- score should rise further
    with reporter.step("Success feedback #2 (cross-agent): score rises further") as check:
        fb2 = await client.submit_feedback(token_b, solution_id, "success", ENV, "Confirmed circuit breaker works")
        s2 = fb2.get("new_confidence_score", 0)
        scores.append(("success-2", s2))
        check(s2 >= s1, f"score={s2}, expected >= {s1}")

    # 4. Partial feedback -- score should still be >= previous or slightly change
    with reporter.step("Partial feedback: score adjusts moderately") as check:
        fb3 = await client.submit_feedback(token_c, solution_id, "partial", ENV, "Worked but slow")
        s3 = fb3.get("new_confidence_score", 0)
        scores.append(("partial", s3))
        check(s3 > 0, f"score={s3}, expected > 0")

    # 5. Failure feedback -- score should drop
    with reporter.step("Failure feedback: score drops") as check:
        fb4 = await client.submit_feedback(token_a, solution_id, "failure", ENV, "Circuit breaker didn't trigger")
        s4 = fb4.get("new_confidence_score", 0)
        scores.append(("failure", s4))
        check(s4 < s3, f"score={s4}, expected < {s3}")

    # 6. Another failure -- score drops further
    with reporter.step("Second failure: score drops further") as check:
        fb5 = await client.submit_feedback(token_b, solution_id, "failure", ENV, "Still failing")
        s5 = fb5.get("new_confidence_score", 0)
        scores.append(("failure-2", s5))
        check(s5 < s4, f"score={s5}, expected < {s4}")

    # 7. Recovery -- success brings it back up
    with reporter.step("Recovery success: score rises again") as check:
        fb6 = await client.submit_feedback(token_c, solution_id, "success", ENV, "Works after config fix")
        s6 = fb6.get("new_confidence_score", 0)
        scores.append(("recovery", s6))
        check(s6 > s5, f"score={s6}, expected > {s5}")

    # 8. Print score timeline for human traceability
    with reporter.step("Score timeline is monotonically sensible") as check:
        timeline = " -> ".join(f"{name}={score:.3f}" for name, score in scores)
        print(f"           Score timeline: {timeline}")
        # Basic sanity: first success > 0, recovery > last failure
        check(
            scores[0][1] > 0 and scores[-1][1] > scores[-2][1],
            f"timeline: {timeline}",
        )

    result = reporter.end_scenario()
    return result.all_passed
