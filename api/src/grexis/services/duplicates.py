"""Duplicate problem detection — Task 15.

Before creating a new problem record the platform checks for semantic duplicates
using vector similarity in the Qdrant problems collection (threshold: 0.92).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


# ---------------------------------------------------------------------------
# Public constants
# ---------------------------------------------------------------------------

DUPLICATE_THRESHOLD: float = 0.92


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class SubmitProblemResult:
    existing: bool
    problem_id: str


# ---------------------------------------------------------------------------
# Filter builder (pure — no I/O)
# ---------------------------------------------------------------------------

def build_duplicate_filter(framework: str, error_type: str) -> dict:
    """Build the Qdrant must-filter used during duplicate search.

    Returns a dict with a ``must`` list of three match conditions:
    ``framework``, ``error_type``, and ``status`` (open or solved).
    """
    return {
        "must": [
            {"key": "framework",   "match": {"value": framework}},
            {"key": "error_type",  "match": {"value": error_type}},
            {"key": "status",      "match": {"any": ["open", "solved"]}},
        ]
    }


# ---------------------------------------------------------------------------
# Core async functions
# ---------------------------------------------------------------------------

async def find_duplicate_problem(
    payload,           # SubmitProblemPayload — typed loosely to avoid hard dep
    embed_service,     # grexis.lib.embed.EmbedService
    qdrant,            # grexis.db.qdrant.QdrantClient
    db,                # asyncpg connection / pool
) -> Any | None:
    """Embed the incoming problem and search Qdrant for a semantic duplicate.

    Returns the existing Problem record if one is found above the 0.92
    cosine similarity threshold, otherwise None.
    """
    incoming_vector = await embed_service.embed(
        f"{payload.failure_signature.error_type} "
        f"{payload.failure_signature.details} "
        f"{payload.goal_state}"
    )

    qdrant_filter = build_duplicate_filter(
        framework=payload.environment.framework,
        error_type=payload.failure_signature.error_type,
    )

    candidates = await qdrant.search(
        collection="problems",
        vector=incoming_vector,
        query_filter=qdrant_filter,
        limit=5,
        score_threshold=DUPLICATE_THRESHOLD,
    )

    if not candidates:
        return None

    # Return the first match above threshold, fetched from Postgres
    postgres_id = candidates[0].payload["postgres_id"]
    return await db.fetchrow(
        "SELECT * FROM grexis.problems WHERE id = $1",
        postgres_id,
    )


async def handle_submit_problem(
    payload,           # SubmitProblemPayload
    embed_service,
    qdrant,
    db,
    create_problem_fn,
    index_problem_fn,
    increment_duplicate_count_fn,
    create_edge_fn,
) -> SubmitProblemResult:
    """Top-level handler for problem submissions.

    If a semantic duplicate is found (>= 0.92 cosine similarity):
    - Increment the existing problem's duplicate count.
    - Create a ``duplicate_problem`` edge.
    - Return the existing problem ID.

    Otherwise:
    - Create a new problem record.
    - Index it in Qdrant.
    - Return the new problem ID.
    """
    duplicate = await find_duplicate_problem(payload, embed_service, qdrant, db)

    if duplicate:
        await increment_duplicate_count_fn(duplicate["id"])
        await create_edge_fn(
            db=db,
            edge_type="duplicate_problem",
            source_node_id=payload.session_id,   # ephemeral reference
            source_node_type="problem",
            target_node_id=str(duplicate["id"]),
            target_node_type="problem",
        )
        return SubmitProblemResult(existing=True, problem_id=str(duplicate["id"]))

    # No duplicate — create new problem record
    problem = await create_problem_fn(payload, db)
    await index_problem_fn(problem, qdrant, embed_service)
    return SubmitProblemResult(existing=False, problem_id=str(problem["id"]))
