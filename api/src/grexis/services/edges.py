"""Edge constraint enforcement — Task 14.

Validates edge types against their allowed source/target node types before insertion.
"""

from __future__ import annotations


class ValidationError(Exception):
    pass


# Five canonical edge types — verbatim from Tech Spec Section 8.
EDGE_CONSTRAINTS: dict[str, dict[str, str]] = {
    "solution_resolves_problem":      {"source": "solution", "target": "problem"},
    "feedback_on_solution":           {"source": "feedback", "target": "solution"},
    "problem_branches_from_solution": {"source": "problem",  "target": "solution"},
    "solution_improves_solution":     {"source": "solution", "target": "solution"},
    "duplicate_problem":              {"source": "problem",  "target": "problem"},
}


def validate_edge(edge_type: str, source_type: str, target_type: str) -> None:
    """Raise ValidationError if the edge type / node-type combination is invalid."""
    constraint = EDGE_CONSTRAINTS.get(edge_type)
    if not constraint:
        raise ValidationError(f"Unknown edge type: {edge_type}")
    if constraint["source"] != source_type or constraint["target"] != target_type:
        raise ValidationError(
            f"Invalid edge: {edge_type} requires {constraint['source']} -> {constraint['target']}, "
            f"got {source_type} -> {target_type}"
        )


async def create_edge(
    db,
    edge_type: str,
    source_node_id: str,
    source_node_type: str,
    target_node_id: str,
    target_node_type: str,
) -> str:
    """Validate the edge then insert into grexis.resolution_edges, returning the new UUID."""
    validate_edge(edge_type, source_node_type, target_node_type)
    record = await db.fetchrow(
        """
        INSERT INTO grexis.resolution_edges (source_node_id, source_node_type, target_node_id, target_node_type, edge_type)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
        """,
        source_node_id,
        source_node_type,
        target_node_id,
        target_node_type,
        edge_type,
    )
    return str(record["id"])
