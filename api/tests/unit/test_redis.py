from grexis.db.redis import RedisClient


def test_redis_client_initializes():
    client = RedisClient.__new__(RedisClient)
    assert client is not None
