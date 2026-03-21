import hashlib
from grexis.services.tokens import hash_token


def test_hash_token():
    raw = "test-token-123"
    expected = hashlib.sha256(raw.encode()).hexdigest()
    assert hash_token(raw) == expected
