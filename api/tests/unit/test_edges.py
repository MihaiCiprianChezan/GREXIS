import pytest
from grexis.services.edges import validate_edge, ValidationError, EDGE_CONSTRAINTS


def test_valid_solution_resolves_problem():
    validate_edge("solution_resolves_problem", "solution", "problem")


def test_valid_feedback_on_solution():
    validate_edge("feedback_on_solution", "feedback", "solution")


def test_invalid_edge_type():
    with pytest.raises(ValidationError, match="Unknown edge type"):
        validate_edge("nonexistent_edge", "solution", "problem")


def test_wrong_node_types():
    with pytest.raises(ValidationError, match="Invalid edge"):
        validate_edge("solution_resolves_problem", "problem", "solution")


def test_all_edge_types_defined():
    assert len(EDGE_CONSTRAINTS) == 5
