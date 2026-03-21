from grexis.admin.auth import create_session_token, verify_session_token


def test_create_and_verify_session():
    secret = "test-secret-key"
    token = create_session_token(secret)
    assert verify_session_token(token, secret) is True


def test_invalid_token_rejected():
    assert verify_session_token("invalid-token", "test-secret") is False
