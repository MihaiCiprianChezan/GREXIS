from redis.asyncio import Redis


class RedisClient:
    def __init__(self) -> None:
        self._client: Redis | None = None

    async def connect(self, url: str) -> None:
        self._client = Redis.from_url(url, decode_responses=True)

    async def close(self) -> None:
        if self._client:
            await self._client.aclose()

    @property
    def client(self) -> Redis:
        if self._client is None:
            raise RuntimeError("RedisClient not connected")
        return self._client

    # Rate limiting helpers
    async def check_rate_limit(self, key: str, limit: int, window_seconds: int) -> bool:
        pipe = self._client.pipeline()  # type: ignore[union-attr]
        pipe.incr(key)
        pipe.expire(key, window_seconds)
        results = await pipe.execute()
        return int(results[0]) <= limit

    # Cache helpers
    async def get_cached(self, key: str) -> str | None:
        return await self.client.get(key)

    async def set_cached(self, key: str, value: str, ttl: int) -> None:
        await self.client.setex(key, ttl, value)

    # Budget helpers
    async def get_counter(self, key: str) -> int:
        val = await self.client.get(key)
        return int(val) if val else 0

    async def increment_counter(self, key: str, ttl: int | None = None) -> int:
        val = await self.client.incr(key)
        if ttl and val == 1:
            await self.client.expire(key, ttl)
        return int(val)

    # Hash helpers (for rep:{token_hash})
    async def hgetall(self, key: str) -> dict[str, str]:
        return await self.client.hgetall(key)  # type: ignore[return-value]

    async def hmset(self, key: str, mapping: dict[str, str]) -> None:
        await self.client.hset(key, mapping=mapping)  # type: ignore[arg-type]

    # Diversity factor cache
    async def get_diversity_factor(self, solution_id: str) -> float | None:
        val = await self.client.get(f"diversity:{solution_id}")
        return float(val) if val else None

    async def set_diversity_factor(self, solution_id: str, factor: float) -> None:
        await self.client.setex(f"diversity:{solution_id}", 900, str(factor))
