import hashlib
import json
from grexis.lib.audit import compute_payload_hash


def test_compute_payload_hash():
    payload = {"key": "value"}
    expected = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    assert compute_payload_hash(payload) == expected
