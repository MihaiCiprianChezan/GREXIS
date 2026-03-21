import asyncpg
from asyncpg import Pool


class PostgresClient:
    def __init__(self) -> None:
        self._pool: Pool | None = None

    async def connect(self, dsn: str) -> None:
        # asyncpg uses its own DSN format (no +asyncpg prefix)
        clean_dsn = dsn.replace("postgresql+asyncpg://", "postgresql://")
        self._pool = await asyncpg.create_pool(clean_dsn, min_size=2, max_size=10)

    async def close(self) -> None:
        if self._pool:
            await self._pool.close()

    @property
    def pool(self) -> Pool:
        if self._pool is None:
            raise RuntimeError("PostgresClient not connected")
        return self._pool

    async def fetchrow(self, query: str, *args: object) -> asyncpg.Record | None:
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(query, *args)

    async def fetch(self, query: str, *args: object) -> list[asyncpg.Record]:
        async with self.pool.acquire() as conn:
            return await conn.fetch(query, *args)

    async def execute(self, query: str, *args: object) -> str:
        async with self.pool.acquire() as conn:
            return await conn.execute(query, *args)

    async def fetchval(self, query: str, *args: object) -> object:
        async with self.pool.acquire() as conn:
            return await conn.fetchval(query, *args)
