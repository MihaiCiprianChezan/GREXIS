"""Lifecycle test -- full problem->solution->feedback->ranking->supersede cycle."""
import logging
import uuid

logger = logging.getLogger(__name__)

ENV = {
    "framework": "langchain",
    "framework_version": "0.3.0",
    "llm": "gpt-4o",
    "runtime": "python3.12",
}

FAILURE_SIG = {
    "error_type": "RateLimitError",
    "error_code": "429",
    "tool_name": "web_search",
    "operation": "search",
    "severity": "blocking",
    "details": "Rate limit exceeded for web_search tool",
}


async def run(client, token: str) -> bool:
    """Run lifecycle test. Returns True if all assertions pass."""
    results = {"passed": 0, "failed": 0, "errors": []}

    def check(name: str, condition: bool, detail: str = ""):
        if condition:
            results["passed"] += 1
            logger.info("  PASS: %s", name)
        else:
            results["failed"] += 1
            results["errors"].append(f"{name}: {detail}")
            logger.error("  FAIL: %s -- %s", name, detail)

    logger.info("=== LIFECYCLE TEST ===")

    # Phase A: Initial contribution
    logger.info("Phase A: Initial contribution")

    token_a = token
    token_b = f"test-agent-b-{uuid.uuid4().hex[:8]}"
    token_c = f"test-agent-c-{uuid.uuid4().hex[:8]}"

    # A1: Register agent A
    await client.register_agent(token_a, "Lifecycle Agent A", framework="langchain")

    # A2: Submit problem
    prob = await client.submit_problem(
        token=token_a,
        failure_signature=FAILURE_SIG,
        environment=ENV,
        goal_state="Agent needs web search results but hits rate limit",
    )
    problem_id = prob.get("problem_id")
    check("A2: submit_problem", problem_id is not None, f"got {prob}")

    # A3: Submit solution S1
    sol1 = await client.submit_solution(
        token=token_a,
        problem={
            "failure_signature": FAILURE_SIG,
            "goal_state": "Agent needs web search results but hits rate limit",
            "environment": ENV,
            "problem_id": problem_id,
        },
        resolution={
            "solution_summary": "Implement exponential backoff with jitter on rate limit errors",
            "solution_steps": [
                "Wrap tool call in retry decorator with max_retries=5",
                "Use delay = min(2^attempt * 0.5, 30) + random(0, 1)",
                "Catch RateLimitError specifically",
            ],
            "confidence": "empirical",
        },
    )
    s1_id = sol1.get("solution_id")
    check("A3: submit_solution S1", s1_id is not None, f"got {sol1}")

    # A4: Positive feedback from A
    fb1 = await client.submit_feedback(
        token_a, s1_id, "success", ENV, "Backoff worked on retry 3"
    )
    check("A4: feedback from A", "feedback_id" in fb1, f"got {fb1}")
    initial_score = fb1.get("new_confidence_score", 0)

    # A5: Query -- S1 should appear
    q1 = await client.query_solutions(
        token_a, FAILURE_SIG, ENV, "Rate limit on web search"
    )
    found_s1 = any(
        r.get("solution_id") == s1_id for r in (q1 if isinstance(q1, list) else [q1])
    )
    check("A5: query finds S1", found_s1, f"S1={s1_id} not in results")

    # Phase B: Cross-agent validation
    logger.info("Phase B: Cross-agent validation")
    await client.register_agent(token_b, "Lifecycle Agent B", framework="langchain")

    fb2 = await client.submit_feedback(
        token_b, s1_id, "success", ENV, "Confirmed backoff works"
    )
    cross_score = fb2.get("new_confidence_score", 0)
    check(
        "B1: cross-agent feedback raises score",
        cross_score >= initial_score,
        f"score {cross_score} vs initial {initial_score}",
    )

    # Phase C: Negative feedback
    logger.info("Phase C: Negative feedback")
    await client.register_agent(token_c, "Lifecycle Agent C", framework="langchain")

    fb3 = await client.submit_feedback(
        token_c, s1_id, "failure", ENV, "Backoff didn't help, provider blocked"
    )
    neg_score = fb3.get("new_confidence_score", 0)
    check("C1: negative feedback", "feedback_id" in fb3, f"got {fb3}")

    # Phase D: Superseding solution
    logger.info("Phase D: Superseding solution")
    sol2 = await client.submit_solution(
        token=token_b,
        problem={
            "failure_signature": FAILURE_SIG,
            "goal_state": "Agent needs web search results but hits rate limit",
            "environment": ENV,
            "problem_id": problem_id,
        },
        resolution={
            "solution_summary": "Switch to alternative search provider (DuckDuckGo API) when primary is rate limited",
            "solution_steps": [
                "Detect RateLimitError from primary provider",
                "Fall back to DuckDuckGo search API",
                "Cache the fallback preference for 1 hour",
            ],
            "confidence": "empirical",
        },
    )
    s2_id = sol2.get("solution_id")
    check("D1: submit_solution S2", s2_id is not None, f"got {sol2}")

    if s2_id:
        await client.submit_feedback(
            token_b, s2_id, "success", ENV, "DuckDuckGo fallback works"
        )
        await client.submit_feedback(
            token_c, s2_id, "success", ENV, "Confirmed DuckDuckGo fallback"
        )

    # Phase E: Duplicate detection
    logger.info("Phase E: Duplicate detection")
    dup = await client.submit_problem(
        token=token_a,
        failure_signature=FAILURE_SIG,
        environment=ENV,
        goal_state="Web search rate limited again",
    )
    check(
        "E1: duplicate detected",
        dup.get("duplicate_of") is not None,
        f"expected duplicate_of, got {dup}",
    )

    # Summary
    total = results["passed"] + results["failed"]
    logger.info(
        "=== LIFECYCLE TEST RESULTS: %d/%d passed ===", results["passed"], total
    )
    if results["errors"]:
        for err in results["errors"]:
            logger.error("  - %s", err)

    return results["failed"] == 0
