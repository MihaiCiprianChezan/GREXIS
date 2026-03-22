"""
Centralised logging for GREXIS.

Call ``setup_logging(level)`` once at application startup.  Every module that
uses ``logging.getLogger(__name__)`` will inherit the configured handlers
automatically — no changes required in existing code.

Console output is colour-coded and concise.  A rotating file log in ``log/``
captures everything at DEBUG level regardless of the console level.
"""

import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

# ---------------------------------------------------------------------------
# Colour formatter (console only)
# ---------------------------------------------------------------------------

class ColorFormatter(logging.Formatter):
    COLORS = {
        logging.DEBUG: "\033[90m",                          # Grey
        logging.INFO: "\033[32m",                           # Green
        logging.WARNING: "\033[33m",                        # Yellow
        logging.ERROR: "\033[31m",                          # Red
        logging.CRITICAL: "\033[48;5;160m\033[38;5;226m",   # Red bg / yellow text
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        colour = self.COLORS.get(record.levelno, self.RESET)
        message = super().format(record)
        return f"{colour}{message}{self.RESET}"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

LOG_DIR = Path(__file__).resolve().parents[3] / "log"   # <repo>/api/log/
LOG_FORMAT = "%(asctime)s %(levelname)-8s [%(name)s] %(message)s"
LOG_DATE = "%Y-%m-%d %H:%M:%S"


def setup_logging(level: str = "INFO") -> None:
    """Configure root logger with console + file handlers.

    * **Console** respects *level* — in non-DEBUG modes only the level name
      and message are shown (no traceback for connection errors etc.).
    * **File** always logs at DEBUG with full detail, rotating at 5 MB
      (3 backups).
    """
    numeric_level = getattr(logging, level.upper(), logging.INFO)

    root = logging.getLogger()
    root.setLevel(logging.DEBUG)            # let handlers decide

    # Remove any pre-existing handlers (e.g. basicConfig defaults)
    for h in root.handlers[:]:
        root.removeHandler(h)
        h.close()

    # --- Console handler ---------------------------------------------------
    console = logging.StreamHandler(sys.stderr)
    console.setLevel(numeric_level)
    console.setFormatter(ColorFormatter(LOG_FORMAT, datefmt=LOG_DATE))
    root.addHandler(console)

    # --- File handler ------------------------------------------------------
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    file_handler = RotatingFileHandler(
        LOG_DIR / "grexis.log",
        maxBytes=5 * 1024 * 1024,       # 5 MB
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter(LOG_FORMAT, datefmt=LOG_DATE))
    root.addHandler(file_handler)

    # Quieten noisy third-party loggers
    for name in ("asyncio", "httpcore", "httpx", "uvicorn.access"):
        logging.getLogger(name).setLevel(logging.WARNING)
