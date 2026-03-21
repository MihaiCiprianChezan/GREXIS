"""GREXIS Test Agent -- CLI tool for testing the GREXIS MCP platform.

Usage:
    python cli/grexis_test_agent.py smoke --url http://localhost:8000 --token test-token-123
    python cli/grexis_test_agent.py lifecycle --url http://localhost:8000 --token test-token-123
    python cli/grexis_test_agent.py adversarial --url http://localhost:8000 --token test-token-123 --admin-secret mysecret
    python cli/grexis_test_agent.py all --url http://localhost:8000 --token test-token-123 --admin-secret mysecret
"""
import argparse
import asyncio
import logging
import sys
import uuid

from client import GrexisClient

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


async def main():
    parser = argparse.ArgumentParser(description="GREXIS Test Agent")
    parser.add_argument(
        "scenario",
        choices=["smoke", "lifecycle", "adversarial", "all"],
        help="Test scenario to run",
    )
    parser.add_argument(
        "--url", default="http://localhost:8000", help="GREXIS API URL"
    )
    parser.add_argument(
        "--token", default=None, help="Agent token (auto-generated if omitted)"
    )
    parser.add_argument(
        "--admin-secret", default=None, help="Admin secret for verification queries"
    )
    parser.add_argument(
        "-v", "--verbose", action="store_true", help="Enable debug logging"
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    token = args.token or f"test-agent-{uuid.uuid4().hex[:12]}"

    client = GrexisClient(args.url, args.admin_secret)

    try:
        # Check health first
        health = await client.health()
        logger.info("Connected to GREXIS %s", health.get("version", "?"))

        if args.admin_secret:
            await client.admin_login()
            logger.info("Admin login successful")

        all_passed = True

        if args.scenario in ("smoke", "all"):
            from scenarios.smoke import run as run_smoke

            if not await run_smoke(client, token):
                all_passed = False

        if args.scenario in ("lifecycle", "all"):
            from scenarios.lifecycle import run as run_lifecycle

            lc_token = f"lifecycle-{uuid.uuid4().hex[:8]}"
            if not await run_lifecycle(client, lc_token):
                all_passed = False

        if args.scenario in ("adversarial", "all"):
            from scenarios.adversarial import run as run_adversarial

            adv_token = f"adversarial-{uuid.uuid4().hex[:8]}"
            if not await run_adversarial(client, adv_token):
                all_passed = False

        sys.exit(0 if all_passed else 1)

    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
