"""Sandbox purge job.

Truncates all grexis.* tables when SANDBOX_MODE=true. This keeps sandbox
instances clean and prevents unbounded data growth during development/testing.

Runs daily at 04:00 UTC via APScheduler (only registered when SANDBOX_MODE=true).
"""

from __future__ import annotations

import logging

from grexis.deps import postgres
from grexis.lib.config import get_settings

logger = logging.getLogger(__name__)

# Tables to truncate, in dependency-safe order (children before parents).
GREXIS_TABLES = [
    "grexis.feedback_events",
    "grexis.edges",
    "grexis.agent_jobs",
    "grexis.failure_clusters",
    "grexis.solutions",
    "grexis.problems",
    "grexis.agent_tokens",
    "grexis.audit_log",
]


async def purge_sandbox_data() -> None:
    """Entry point invoked daily at 04:00 UTC by APScheduler.

    Only executes when SANDBOX_MODE is enabled. Truncates all grexis.*
    tables with CASCADE to handle foreign key constraints.
    """
    settings = get_settings()
    if not settings.SANDBOX_MODE:
        logger.warning("Sandbox purge called but SANDBOX_MODE is disabled — skipping")
        return

    logger.info("Sandbox purge: truncating all grexis tables")

    for table in GREXIS_TABLES:
        try:
            await postgres.execute(f"TRUNCATE {table} CASCADE")
            logger.info("Sandbox purge: truncated %s", table)
        except Exception:
            logger.exception("Sandbox purge: failed to truncate %s", table)

    logger.info("Sandbox purge: complete")
