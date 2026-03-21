import pytest
from unittest.mock import AsyncMock
from grexis.services.trust import compute_base_score, compute_delta_sum


def test_base_score_registered():
    assert compute_base_score("registered") == pytest.approx(0.36, abs=0.01)


def test_base_score_token_only():
    assert compute_base_score("token_only") == pytest.approx(0.30, abs=0.01)


def test_base_score_anonymous():
    assert compute_base_score("anonymous") == pytest.approx(0.21, abs=0.01)


def test_delta_sum_success():
    assert compute_delta_sum(["success"]) == pytest.approx(0.15)


def test_delta_sum_mixed():
    assert compute_delta_sum(["success", "failure", "partial"]) == pytest.approx(0.09, abs=0.01)


def test_delta_sum_empty():
    assert compute_delta_sum([]) == 0.0
