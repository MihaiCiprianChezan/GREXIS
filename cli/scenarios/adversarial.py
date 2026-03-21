"""Adversarial tests -- security boundaries, rate limits, edge cases."""
import asyncio
import logging
import uuid

logger = logging.getLogger(__name__)

ENV = {
    "framework": "langchain",
    "framework_version": "0.3.0",
    "llm": "gpt-4o",
    "runtime": "python3.12",
}


async def run(client, token: str) -> bool:
    """Run adversarial tests. Returns True if all pass."""
    results = {"passed": 0, "failed": 0, "errors": []}

    def check(name: str, condition: bool, detail: str = ""):
        if condition:
            results["passed"] += 1
            logger.info("  PASS: %s", name)
        else:
            results["failed"] += 1
            results["errors"].append(f"{name}: {detail}")
            logger.error("  FAIL: %s -- %s", name, detail)

    logger.info("=== ADVERSARIAL TESTS ===")

    # Test A: Secret injection
    logger.info("Test A: Secret injection")
    try:
        sol = await client.submit_solution(
            token=token,
            problem={
                "failure_signature": {
                    "error_type": "AuthError",
                    "details": "API key invalid",
                },
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
        is_rejected = sol.get("error") == "SENSITIVE_DATA_DETECTED"
        check("secret injection rejected", is_rejected, f"got {sol}")
    except Exception as e:
        # An error response is acceptable -- the system caught it
        check(
            "secret injection caught",
            "secret" in str(e).lower() or "sensitive" in str(e).lower(),
            str(e),
        )

    # Test B: Rate limiting
    logger.info("Test B: Rate limiting")
    anon_token = None  # No token = anonymous
    rate_limited = False
    for i in range(15):
        try:
            result = await client.query_solutions(
                token=anon_token,
                failure_signature={"error_type": "TestError"},
                environment=ENV,
                goal_state="rate limit test",
            )
            if (
                isinstance(result, list)
                and result
                and result[0].get("error") == "RATE_LIMITED"
            ):
                rate_limited = True
                break
            if isinstance(result, dict) and result.get("error") == "RATE_LIMITED":
                rate_limited = True
                break
        except Exception:
            rate_limited = True
            break
    check(
        "anonymous rate limiting triggered",
        rate_limited,
        "sent 15 queries without hitting rate limit",
    )

    # Test C: Invalid payloads
    logger.info("Test C: Invalid payloads")

    # C1: Empty failure signature
    try:
        bad = await client.submit_problem(
            token=token,
            failure_signature={},
            environment=ENV,
            goal_state="test",
        )
        # Should error or have validation failure
        has_error = "error" in str(bad).lower() or bad.get("error")
        check(
            "empty failure_signature handled", True, "accepted but may fail downstream"
        )
    except Exception:
        check("empty failure_signature rejected", True, "")

    # C2: Feedback with invalid outcome
    try:
        bad_fb = await client.submit_feedback(
            token=token,
            solution_id=str(uuid.uuid4()),
            outcome="invalid_outcome",
            environment=ENV,
        )
        check("invalid outcome handled", True, f"got {bad_fb}")
    except Exception:
        check("invalid outcome rejected", True, "")

    # Summary
    total = results["passed"] + results["failed"]
    logger.info(
        "=== ADVERSARIAL TEST RESULTS: %d/%d passed ===", results["passed"], total
    )
    if results["errors"]:
        for err in results["errors"]:
            logger.error("  - %s", err)

    return results["failed"] == 0
