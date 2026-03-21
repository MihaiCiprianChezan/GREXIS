"""Seed data loader -- loads seed JSON files into GREXIS via MCP tools.

Usage:
    python data/seed_loader.py --url http://localhost:8000 --token seed-admin-token
"""
import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

# Add cli/ to path for client import
sys.path.insert(0, str(Path(__file__).parent.parent / "cli"))
from client import GrexisClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


async def load_seed_file(client: GrexisClient, token: str, filepath: Path) -> tuple[int, int]:
    """Load a single seed file. Returns (problems_loaded, solutions_loaded)."""
    data = json.loads(filepath.read_text(encoding="utf-8"))
    problems = 0
    solutions = 0

    for entry in data:
        prob_data = entry["problem"]

        # Submit problem
        try:
            result = await client.submit_problem(
                token=token,
                failure_signature=prob_data["failure_signature"],
                environment=prob_data["environment"],
                goal_state=prob_data["goal_state"],
            )
            problem_id = result.get("problem_id")
            if problem_id:
                problems += 1
            else:
                logger.warning("Failed to create problem: %s", result)
                continue
        except Exception as e:
            logger.error("Error submitting problem: %s", e)
            continue

        # Submit solutions
        for sol_data in entry.get("solutions", []):
            try:
                sol_result = await client.submit_solution(
                    token=token,
                    problem={
                        "failure_signature": prob_data["failure_signature"],
                        "goal_state": prob_data["goal_state"],
                        "environment": prob_data["environment"],
                        "problem_id": problem_id,
                    },
                    resolution={
                        "solution_summary": sol_data["solution_summary"],
                        "solution_steps": sol_data["solution_steps"],
                        "confidence": sol_data.get("confidence", "empirical"),
                    },
                )
                if sol_result.get("solution_id"):
                    solutions += 1

                    # Submit auto-feedback to set initial confidence
                    if sol_data.get("confidence_score", 0) > 0.5:
                        await client.submit_feedback(
                            token=token,
                            solution_id=sol_result["solution_id"],
                            outcome="success",
                            environment=prob_data["environment"],
                            comment="Seed data -- pre-validated solution",
                        )
            except Exception as e:
                logger.error("Error submitting solution: %s", e)

    return problems, solutions


async def main():
    parser = argparse.ArgumentParser(description="GREXIS Seed Data Loader")
    parser.add_argument("--url", default="http://localhost:8000")
    parser.add_argument("--token", default="seed-admin-token")
    parser.add_argument("--dir", default=str(Path(__file__).parent / "seed"), help="Seed data directory")
    args = parser.parse_args()

    client = GrexisClient(args.url)

    try:
        health = await client.health()
        logger.info("Connected to GREXIS %s", health.get("version"))

        # Register the seed token
        await client.register_agent(args.token, "Seed data loader", framework="grexis-seed")

        seed_dir = Path(args.dir)
        files = sorted(seed_dir.glob("*.json"))

        total_problems = 0
        total_solutions = 0

        for f in files:
            logger.info("Loading %s...", f.name)
            p, s = await load_seed_file(client, args.token, f)
            total_problems += p
            total_solutions += s
            logger.info("  %d problems, %d solutions", p, s)

        logger.info("=== SEED COMPLETE: %d problems, %d solutions from %d files ===",
                     total_problems, total_solutions, len(files))
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
