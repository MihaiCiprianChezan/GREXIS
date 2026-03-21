import hashlib
import json
from grexis.db.postgres import PostgresClient


def compute_payload_hash(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


async def log_to_audit(
    db: PostgresClient,
    actor_type: str,
    actor_id_hash: str,
    action: str,
    target_id: str | None = None,
    payload: dict | None = None,
    reason: str | None = None,
) -> None:
    payload_hash = compute_payload_hash(payload or {})
    await db.execute(
        """
        INSERT INTO grexis.audit_log (actor_type, actor_id_hash, action, target_id, payload_hash, reason)
        VALUES ($1, $2, $3, $4, $5, $6)
        """,
        actor_type,
        actor_id_hash,
        action,
        target_id,
        payload_hash,
        reason,
    )
