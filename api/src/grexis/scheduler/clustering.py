"""Failure clustering — Task 30.

TF-IDF on problem details + KMeans clustering + NLTK keyword extraction.
Results are written to the grexis.failure_clusters table.

Runs daily at 02:00 UTC via APScheduler.
Tech Spec Section 10 (cluster expansion) and Section 13 (federation context).
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from grexis.deps import postgres

logger = logging.getLogger(__name__)

# Minimum number of open/solved problems required to run clustering.
MIN_PROBLEMS_FOR_CLUSTERING = 10

# Number of clusters is adaptive: sqrt(n_problems), clamped to [2, 50].
MIN_CLUSTERS = 2
MAX_CLUSTERS = 50


def _choose_n_clusters(n_problems: int) -> int:
    import math

    k = int(math.sqrt(n_problems))
    return max(MIN_CLUSTERS, min(k, MAX_CLUSTERS))


async def run_clustering_job() -> None:
    """Entry point invoked daily at 02:00 UTC by APScheduler.

    1. Fetches all open/solved problems with non-empty details.
    2. Vectorises via TF-IDF.
    3. Clusters via KMeans.
    4. Extracts top keywords per cluster using NLTK.
    5. Writes results to grexis.failure_clusters.
    """
    logger.info("Failure clustering: starting")

    # ------------------------------------------------------------------
    # 1. Fetch problems
    # ------------------------------------------------------------------
    rows = await postgres.fetch(
        """
        SELECT id, details, error_type, severity
        FROM grexis.problems
        WHERE status IN ('open', 'solved')
          AND details IS NOT NULL
          AND LENGTH(details) > 10
        """,
    )

    if len(rows) < MIN_PROBLEMS_FOR_CLUSTERING:
        logger.info(
            "Failure clustering: only %d problems (need %d), skipping",
            len(rows), MIN_PROBLEMS_FOR_CLUSTERING,
        )
        return

    problem_ids = [str(r["id"]) for r in rows]
    documents = [r["details"] for r in rows]

    # ------------------------------------------------------------------
    # 2. TF-IDF vectorisation
    # ------------------------------------------------------------------
    from sklearn.feature_extraction.text import TfidfVectorizer

    vectorizer = TfidfVectorizer(
        max_features=5000,
        stop_words="english",
        min_df=2,
        max_df=0.85,
    )
    tfidf_matrix = vectorizer.fit_transform(documents)

    # ------------------------------------------------------------------
    # 3. KMeans clustering
    # ------------------------------------------------------------------
    from sklearn.cluster import KMeans

    n_clusters = _choose_n_clusters(len(rows))
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10, max_iter=300)
    labels = kmeans.fit_predict(tfidf_matrix)

    # ------------------------------------------------------------------
    # 4. Keyword extraction per cluster
    # ------------------------------------------------------------------
    feature_names = vectorizer.get_feature_names_out()

    # Try NLTK stopwords for better keyword filtering; fall back to basic set
    try:
        from nltk.corpus import stopwords as nltk_stopwords

        stop_set = set(nltk_stopwords.words("english"))
    except Exception:
        stop_set = set()

    cluster_keywords: dict[int, list[str]] = {}
    for cluster_id in range(n_clusters):
        # Indices of problems in this cluster
        member_indices = [i for i, lbl in enumerate(labels) if lbl == cluster_id]
        if not member_indices:
            cluster_keywords[cluster_id] = []
            continue

        # Average TF-IDF scores for this cluster's members
        cluster_tfidf = tfidf_matrix[member_indices].mean(axis=0).A1  # type: ignore[union-attr]
        top_indices = cluster_tfidf.argsort()[-10:][::-1]
        keywords = [
            feature_names[i]
            for i in top_indices
            if feature_names[i] not in stop_set
        ][:5]
        cluster_keywords[cluster_id] = keywords

    # ------------------------------------------------------------------
    # 5. Persist to grexis.failure_clusters
    # ------------------------------------------------------------------
    now = datetime.utcnow()

    # Clear previous clusters (full rebuild each run)
    await postgres.execute("DELETE FROM grexis.failure_clusters")

    for cluster_id in range(n_clusters):
        member_indices = [i for i, lbl in enumerate(labels) if lbl == cluster_id]
        if not member_indices:
            continue

        keywords = cluster_keywords.get(cluster_id, [])
        cluster_label = ", ".join(keywords) if keywords else f"cluster-{cluster_id}"
        member_count = len(member_indices)

        # Most common error_type among cluster members
        member_error_types = [rows[i]["error_type"] for i in member_indices if rows[i]["error_type"]]
        if member_error_types:
            error_type = max(set(member_error_types), key=member_error_types.count)
        else:
            error_type = None

        cluster_uuid = str(uuid.uuid4())
        await postgres.execute(
            """
            INSERT INTO grexis.failure_clusters (id, cluster_label, error_type, member_count, keywords, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            cluster_uuid,
            cluster_label,
            error_type,
            member_count,
            keywords,
            now,
        )

    logger.info(
        "Failure clustering: created %d clusters from %d problems",
        n_clusters, len(rows),
    )
