"""APScheduler setup — Task 26.

Registers all scheduled jobs and exposes the scheduler instance for lifespan
management in main.py.
"""

from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


def register_jobs() -> None:
    """Register all periodic jobs.

    Imports are deferred so that heavy modules (sklearn, nltk, etc.)
    are only loaded when the scheduler actually needs them.
    """
    from grexis.scheduler.answer_agent import attempt_open_problems
    from grexis.scheduler.decay import recompute_decay
    from grexis.scheduler.diversity import recompute_diversity_factors
    from grexis.scheduler.clustering import run_clustering_job
    from grexis.scheduler.aggregation import aggregate_old_feedback

    scheduler.add_job(
        attempt_open_problems, "interval", minutes=30, id="answer_agent",
    )
    scheduler.add_job(
        recompute_decay, "interval", hours=6, id="decay",
    )
    scheduler.add_job(
        recompute_diversity_factors, "interval", minutes=15, id="diversity",
    )
    scheduler.add_job(
        run_clustering_job, "cron", hour=2, minute=0, id="clustering",
    )
    scheduler.add_job(
        aggregate_old_feedback, "cron", hour=3, minute=0, id="aggregation",
    )

    # Sandbox purge — only active when SANDBOX_MODE=true
    from grexis.lib.config import get_settings

    if get_settings().SANDBOX_MODE:
        from grexis.scheduler.sandbox import purge_sandbox_data

        scheduler.add_job(
            purge_sandbox_data, "cron", hour=4, minute=0, id="sandbox_purge",
        )

    logger.info("Registered %d scheduled jobs", len(scheduler.get_jobs()))
