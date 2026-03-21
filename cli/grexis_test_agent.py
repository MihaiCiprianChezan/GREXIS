"""GREXIS Test Agent -- CLI tool for end-to-end testing of the GREXIS MCP platform.

Exercises all 5 MCP tools across 9 scenarios with human-readable output.
Each scenario is self-contained and uses unique data to avoid cross-contamination.

Usage:
    python cli/grexis_test_agent.py smoke       --url http://localhost:8000 --token my-token
    python cli/grexis_test_agent.py lifecycle    --url http://localhost:8000 --token my-token
    python cli/grexis_test_agent.py adversarial  --url http://localhost:8000 --token my-token --admin-secret secret
    python cli/grexis_test_agent.py recovery     --url http://localhost:8000 --token my-token
    python cli/grexis_test_agent.py crossenv     --url http://localhost:8000 --token my-token
    python cli/grexis_test_agent.py trust        --url http://localhost:8000 --token my-token
    python cli/grexis_test_agent.py errors       --url http://localhost:8000 --token my-token
    python cli/grexis_test_agent.py duplicates   --url http://localhost:8000 --token my-token
    python cli/grexis_test_agent.py ban          --url http://localhost:8000 --token my-token --admin-secret secret
    python cli/grexis_test_agent.py all          --url http://localhost:8000 --token my-token --admin-secret secret
"""
import argparse
import asyncio
import logging
import sys
import uuid

from client import GrexisClient
from reporter import Reporter, BOLD, CYAN, DIM, RESET

logging.basicConfig(
    level=logging.WARNING,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

SCENARIOS = [
    "smoke",
    "lifecycle",
    "adversarial",
    "recovery",
    "crossenv",
    "trust",
    "errors",
    "duplicates",
    "ban",
]

# Scenarios that require admin access
ADMIN_SCENARIOS = {"adversarial", "ban"}


async def main():
    parser = argparse.ArgumentParser(
        description="GREXIS End-to-End Test Agent",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Scenarios:
  smoke        Happy path through all 5 MCP tools
  lifecycle    Full problem -> solution -> feedback -> supersede cycle
  adversarial  Secret injection, rate limits, malformed payloads
  recovery     Cold start: no results -> contribute -> retrieve
  crossenv     Environment filtering and cross-framework search
  trust        Confidence score evolution across feedback events
  errors       Malformed inputs, missing fields, bad UUIDs
  duplicates   Semantic duplicate detection and merging
  ban          Banned token enforcement (requires --admin-secret)
  all          Run all scenarios in sequence
""",
    )
    parser.add_argument(
        "scenario",
        choices=SCENARIOS + ["all"],
        help="Test scenario to run",
    )
    parser.add_argument("--url", default="http://localhost:8000", help="GREXIS API URL")
    parser.add_argument("--token", default=None, help="Agent token (auto-generated if omitted)")
    parser.add_argument("--admin-secret", default=None, help="Admin secret for ban/adversarial tests")
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable debug logging")

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    token = args.token or f"test-agent-{uuid.uuid4().hex[:12]}"
    client = GrexisClient(args.url, args.admin_secret)
    reporter = Reporter()

    try:
        # Header
        print()
        print(f"  {BOLD}{CYAN}GREXIS End-to-End Test Agent{RESET}")
        print(f"  {DIM}Target: {args.url}{RESET}")
        print(f"  {DIM}Token:  {token[:16]}...{RESET}")

        # Health check
        health = await client.health()
        print(f"  {DIM}Status: connected (v{health.get('version', '?')}){RESET}")

        if args.admin_secret:
            await client.admin_login()
            print(f"  {DIM}Admin:  authenticated{RESET}")

        # Determine which scenarios to run
        if args.scenario == "all":
            to_run = list(SCENARIOS)
        else:
            to_run = [args.scenario]

        # Run scenarios
        for scenario_name in to_run:
            # Skip admin-only scenarios if no admin secret
            if scenario_name in ADMIN_SCENARIOS and not args.admin_secret:
                print(f"\n  {DIM}Skipping {scenario_name} (requires --admin-secret){RESET}")
                continue

            # Each scenario gets a unique token to avoid cross-contamination
            sc_token = f"{scenario_name}-{uuid.uuid4().hex[:8]}"

            if scenario_name == "smoke":
                from scenarios.smoke import run
                await run(client, sc_token, reporter)
            elif scenario_name == "lifecycle":
                from scenarios.lifecycle import run
                await run(client, sc_token, reporter)
            elif scenario_name == "adversarial":
                from scenarios.adversarial import run
                await run(client, sc_token, reporter)
            elif scenario_name == "recovery":
                from scenarios.recovery import run
                await run(client, sc_token, reporter)
            elif scenario_name == "crossenv":
                from scenarios.cross_environment import run
                await run(client, sc_token, reporter)
            elif scenario_name == "trust":
                from scenarios.trust_evolution import run
                await run(client, sc_token, reporter)
            elif scenario_name == "errors":
                from scenarios.error_resilience import run
                await run(client, sc_token, reporter)
            elif scenario_name == "duplicates":
                from scenarios.duplicate_detection import run
                await run(client, sc_token, reporter)
            elif scenario_name == "ban":
                from scenarios.ban_enforcement import run
                await run(client, sc_token, reporter)

        # Final summary
        all_passed = reporter.print_summary()
        sys.exit(0 if all_passed else 1)

    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
