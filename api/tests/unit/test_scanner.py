from grexis.services.scanner import scan_for_secrets, ScanResult


def test_detects_aws_key():
    payload = {"details": "Error with AKIAIOSFODNN7EXAMPLE key"}
    result = scan_for_secrets(payload)
    assert result.detected is True
    assert result.error_code == "SENSITIVE_DATA_DETECTED"


def test_detects_openai_key():
    payload = {"details": "Using sk-abcdefghijklmnopqrstuvwxyz123456"}
    result = scan_for_secrets(payload)
    assert result.detected is True


def test_detects_github_pat():
    payload = {"details": "Token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij"}
    result = scan_for_secrets(payload)
    assert result.detected is True


def test_clean_payload_passes():
    payload = {"error_type": "RateLimitError", "details": "Too many requests"}
    result = scan_for_secrets(payload)
    assert result.detected is False


def test_detects_jwt():
    jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
    payload = {"details": jwt}
    result = scan_for_secrets(payload)
    assert result.detected is True
