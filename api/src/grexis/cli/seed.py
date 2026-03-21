"""Seeding CLI for cold-start bootstrapping — Task 32.

Reads JSON seed files, validates entries, scans for secrets, checks for
duplicates, and ingests into Postgres + Qdrant.

Tech Spec Section 16.

Usage:
    python -m grexis.cli.seed --source db/seeds/ --dry-run
    python -m grexis.cli.seed --source db/seeds/
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Required fields for seed validation (Tech Spec Section 16.4)
# ---------------------------------------------------------------------------

REQUIRED_TOP_LEVEL = {"failure_signature", "goal_state", "environment", "resolution"}

REQUIRED_FAILURE_SIGNATURE = {"error_type", "details", "severity"}

REQUIRED_ENVIRONMENT = {"framework", "runtime"}

REQUIRED_RESOLUTION = {"solution_steps", "solution_summary", "confidence"}

VALID_SEVERITIES = {"blocking", "degraded", "cosmetic"}
VALID_CONFIDENCES = {"inferred", "empirical"}


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_seed_entry(entry: dict) -> list[str]:
    """Validate a single seed entry and return a list of error messages.

    Returns an empty list if the entry is valid.
    """
    errors: list[str] = []

    # Top-level keys
    for key in REQUIRED_TOP_LEVEL:
        if key not in entry:
            errors.append(f"Missing required top-level field: {key}")

    if errors:
        return errors  # Can't validate nested fields if parents are missing

    # failure_signature
    fs = entry.get("failure_signature", {})
    if not isinstance(fs, dict):
        errors.append("failure_signature must be a dict")
    else:
        for key in REQUIRED_FAILURE_SIGNATURE:
            if key not in fs:
                errors.append(f"Missing failure_signature.{key}")
        if "severity" in fs and fs["severity"] not in VALID_SEVERITIES:
            errors.append(
                f"Invalid severity '{fs['severity']}', must be one of {VALID_SEVERITIES}"
            )

    # goal_state
    if not isinstance(entry.get("goal_state"), str) or not entry["goal_state"].strip():
        errors.append("goal_state must be a non-empty string")

    # environment
    env = entry.get("environment", {})
    if not isinstance(env, dict):
        errors.append("environment must be a dict")
    else:
        for key in REQUIRED_ENVIRONMENT:
            if key not in env:
                errors.append(f"Missing environment.{key}")

    # resolution
    res = entry.get("resolution", {})
    if not isinstance(res, dict):
        errors.append("resolution must be a dict")
    else:
        for key in REQUIRED_RESOLUTION:
            if key not in res:
                errors.append(f"Missing resolution.{key}")
        if "solution_steps" in res:
            if not isinstance(res["solution_steps"], list) or len(res["solution_steps"]) == 0:
                errors.append("resolution.solution_steps must be a non-empty list")
        if "confidence" in res and res["confidence"] not in VALID_CONFIDENCES:
            errors.append(
                f"Invalid confidence '{res['confidence']}', must be one of {VALID_CONFIDENCES}"
            )

    return errors


# ---------------------------------------------------------------------------
# Ingestion
# ---------------------------------------------------------------------------

async def ingest_seeds(source_dir: str, dry_run: bool = False) -> None:
    """Read all JSON files from source_dir, validate, scan, dedup, and ingest.

    Args:
        source_dir: Path to directory containing seed JSON files.
        dry_run: If True, validate and report but do not write to DB.
    """
    source_path = Path(source_dir)
    if not source_path.is_dir():
        logger.error("Source directory does not exist: %s", source_dir)
        return

    json_files = sorted(source_path.glob("*.json"))
    if not json_files:
        logger.warning("No JSON files found in %s", source_dir)
        return

    logger.info("Found %d seed file(s) in %s", len(json_files), source_dir)

    total_entries = 0
    valid_entries = 0
    skipped_secret = 0
    skipped_duplicate = 0
    ingested = 0

    for filepath in json_files:
        logger.info("Processing %s", filepath.name)
        try:
            with open(filepath, encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError) as exc:
            logger.error("Failed to read %s: %s", filepath.name, exc)
            continue

        # Support both single-object and array-of-objects formats
        entries: list[dict] = data if isinstance(data, list) else [data]

        for i, entry in enumerate(entries):
            total_entries += 1
            entry_label = f"{filepath.name}[{i}]"

            # --- Validate ---
            errors = validate_seed_entry(entry)
            if errors:
                for err in errors:
                    logger.warning("  %s: %s", entry_label, err)
                continue
            valid_entries += 1

            # --- Secret scan ---
            from grexis.services.scanner import scan_for_secrets

            scan_result = scan_for_secrets(entry)
            if scan_result.detected:
                logger.warning(
                    "  %s: secret detected (%s) — skipping",
                    entry_label, scan_result.redacted_hint,
                )
                skipped_secret += 1
                continue

            if dry_run:
                logger.info("  %s: VALID (dry-run, not ingesting)", entry_label)
                ingested += 1
                continue

            # --- Duplicate check via Qdrant ---
            from grexis.deps import embed_service, postgres, qdrant
            from grexis.db.qdrant import PROBLEMS_COLLECTION, SOLUTIONS_COLLECTION

            fs = entry["failure_signature"]
            embed_text = f"{fs['error_type']} {fs['details']} {entry['goal_state']}"
            vector = await embed_service.embed(embed_text)

            # Check for duplicate problem (cosine > 0.92)
            from qdrant_client.models import FieldCondition, Filter, MatchAny, MatchValue

            qdrant_filter = Filter(
                must=[
                    FieldCondition(
                        key="error_type",
                        match=MatchValue(value=fs["error_type"]),
                    ),
                    FieldCondition(
                        key="status",
                        match=MatchAny(any=["open", "solved", "active"]),
                    ),
                ],
            )

            candidates = await qdrant.search(
                collection=PROBLEMS_COLLECTION,
                vector=vector,
                filter_=qdrant_filter,
                limit=3,
                score_threshold=0.92,
            )

            if candidates:
                logger.info(
                    "  %s: duplicate detected (score=%.3f) — skipping",
                    entry_label, candidates[0].score,
                )
                skipped_duplicate += 1
                continue

            # --- Ingest: create problem + solution ---
            now = datetime.now(timezone.utc)
            problem_id = str(uuid.uuid4())
            solution_id = str(uuid.uuid4())
            qdrant_problem_id = str(uuid.uuid4())
            qdrant_solution_id = str(uuid.uuid4())

            env = entry["environment"]
            res = entry["resolution"]
            provenance = entry.get("provenance", "")

            # Insert problem
            await postgres.execute(
                """
                INSERT INTO grexis.problems
                    (id, error_type, error_code, tool_name, severity, details,
                     goal_state, framework, framework_version, runtime, llm,
                     status, duplicate_count, source, provenance,
                     qdrant_point_id, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                        'open', 0, 'human_curated', $12, $13, $14)
                """,
                problem_id,
                fs.get("error_type", ""),
                fs.get("error_code", ""),
                fs.get("tool_name", ""),
                fs.get("severity", "blocking"),
                fs.get("details", ""),
                entry["goal_state"],
                env.get("framework", ""),
                env.get("framework_version", ""),
                env.get("runtime", ""),
                env.get("llm", ""),
                provenance,
                qdrant_problem_id,
                now,
            )

            # Index problem in Qdrant
            await qdrant.upsert_point(
                collection=PROBLEMS_COLLECTION,
                point_id=qdrant_problem_id,
                vector=vector,
                payload={
                    "postgres_id": problem_id,
                    "error_type": fs.get("error_type", ""),
                    "framework": env.get("framework", ""),
                    "severity": fs.get("severity", "blocking"),
                    "status": "open",
                    "duplicate_count": 0,
                },
            )

            # Insert solution
            solution_text = f"{res['solution_summary']} {' '.join(res['solution_steps'])}"
            solution_vector = await embed_service.embed(solution_text)

            await postgres.execute(
                """
                INSERT INTO grexis.solutions
                    (id, problem_id, solution_steps, solution_summary,
                     confidence_type, confidence_score, status, source,
                     framework, framework_version, runtime, llm,
                     provenance, qdrant_point_id, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, 'active', 'human_curated',
                        $7, $8, $9, $10, $11, $12, $13)
                """,
                solution_id,
                problem_id,
                json.dumps(res["solution_steps"]),
                res["solution_summary"],
                res.get("confidence", "inferred"),
                0.3,  # Base confidence for seeded solutions
                env.get("framework", ""),
                env.get("framework_version", ""),
                env.get("runtime", ""),
                env.get("llm", ""),
                provenance,
                qdrant_solution_id,
                now,
            )

            # Index solution in Qdrant
            await qdrant.upsert_point(
                collection=SOLUTIONS_COLLECTION,
                point_id=qdrant_solution_id,
                vector=solution_vector,
                payload={
                    "postgres_id": solution_id,
                    "problem_id": problem_id,
                    "framework": env.get("framework", ""),
                    "framework_version": env.get("framework_version", ""),
                    "runtime": env.get("runtime", ""),
                    "llm": env.get("llm", ""),
                    "error_type": fs.get("error_type", ""),
                    "severity": fs.get("severity", "blocking"),
                    "status": "active",
                    "source": "human_curated",
                    "confidence_score": 0.3,
                    "success_rate": 0.0,
                    "last_validated_at": None,
                },
            )

            # Create edge: solution_resolves_problem
            edge_id = str(uuid.uuid4())
            await postgres.execute(
                """
                INSERT INTO grexis.edges
                    (id, edge_type, source_node_id, source_node_type,
                     target_node_id, target_node_type, created_at)
                VALUES ($1, 'solution_resolves_problem', $2, 'solution', $3, 'problem', $4)
                """,
                edge_id,
                solution_id,
                problem_id,
                now,
            )

            ingested += 1
            logger.info("  %s: ingested (problem=%s, solution=%s)",
                        entry_label, problem_id, solution_id)

    # Summary
    logger.info(
        "Seed ingestion %s: %d total, %d valid, %d ingested, "
        "%d skipped (secrets), %d skipped (duplicates)",
        "DRY RUN" if dry_run else "COMPLETE",
        total_entries, valid_entries, ingested,
        skipped_secret, skipped_duplicate,
    )


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="GREXIS seed ingestion CLI — bootstrap the knowledge graph",
    )
    parser.add_argument(
        "--source",
        required=True,
        help="Path to directory containing seed JSON files",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="Validate and report without writing to database",
    )

    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    asyncio.run(ingest_seeds(args.source, dry_run=args.dry_run))
