"""Tests for seed validation — Task 32."""

from grexis.cli.seed import validate_seed_entry


def _make_valid_seed() -> dict:
    """Return a fully valid seed entry for mutation in tests."""
    return {
        "failure_signature": {
            "error_type": "RateLimitError",
            "error_code": "429",
            "tool_name": "web_search",
            "severity": "blocking",
            "details": "Rate limit exceeded",
        },
        "goal_state": "Retrieve search results",
        "environment": {
            "llm": "claude-sonnet-4-6",
            "framework": "langchain",
            "framework_version": "0.3.1",
            "runtime": "python-3.11",
        },
        "resolution": {
            "solution_steps": ["Step 1", "Step 2"],
            "solution_summary": "Use backoff",
            "confidence": "inferred",
        },
        "provenance": "https://example.com",
    }


def test_validate_valid_seed():
    seed = _make_valid_seed()
    errors = validate_seed_entry(seed)
    assert errors == []


def test_validate_missing_fields():
    seed = {"failure_signature": {"error_type": "Error"}}
    errors = validate_seed_entry(seed)
    assert len(errors) > 0


def test_validate_missing_failure_signature_fields():
    seed = _make_valid_seed()
    del seed["failure_signature"]["details"]
    del seed["failure_signature"]["severity"]
    errors = validate_seed_entry(seed)
    assert any("failure_signature.details" in e for e in errors)
    assert any("failure_signature.severity" in e for e in errors)


def test_validate_invalid_severity():
    seed = _make_valid_seed()
    seed["failure_signature"]["severity"] = "critical"
    errors = validate_seed_entry(seed)
    assert any("severity" in e for e in errors)


def test_validate_invalid_confidence():
    seed = _make_valid_seed()
    seed["resolution"]["confidence"] = "guessed"
    errors = validate_seed_entry(seed)
    assert any("confidence" in e for e in errors)


def test_validate_empty_goal_state():
    seed = _make_valid_seed()
    seed["goal_state"] = ""
    errors = validate_seed_entry(seed)
    assert any("goal_state" in e for e in errors)


def test_validate_empty_solution_steps():
    seed = _make_valid_seed()
    seed["resolution"]["solution_steps"] = []
    errors = validate_seed_entry(seed)
    assert any("solution_steps" in e for e in errors)


def test_validate_missing_environment_fields():
    seed = _make_valid_seed()
    del seed["environment"]["framework"]
    errors = validate_seed_entry(seed)
    assert any("environment.framework" in e for e in errors)


def test_validate_missing_resolution():
    seed = _make_valid_seed()
    del seed["resolution"]
    errors = validate_seed_entry(seed)
    assert any("resolution" in e for e in errors)
