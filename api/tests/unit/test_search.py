from grexis.services.search import build_hard_filter, compute_env_match_score


def test_hard_filter_same_framework():
    result = build_hard_filter(framework="langchain", cross_framework=False)
    assert len(result["must"]) == 2
    assert result["must"][0]["key"] == "status"
    assert result["must"][1]["key"] == "framework"


def test_hard_filter_cross_framework():
    result = build_hard_filter(framework="langchain", cross_framework=True)
    assert len(result["must"]) == 1
    assert result["must"][0]["key"] == "status"


def test_env_match_exact():
    payload = {"llm": "claude", "framework": "langchain", "framework_version": "0.3.1", "runtime": "python-3.11"}
    score = compute_env_match_score(payload, llm="claude", framework="langchain", framework_version="0.3.1", runtime="python-3.11")
    assert score == 1.0


def test_env_match_minor_version():
    payload = {"llm": "claude", "framework": "langchain", "framework_version": "0.3.2", "runtime": "python-3.11"}
    score = compute_env_match_score(payload, llm="claude", framework="langchain", framework_version="0.3.1", runtime="python-3.11")
    assert score == 0.8
