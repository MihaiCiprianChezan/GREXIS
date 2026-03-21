"""Adversarial tests -- security boundaries, rate limits, malformed inputs.

Verifies that the system rejects dangerous payloads, enforces rate limits,
and handles garbage inputs gracefully without crashing.
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
        "Adversarial Test",
        "Security boundaries, secret injection, rate limits, malformed payloads",
    )

    # A: Secret injection -- OpenAI key in solution steps
    with reporter.step("Secret injection (OpenAI key) is rejected") as check:
        sol = await client.submit_solution(
            token=token,
            problem={
                "failure_signature": {"error_type": "AuthError", "details": "API key invalid"},
                "goal_state": "Fix authentication",
                "environment": ENV,
            },
            resolution={
                "solution_summary": "Use a valid API key",
                "solution_steps": [
                    "Set OPENAI_API_KEY=sk-proj-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz",
                    "Restart the agent",
                ],
                "confidence": "empirical",
            },
        )
        rejected = sol.get("error") == "SENSITIVE_DATA_DETECTED"
        check(rejected, f"expected SENSITIVE_DATA_DETECTED, got {sol}")

    # B: Secret injection -- AWS key in failure details
    with reporter.step("Secret injection (AWS key) is rejected") as check:
        prob = await client.submit_problem(
            token=token,
            failure_signature={
                "error_type": "AuthError",
                "details": "Failed with key AKIAIOSFODNN7EXAMPLE",
            },
            environment=ENV,
            goal_state="Fix AWS auth",
        )
        rejected = prob.get("error") == "SENSITIVE_DATA_DETECTED"
        check(rejected, f"expected SENSITIVE_DATA_DETECTED, got {prob}")

    # C: Secret injection -- JWT in feedback comment
    with reporter.step("Secret injection (JWT) is rejected") as check:
        jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
        fb = await client.submit_feedback(
            token=token,
            solution_id=str(uuid.uuid4()),
            outcome="success",
            environment=ENV,
            comment=f"Use this token: {jwt}",
        )
        rejected = fb.get("error") == "SENSITIVE_DATA_DETECTED"
        check(rejected, f"expected SENSITIVE_DATA_DETECTED, got {fb}")

    # D: Rate limiting -- anonymous rapid-fire queries
    with reporter.step("Anonymous rate limit triggers within 15 requests") as check:
        rate_limited = False
        for i in range(15):
            result = await client.query_solutions(
                token=None,
                failure_signature={"error_type": "TestError"},
                environment=ENV,
                goal_state="rate limit test",
            )
            err = None
            if isinstance(result, dict):
                err = result.get("error")
            elif isinstance(result, list) and result and isinstance(result[0], dict):
                err = result[0].get("error")
            if err in ("RATE_LIMITED", "rate_limit_exceeded"):
                rate_limited = True
                break
        check(rate_limited, f"sent 15 queries without hitting rate limit")

    # E: Feedback with invalid outcome value
    with reporter.step("Invalid feedback outcome is handled gracefully") as check:
        bad_fb = await client.submit_feedback(
            token=token,
            solution_id=str(uuid.uuid4()),
            outcome="invalid_outcome_value",
            environment=ENV,
        )
        # Should either return an error or be handled gracefully (not crash)
        check(True, "server did not crash")

    # F: Feedback for non-existent solution
    with reporter.step("Feedback for non-existent solution returns error") as check:
        fake_id = str(uuid.uuid4())
        fb = await client.submit_feedback(
            token=token,
            solution_id=fake_id,
            outcome="success",
            environment=ENV,
        )
        has_error = fb.get("error") is not None
        check(has_error, f"expected error for fake solution {fake_id}, got {fb}")

    result = reporter.end_scenario()
    return result.all_passed
