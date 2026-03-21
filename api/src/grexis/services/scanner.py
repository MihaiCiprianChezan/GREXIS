"""Secret scanner middleware — Task 13.

Scans payloads for sensitive data patterns before they touch Postgres or Qdrant.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# Patterns
# ---------------------------------------------------------------------------

SECRET_PATTERNS: list[re.Pattern] = [
    re.compile(r"AKIA[0-9A-Z]{16}"),                                                    # AWS Access Key ID
    re.compile(r"sk-[a-zA-Z0-9]{32,}"),                                                 # OpenAI-style secret key
    re.compile(r"ghp_[a-zA-Z0-9]{36}"),                                                 # GitHub Personal Access Token
    re.compile(r"gho_[a-zA-Z0-9]{36}"),                                                 # GitHub OAuth Token
    re.compile(r"Bearer\s[a-zA-Z0-9\-._~+/]+=*", re.I),                                # Bearer token
    re.compile(r"eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+"),             # JWT
    re.compile(r"-----BEGIN PRIVATE KEY-----"),                                          # PKCS#8 private key
    re.compile(r"-----BEGIN RSA PRIVATE KEY-----"),                                      # RSA private key
    re.compile(r"-----BEGIN EC PRIVATE KEY-----"),                                       # EC private key
    re.compile(r"-----BEGIN OPENSSH PRIVATE KEY-----"),                                  # OpenSSH private key
    re.compile(r"-----BEGIN DSA PRIVATE KEY-----"),                                      # DSA private key
    re.compile(r"[a-zA-Z0-9+/]{40,}={0,2}"),                                           # High-entropy base64 (heuristic)
]


# ---------------------------------------------------------------------------
# Result / response dataclasses
# ---------------------------------------------------------------------------

@dataclass
class ScanResult:
    detected: bool
    error_code: str | None = None
    redacted_hint: str | None = None


@dataclass
class ScanResponse:
    action: str                      # "allow" | "warn" | "reject"
    status_code: int = 200
    warning: str | None = None
    error: str | None = None


# ---------------------------------------------------------------------------
# Core functions
# ---------------------------------------------------------------------------

def redact(value: str) -> str:
    """Show first 4 + last 2 chars, mask the rest."""
    if len(value) <= 6:
        return "****"
    return value[:4] + "*" * (len(value) - 6) + value[-2:]


def scan_for_secrets(payload: dict) -> ScanResult:
    text = json.dumps(payload)

    for pattern in SECRET_PATTERNS:
        match = pattern.search(text)
        if match:
            return ScanResult(
                detected=True,
                error_code="SENSITIVE_DATA_DETECTED",
                redacted_hint=redact(match.group()),
            )

    return ScanResult(detected=False)


async def apply_secret_scan_policy(
    token,  # AgentToken | None — imported lazily to avoid circular deps
    scan_result: ScanResult,
    audit_logger=None,
    count_prior_detections_fn=None,
) -> ScanResponse:
    """Apply the warning-mode policy for registered agents.

    - First 3 detections for a registered-tier token → HTTP 200 with warning.
    - 4th+ detection (or any non-registered token) → HTTP 422 hard rejection.
    - All detections are logged to the audit trail.
    """
    if not scan_result.detected:
        return ScanResponse(action="allow")

    if audit_logger is not None:
        await audit_logger(
            action="secret_scan_detected",
            token=token,
            hint=scan_result.redacted_hint,
        )

    is_registered = token is not None and token.tier == "registered"
    prior_detections = 0
    if count_prior_detections_fn is not None:
        prior_detections = await count_prior_detections_fn(
            token.hash if token else None
        )

    if is_registered and prior_detections < 3:
        return ScanResponse(
            action="warn",
            status_code=200,
            warning=(
                f"Sensitive data pattern detected: {scan_result.redacted_hint}. "
                f"Warning {prior_detections + 1}/3 before hard rejection."
            ),
        )

    return ScanResponse(action="reject", status_code=422, error="SENSITIVE_DATA_DETECTED")
