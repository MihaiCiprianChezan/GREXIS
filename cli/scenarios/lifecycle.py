"""Lifecycle test -- full problem -> solution -> cross-agent feedback -> supersede cycle.

Three agents interact with the same problem. Tests trust evolution,
cross-agent validation, negative feedback, and solution supersession.
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
    "error_type": "RateLimitError",
    "error_code": "429",
    "tool_name": "web_search",
    "operation": "search",
    "severity": "blocking",
    "details": "Rate limit exceeded for web_search tool",
}


async def run(client, token: str, reporter: Reporter) -> bool:
    reporter.begin_scenario(
        "Lifecycle Test",
        "Problem -> solution -> cross-agent feedback -> supersede -> duplicate detection",
    )

    token_a = token
    token_b = f"lifecycle-b-{uuid.uuid4().hex[:8]}"
    token_c = f"lifecycle-c-{uuid.uuid4().hex[:8]}"
    problem_id = None
    s1_id = None
    s2_id = None
    initial_score = 0

    # A1: Register three agents
    with reporter.step("Register 3 test agents") as check:
        await client.register_agent(token_a, "Lifecycle Agent A", framework="langchain")
        await client.register_agent(token_b, "Lifecycle Agent B", framework="langchain")
        await client.register_agent(token_c, "Lifecycle Agent C", framework="langchain")
        check(True)

    # A2: Submit problem
    with reporter.step("Agent A submits a problem") as check:
        prob = await client.submit_problem(
            token=token_a,
            failure_signature=FAILURE,
            environment=ENV,
            goal_state="Agent needs web search results but hits rate limit",
        )
        problem_id = prob.get("problem_id")
        check(problem_id is not None, f"got {prob}")

    # A3: Submit solution S1
    with reporter.step("Agent A contributes solution S1 (exponential backoff)") as check:
        sol1 = await client.submit_solution(
            token=token_a,
            problem={
                "failure_signature": FAILURE,
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
        check(s1_id is not None, f"got {sol1}")

    # A4: Positive feedback from Agent A
    with reporter.step("Agent A reports success for S1") as check:
        fb1 = await client.submit_feedback(token_a, s1_id, "success", ENV, "Backoff worked on retry 3")
        initial_score = fb1.get("new_confidence_score", 0)
        check("feedback_id" in fb1, f"got {fb1}")

    # A5: Query finds S1
    await client.admin_activate_solution(s1_id)
    with reporter.step("Query finds S1 in results") as check:
        q1 = await client.query_solutions(token_a, FAILURE, ENV, "Rate limit on web search")
        items = q1 if isinstance(q1, list) else [q1]
        found_s1 = any(r.get("solution_id") == s1_id for r in items)
        check(found_s1, f"S1={s1_id} not in {len(items)} results")

    # B1: Cross-agent positive feedback
    with reporter.step("Agent B confirms S1 works (cross-agent validation)") as check:
        fb2 = await client.submit_feedback(token_b, s1_id, "success", ENV, "Confirmed backoff works")
        cross_score = fb2.get("new_confidence_score", 0)
        check(
            cross_score >= initial_score,
            f"score {cross_score} should be >= initial {initial_score}",
        )

    # C1: Negative feedback
    with reporter.step("Agent C reports failure for S1") as check:
        fb3 = await client.submit_feedback(token_c, s1_id, "failure", ENV, "Backoff didn't help, provider blocked")
        check("feedback_id" in fb3, f"got {fb3}")

    # D1: Superseding solution S2
    with reporter.step("Agent B contributes better solution S2 (fallback provider)") as check:
        sol2 = await client.submit_solution(
            token=token_b,
            problem={
                "failure_signature": FAILURE,
                "goal_state": "Agent needs web search results but hits rate limit",
                "environment": ENV,
                "problem_id": problem_id,
            },
            resolution={
                "solution_summary": "Switch to DuckDuckGo API when primary provider is rate limited",
                "solution_steps": [
                    "Detect RateLimitError from primary provider",
                    "Fall back to DuckDuckGo search API",
                    "Cache the fallback preference for 1 hour",
                ],
                "confidence": "empirical",
            },
        )
        s2_id = sol2.get("solution_id")
        check(s2_id is not None, f"got {sol2}")

    # D2: Multiple positive feedback for S2
    with reporter.step("S2 receives positive feedback from agents B and C") as check:
        if s2_id:
            fb4 = await client.submit_feedback(token_b, s2_id, "success", ENV, "DuckDuckGo fallback works")
            fb5 = await client.submit_feedback(token_c, s2_id, "success", ENV, "Confirmed DuckDuckGo fallback")
            check("feedback_id" in fb4 and "feedback_id" in fb5, f"fb4={fb4}, fb5={fb5}")
        else:
            check(False, "no S2 solution_id")

    # E1: Duplicate detection
    with reporter.step("Duplicate problem is detected and merged") as check:
        dup = await client.submit_problem(
            token=token_a,
            failure_signature=FAILURE,
            environment=ENV,
            goal_state="Web search rate limited again",
        )
        check(dup.get("duplicate_of") is not None, f"expected duplicate_of, got {dup}")

    result = reporter.end_scenario()
    return result.all_passed
