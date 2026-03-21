"""Pending index retry job — Phase 2.3.

Retries Qdrant indexing for solutions that failed their initial dual-write.
These solutions have status = 'pending_index' in Postgres.
"""

import logging
import uuid

from grexis import deps

logger = logging.getLogger(__name__)


async def retry_pending_indexes() -> int:
    """Find solutions with status='pending_index' and retry Qdrant upsert.

    Returns the number of successfully indexed solutions.
    """
    rows = await deps.postgres.fetch(
        "SELECT * FROM grexis.solutions WHERE status = 'pending_index' LIMIT 50"
    )

    if not rows:
        return 0

    success_count = 0
    for row in rows:
        solution_id = str(row["id"])
        try:
            # Build embedding text (convert Record to dict for safe .get() access)
            d = dict(row)
            embed_text = (
                f"{d['error_type']} "
                f"{d.get('details_summary', '') or ''} "
                f"{d['goal_state']} "
                f"{d['solution_summary']}"
            )
            vector = await deps.embed_service.embed(embed_text)

            # Generate or reuse qdrant_point_id
            point_id = str(row["qdrant_point_id"]) if row["qdrant_point_id"] else str(uuid.uuid4())

            await deps.qdrant.upsert_point("solutions", point_id, vector, {
                "postgres_id": solution_id,
                "framework": d["framework"],
                "framework_version": d["framework_version"],
                "runtime": d["runtime"],
                "llm": d["llm"],
                "error_type": d["error_type"],
                "severity": d.get("severity"),
                "status": "pending_review",
                "source": d["source"],
                "confidence_score": float(d["confidence_score"]),
                "success_rate": float(d["success_rate"]),
                "attempt_count": int(d["attempt_count"]),
                "last_validated_at": 0,
            })

            # Update status back to pending_review and set qdrant_point_id
            await deps.postgres.execute(
                "UPDATE grexis.solutions SET status = 'pending_review', qdrant_point_id = $1 WHERE id = $2",
                uuid.UUID(point_id), row["id"],
            )
            success_count += 1
            logger.info("Successfully indexed solution %s in Qdrant", solution_id)

        except Exception:
            logger.exception("Failed to retry Qdrant index for solution %s", solution_id)

    logger.info("Pending index retry: %d/%d succeeded", success_count, len(rows))
    return success_count
