"""Search pipeline — Task 17.

Implements the three-stage search pipeline from Tech Spec Section 10:
  1. Hard filter (Qdrant must conditions)
  2. Failure cluster expansion
  3. Semantic rank + scoring
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


# ---------------------------------------------------------------------------
# Result dataclasses
# ---------------------------------------------------------------------------

@dataclass
class RankedSolution:
    id: str
    payload: dict
    score: float          # raw vector similarity from Qdrant
    rank_score: float     # weighted composite score
    env_match_score: float


# ---------------------------------------------------------------------------
# Default ranking weights
# ---------------------------------------------------------------------------

_DEFAULT_WEIGHTS = {
    "vector_similarity": 0.40,
    "structural_match":  0.25,
    "env_proximity":     0.20,
    "recency_boost":     0.15,
}

_DEFAULT_CONFIDENCE_FLOOR = 0.10


# ---------------------------------------------------------------------------
# Step 1: Hard filter
# ---------------------------------------------------------------------------

def build_hard_filter(framework: str, cross_framework: bool) -> dict:
    """Build the Qdrant ``must`` filter for the search query.

    Always requires ``status == active``.  Adds a framework constraint
    unless ``cross_framework`` is True.
    """
    must: list[dict] = [{"key": "status", "match": {"value": "active"}}]

    if not cross_framework:
        must.append({"key": "framework", "match": {"value": framework}})

    return {"must": must}


# ---------------------------------------------------------------------------
# Step 2: Cluster expansion
# ---------------------------------------------------------------------------

async def expand_candidates_via_cluster(
    failure_sig,               # FailureSignature-like object
    base_results: list[Any],
    qdrant,
) -> list[Any]:
    """Fetch extra candidates from the failure cluster if one exists."""
    cluster = await qdrant.find_cluster(failure_sig)
    if not cluster:
        return base_results

    cluster_results = await qdrant.search(
        collection="solutions",
        vector=None,
        query_filter={"must": [{"key": "cluster_id", "match": {"value": cluster.id}}]},
        limit=10,
    )

    # Deduplicate by point ID
    seen: set[str] = {r.id for r in base_results}
    combined = list(base_results)
    for r in cluster_results:
        if r.id not in seen:
            combined.append(r)
            seen.add(r.id)
    return combined


# ---------------------------------------------------------------------------
# Step 3: Scoring helpers
# ---------------------------------------------------------------------------

def _is_same_minor_version(v1: str, v2: str) -> bool:
    """Return True when major.minor parts of two version strings match."""
    try:
        p1 = v1.split(".")
        p2 = v2.split(".")
        return p1[0] == p2[0] and p1[1] == p2[1]
    except (IndexError, AttributeError):
        return False


def compute_env_match_score(
    payload: dict,
    llm: str,
    framework: str,
    framework_version: str,
    runtime: str,
    cross_framework: bool = False,
) -> float:
    """Compute the environment proximity score (0.0, 0.5, 0.8, or 1.0).

    Exact match → 1.0
    Same minor version → 0.8
    Same framework (cross-framework search) → 0.5
    Otherwise → 0.0
    """
    if (payload.get("llm") == llm
            and payload.get("framework") == framework
            and payload.get("framework_version") == framework_version
            and payload.get("runtime") == runtime):
        return 1.0

    if (payload.get("llm") == llm
            and payload.get("framework") == framework
            and _is_same_minor_version(payload.get("framework_version", ""), framework_version)):
        return 0.8

    # 0.5 only when cross_framework was explicitly set — otherwise already excluded by hard filter
    if payload.get("framework") == framework and cross_framework:
        return 0.5

    return 0.0


def compute_structural_match(payload: dict, failure_sig) -> float:
    """Compute structural similarity between a stored solution and the incoming failure signature.

    Checks error_type, error_code, and severity for partial or full match.
    Returns a value in [0.0, 1.0].
    """
    score = 0.0
    checks = 0

    if hasattr(failure_sig, "error_type"):
        checks += 1
        if payload.get("error_type") == failure_sig.error_type:
            score += 1.0

    if hasattr(failure_sig, "error_code") and failure_sig.error_code:
        checks += 1
        if payload.get("error_code") == failure_sig.error_code:
            score += 1.0

    if hasattr(failure_sig, "severity"):
        checks += 1
        if payload.get("severity") == failure_sig.severity:
            score += 1.0

    return score / checks if checks else 0.0


def compute_recency_boost(last_validated_at: str | datetime | None) -> float:
    """Compute a recency boost in [0.0, 1.0] based on days since last validation.

    Decays linearly from 1.0 (validated today) to 0.0 (validated 180+ days ago).
    """
    if not last_validated_at:
        return 0.0

    if isinstance(last_validated_at, str):
        try:
            last_validated_at = datetime.fromisoformat(last_validated_at)
        except ValueError:
            return 0.0

    now = datetime.now(tz=timezone.utc)
    if last_validated_at.tzinfo is None:
        last_validated_at = last_validated_at.replace(tzinfo=timezone.utc)

    days_ago = (now - last_validated_at).total_seconds() / 86_400.0
    return max(0.0, 1.0 - days_ago / 180.0)


# ---------------------------------------------------------------------------
# Step 3: Ranker
# ---------------------------------------------------------------------------

def rank_results(
    results: list[Any],
    query,          # QuerySolutionsPayload-like: .failure_signature, .environment, cross_framework
    config=None,
) -> list[RankedSolution]:
    """Combine vector similarity with structural, env, and recency scores.

    Returns solutions above the confidence floor, sorted by rank_score descending.
    """
    weights = getattr(getattr(config, "weights", None), "__dict__", None) or _DEFAULT_WEIGHTS
    w1 = getattr(getattr(config, "weights", None), "vector_similarity", _DEFAULT_WEIGHTS["vector_similarity"])
    w2 = getattr(getattr(config, "weights", None), "structural_match",  _DEFAULT_WEIGHTS["structural_match"])
    w3 = getattr(getattr(config, "weights", None), "env_proximity",     _DEFAULT_WEIGHTS["env_proximity"])
    w4 = getattr(getattr(config, "weights", None), "recency_boost",     _DEFAULT_WEIGHTS["recency_boost"])
    confidence_floor = getattr(config, "CONFIDENCE_FLOOR", _DEFAULT_CONFIDENCE_FLOOR)

    env = query.environment
    cross_framework = getattr(query, "cross_framework", False)

    ranked: list[RankedSolution] = []
    for r in results:
        payload = r.payload

        vector_sim = r.score
        structural_match = compute_structural_match(payload, query.failure_signature)
        env_proximity = compute_env_match_score(
            payload,
            llm=env.llm,
            framework=env.framework,
            framework_version=env.framework_version,
            runtime=env.runtime,
            cross_framework=cross_framework,
        )
        recency_boost = compute_recency_boost(payload.get("last_validated_at"))

        blocking_mult = (
            1.2
            if (getattr(query.failure_signature, "severity", None) == "blocking"
                and payload.get("severity") == "blocking")
            else 1.0
        )

        rank_score = (
            w1 * vector_sim
            + w2 * structural_match
            + w3 * env_proximity
            + w4 * recency_boost
        ) * blocking_mult

        ranked.append(RankedSolution(
            id=str(r.id),
            payload=payload,
            score=vector_sim,
            rank_score=rank_score,
            env_match_score=env_proximity,
        ))

    ranked.sort(key=lambda x: x.rank_score, reverse=True)
    return [r for r in ranked if r.payload.get("confidence_score", 0.0) >= confidence_floor]


# ---------------------------------------------------------------------------
# Top-level search entrypoint
# ---------------------------------------------------------------------------

async def search_solutions(
    qdrant,
    embed_service,
    db,
    redis,
    query,      # QuerySolutionsPayload
    config,
) -> list[RankedSolution]:
    """Full search pipeline: embed → hard filter → Qdrant search → cluster expansion → rank."""
    env = query.environment
    cross_framework = getattr(query, "cross_framework", False)

    # Embed the query text
    query_text = (
        f"{query.failure_signature.error_type} "
        f"{getattr(query.failure_signature, 'details', '')} "
        f"{getattr(query, 'goal_state', '')}"
    )
    query_vector = await embed_service.embed(query_text)

    hard_filter = build_hard_filter(framework=env.framework, cross_framework=cross_framework)

    base_results = await qdrant.search(
        collection="solutions",
        vector=query_vector,
        query_filter=hard_filter,
        limit=20,
    )

    # Optionally expand via failure cluster
    expanded = await expand_candidates_via_cluster(query.failure_signature, base_results, qdrant)

    return rank_results(expanded, query, config)
