import pytest
from unittest.mock import AsyncMock, MagicMock
from grexis.mcp.query_solutions import handle_query_solutions
from grexis.mcp.submit_problem import handle_submit_problem
from grexis.mcp.submit_solution import handle_submit_solution
from grexis.mcp.submit_feedback import handle_submit_feedback
from grexis.mcp.register_agent import handle_register_agent


def test_all_handlers_callable():
    assert callable(handle_query_solutions)
    assert callable(handle_submit_problem)
    assert callable(handle_submit_solution)
    assert callable(handle_submit_feedback)
    assert callable(handle_register_agent)


@pytest.mark.asyncio
async def test_query_solutions_returns_list():
    mock_deps = MagicMock()
    mock_deps.embed_service.embed = AsyncMock(return_value=[0.1] * 1024)
    mock_deps.qdrant.search = AsyncMock(return_value=[])
    mock_deps.redis = AsyncMock()
    mock_deps.postgres = AsyncMock()

    result = await handle_query_solutions(
        deps=mock_deps,
        failure_signature={"error_type": "RateLimitError", "details": "test"},
        goal_state="test goal",
        environment={"llm": "claude", "framework": "langchain", "framework_version": "0.3.1", "runtime": "python-3.11"},
    )
    assert isinstance(result, list)


@pytest.mark.asyncio
async def test_submit_feedback_recomputes_trust():
    mock_deps = MagicMock()
    mock_deps.postgres.fetchrow = AsyncMock(return_value={"id": "test-id", "agent_token_hash": "hash"})
    mock_deps.postgres.fetch = AsyncMock(return_value=[])
    mock_deps.postgres.execute = AsyncMock()
    mock_deps.redis = AsyncMock()
    mock_deps.redis.get_diversity_factor = AsyncMock(return_value=0.5)

    result = await handle_submit_feedback(
        deps=mock_deps,
        solution_id="test-uuid",
        outcome="success",
        environment={"llm": "claude", "framework": "langchain", "framework_version": "0.3.1", "runtime": "python-3.11"},
    )
    # Should have called execute to update confidence_score
    assert mock_deps.postgres.execute.called
