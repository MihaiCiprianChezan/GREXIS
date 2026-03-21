"""Human-friendly test reporter for GREXIS CLI test agent.

Produces clean, traceable console output that humans can follow in real-time.
Each step is numbered, timed, and clearly marked PASS/FAIL with context.
"""
import time
import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# ANSI color codes
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
DIM = "\033[2m"
BOLD = "\033[1m"
RESET = "\033[0m"


@dataclass
class StepResult:
    name: str
    passed: bool
    detail: str = ""
    duration_ms: float = 0.0


@dataclass
class ScenarioResult:
    name: str
    description: str
    steps: list[StepResult] = field(default_factory=list)
    start_time: float = 0.0
    end_time: float = 0.0

    @property
    def passed(self) -> int:
        return sum(1 for s in self.steps if s.passed)

    @property
    def failed(self) -> int:
        return sum(1 for s in self.steps if not s.passed)

    @property
    def total(self) -> int:
        return len(self.steps)

    @property
    def all_passed(self) -> bool:
        return self.failed == 0

    @property
    def duration_s(self) -> float:
        return self.end_time - self.start_time


class Reporter:
    """Tracks and displays test results with human-readable formatting."""

    def __init__(self):
        self._scenarios: list[ScenarioResult] = []
        self._current: ScenarioResult | None = None
        self._step_num = 0

    def begin_scenario(self, name: str, description: str):
        self._current = ScenarioResult(
            name=name,
            description=description,
            start_time=time.time(),
        )
        self._step_num = 0
        print()
        print(f"  {BOLD}{CYAN}{'=' * 64}{RESET}")
        print(f"  {BOLD}{CYAN}  {name.upper()}{RESET}")
        print(f"  {DIM}  {description}{RESET}")
        print(f"  {BOLD}{CYAN}{'=' * 64}{RESET}")

    def end_scenario(self) -> ScenarioResult:
        self._current.end_time = time.time()
        result = self._current
        self._scenarios.append(result)

        status = f"{GREEN}ALL PASSED{RESET}" if result.all_passed else f"{RED}{result.failed} FAILED{RESET}"
        print()
        print(f"  {DIM}  Result: {status}  ({result.passed}/{result.total} steps, {result.duration_s:.1f}s){RESET}")
        if not result.all_passed:
            for s in result.steps:
                if not s.passed:
                    print(f"  {RED}    x {s.name}: {s.detail}{RESET}")
        print()
        self._current = None
        return result

    def step(self, name: str) -> "_StepContext":
        """Context manager for a test step. Usage:

            with reporter.step("register agent") as check:
                result = await client.register_agent(...)
                check(result.get("registered") is True, f"got {result}")
        """
        self._step_num += 1
        return _StepContext(self, self._step_num, name)

    def _record_step(self, result: StepResult):
        self._current.steps.append(result)
        num = self._step_num
        ms = f"{result.duration_ms:.0f}ms"
        if result.passed:
            print(f"    {GREEN}[PASS]{RESET}  {num:>2}. {result.name}  {DIM}{ms}{RESET}")
        else:
            print(f"    {RED}[FAIL]{RESET}  {num:>2}. {result.name}  {DIM}{ms}{RESET}")
            if result.detail:
                print(f"           {DIM}{result.detail}{RESET}")

    def print_summary(self):
        """Print final summary of all scenarios."""
        print()
        print(f"  {BOLD}{'=' * 64}{RESET}")
        print(f"  {BOLD}  GREXIS END-TO-END TEST SUMMARY{RESET}")
        print(f"  {BOLD}{'=' * 64}{RESET}")
        print()

        total_passed = 0
        total_failed = 0
        total_steps = 0

        for sc in self._scenarios:
            total_passed += sc.passed
            total_failed += sc.failed
            total_steps += sc.total

            if sc.all_passed:
                icon = f"{GREEN}PASS{RESET}"
            else:
                icon = f"{RED}FAIL{RESET}"

            print(f"    [{icon}]  {sc.name:<30}  {sc.passed}/{sc.total} steps  {DIM}{sc.duration_s:.1f}s{RESET}")

        print()
        print(f"  {'-' * 64}")

        if total_failed == 0:
            print(f"  {GREEN}{BOLD}  ALL {total_steps} STEPS PASSED across {len(self._scenarios)} scenarios{RESET}")
        else:
            print(f"  {RED}{BOLD}  {total_failed} FAILED{RESET}, {GREEN}{total_passed} passed{RESET} across {len(self._scenarios)} scenarios")
            print()
            print(f"  {RED}  Failed steps:{RESET}")
            for sc in self._scenarios:
                for s in sc.steps:
                    if not s.passed:
                        print(f"    {RED}x{RESET}  [{sc.name}] {s.name}: {s.detail}")

        print()
        print(f"  {'=' * 64}")
        print()

        return total_failed == 0


class _StepContext:
    """Context manager returned by Reporter.step()."""

    def __init__(self, reporter: Reporter, num: int, name: str):
        self._reporter = reporter
        self._num = num
        self._name = name
        self._start = 0.0
        self._result: StepResult | None = None

    def __enter__(self):
        self._start = time.time()
        return self._check

    def __exit__(self, exc_type, exc_val, exc_tb):
        elapsed_ms = (time.time() - self._start) * 1000
        if exc_type is not None:
            # Exception during step — record as failure
            self._reporter._record_step(StepResult(
                name=self._name,
                passed=False,
                detail=f"Exception: {exc_type.__name__}: {exc_val}",
                duration_ms=elapsed_ms,
            ))
            return True  # suppress exception

        if self._result is None:
            # Step completed without calling check — treat as pass
            self._reporter._record_step(StepResult(
                name=self._name,
                passed=True,
                duration_ms=elapsed_ms,
            ))
        else:
            self._result.duration_ms = elapsed_ms
            self._reporter._record_step(self._result)

    def _check(self, condition: bool, detail: str = ""):
        self._result = StepResult(
            name=self._name,
            passed=condition,
            detail=detail if not condition else "",
        )


# Async-compatible step context
class AsyncStepContext:
    """Async context manager for test steps."""

    def __init__(self, reporter: Reporter, num: int, name: str):
        self._reporter = reporter
        self._num = num
        self._name = name
        self._start = 0.0
        self._result: StepResult | None = None

    async def __aenter__(self):
        self._start = time.time()
        return self._check

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        elapsed_ms = (time.time() - self._start) * 1000
        if exc_type is not None:
            self._reporter._record_step(StepResult(
                name=self._name,
                passed=False,
                detail=f"Exception: {exc_type.__name__}: {exc_val}",
                duration_ms=elapsed_ms,
            ))
            return True

        if self._result is None:
            self._reporter._record_step(StepResult(
                name=self._name,
                passed=True,
                duration_ms=elapsed_ms,
            ))
        else:
            self._result.duration_ms = elapsed_ms
            self._reporter._record_step(self._result)

    def _check(self, condition: bool, detail: str = ""):
        self._result = StepResult(
            name=self._name,
            passed=condition,
            detail=detail if not condition else "",
        )
