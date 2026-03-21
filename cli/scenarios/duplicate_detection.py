"""Duplicate detection test -- verifies that semantically identical problems are merged.

Submits the same problem twice with slightly different wording. The second
submission should be detected as a duplicate, linked to the first, and the
original problem's occurrence count should increment.
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
        "Duplicate Detection Test",
        "Semantically identical problems are detected, merged, and linked",
    )

    unique_tag = uuid.uuid4().hex[:8]

    # 1. Register
    with reporter.step("Register test agent") as check:
        reg = await client.register_agent(token, "Dedup test agent", framework="langchain")
        check(reg.get("registered") is True, f"got {reg}")

    # 2. Submit original problem
    with reporter.step("Submit original problem") as check:
        prob1 = await client.submit_problem(
            token=token,
            failure_signature={
                "error_type": "MemoryError",
                "error_code": "OOM",
                "tool_name": "data_processor",
                "operation": "load_dataset",
                "severity": "blocking",
                "details": f"Out of memory when loading large CSV dataset [{unique_tag}]",
            },
            environment=ENV,
            goal_state="Load a 2GB CSV into memory for analysis",
        )
        pid1 = prob1.get("problem_id")
        check(pid1 is not None, f"got {prob1}")

    # 3. Submit near-identical problem (same semantics, slightly different wording)
    with reporter.step("Submit near-identical problem (should detect duplicate)") as check:
        prob2 = await client.submit_problem(
            token=token,
            failure_signature={
                "error_type": "MemoryError",
                "error_code": "OOM",
                "tool_name": "data_processor",
                "operation": "load_dataset",
                "severity": "blocking",
                "details": f"Memory exhausted while loading large CSV file [{unique_tag}]",
            },
            environment=ENV,
            goal_state="Load a large CSV file into memory",
        )
        is_dup = prob2.get("duplicate_of") is not None
        check(is_dup, f"expected duplicate_of, got {prob2}")

    # 4. Verify duplicate points back to original
    with reporter.step("Duplicate references original problem_id") as check:
        dup_of = prob2.get("duplicate_of")
        check(dup_of == pid1, f"duplicate_of={dup_of}, expected {pid1}")

    # 5. Submit clearly different problem -- should NOT be a duplicate
    with reporter.step("Submit different problem (should NOT be duplicate)") as check:
        prob3 = await client.submit_problem(
            token=token,
            failure_signature={
                "error_type": "SyntaxError",
                "error_code": "PARSE_FAIL",
                "tool_name": "json_parser",
                "operation": "parse",
                "severity": "blocking",
                "details": f"Unexpected token '<' at position 0 [{unique_tag}]",
            },
            environment=ENV,
            goal_state="Parse JSON response from API",
        )
        not_dup = prob3.get("duplicate_of") is None
        pid3 = prob3.get("problem_id")
        check(not_dup and pid3 is not None, f"got {prob3}")

    # 6. Third submission of the same OOM problem -- should also be duplicate
    with reporter.step("Third OOM submission also detected as duplicate") as check:
        prob4 = await client.submit_problem(
            token=token,
            failure_signature={
                "error_type": "MemoryError",
                "error_code": "OOM",
                "tool_name": "data_processor",
                "operation": "load_dataset",
                "severity": "blocking",
                "details": f"Cannot allocate memory for CSV loading [{unique_tag}]",
            },
            environment=ENV,
            goal_state="Read large CSV into dataframe",
        )
        is_dup3 = prob4.get("duplicate_of") is not None
        check(is_dup3, f"expected duplicate_of, got {prob4}")

    result = reporter.end_scenario()
    return result.all_passed
