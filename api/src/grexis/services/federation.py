"""Federation service — Task 18.

Handles ingestion of solutions received from federated (private) GREXIS instances.
Federated solutions are tagged with source="federated" and carry a 0.8x source weight
applied to their confidence score at rank time.

Tech Spec Section 13.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


# ---------------------------------------------------------------------------
# Public constants
# ---------------------------------------------------------------------------

FEDERATED_SOURCE_WEIGHT: float = 0.8


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class FederatedExportPayload:
    """Minimal payload schema for a federated solution export.

    Fields mirror the local solution record except:
    - ``agent_token_hash`` is stripped at export time (no contributor identity).
    - ``source`` is forced to "federated" on ingestion.
    """
    id: str
    framework: str
    llm: str
    framework_version: str
    runtime: str
    error_type: str
    error_code: str | None
    details: str
    solution_text: str
    confidence_score: float
    severity: str
    status: str = "active"
    last_validated_at: str | None = None
    created_at: str | None = None


# ---------------------------------------------------------------------------
# Core ingestion function
# ---------------------------------------------------------------------------

async def ingest_federated_solution(
    payload: FederatedExportPayload,
    db,
    qdrant,
    embed_service,
    audit_logger=None,
) -> str:
    """Create a local record for a federated solution and index it in Qdrant.

    The ``source_weight`` (0.8) is stored alongside the solution so that the
    ``rank_results`` function can apply it as a confidence-score multiplier:

        effective_confidence = confidence_score * 0.8   (if source == "federated")

    Returns the newly created solution UUID.
    """
    payload_dict = {k: v for k, v in payload.__dict__.items()}
    payload_dict.update({
        "source": "federated",
        "source_weight": FEDERATED_SOURCE_WEIGHT,
        "agent_token_hash": None,   # stripped at export — no contributor identity
    })

    record = await db.fetchrow(
        """
        INSERT INTO grexis.solutions (
            framework, llm, framework_version, runtime,
            error_type, error_code, details, solution_text,
            confidence_score, severity, status,
            last_validated_at, source, source_weight, agent_token_hash
        ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8,
            $9, $10, $11,
            $12, $13, $14, $15
        )
        RETURNING id
        """,
        payload.framework,
        payload.llm,
        payload.framework_version,
        payload.runtime,
        payload.error_type,
        payload.error_code,
        payload.details,
        payload.solution_text,
        payload.confidence_score,
        payload.severity,
        payload.status,
        payload.last_validated_at,
        "federated",
        FEDERATED_SOURCE_WEIGHT,
        None,
    )

    solution_id = str(record["id"])

    # Index in Qdrant
    solution_text_for_embed = (
        f"{payload.error_type} {payload.details} {payload.solution_text}"
    )
    vector = await embed_service.embed(solution_text_for_embed)
    await qdrant.upsert(
        collection="solutions",
        point_id=solution_id,
        vector=vector,
        payload={
            **payload_dict,
            "postgres_id": solution_id,
            "confidence_score": payload.confidence_score,
        },
    )

    if audit_logger is not None:
        await audit_logger(action="federated_ingest", target_id=solution_id)

    return solution_id


# ---------------------------------------------------------------------------
# Rank-time helper
# ---------------------------------------------------------------------------

def apply_source_weight(confidence_score: float, source: str) -> float:
    """Return the effective confidence score after applying source weight.

    Locally-verified solutions are unaffected; federated solutions are
    multiplied by FEDERATED_SOURCE_WEIGHT (0.8).
    """
    if source == "federated":
        return confidence_score * FEDERATED_SOURCE_WEIGHT
    return confidence_score
