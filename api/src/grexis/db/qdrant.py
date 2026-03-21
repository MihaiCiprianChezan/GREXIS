from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance,
    Filter,
    PointStruct,
    SearchParams,
    VectorParams,
)

SOLUTIONS_COLLECTION = "solutions"
PROBLEMS_COLLECTION = "problems"


class QdrantClient:
    def __init__(self) -> None:
        self._client: AsyncQdrantClient | None = None

    async def connect(self, url: str) -> None:
        self._client = AsyncQdrantClient(url=url)

    async def close(self) -> None:
        if self._client:
            await self._client.close()

    @property
    def client(self) -> AsyncQdrantClient:
        if self._client is None:
            raise RuntimeError("QdrantClient not connected")
        return self._client

    async def ensure_collections(self, vector_size: int = 1024) -> None:
        for name, segments in [(SOLUTIONS_COLLECTION, 4), (PROBLEMS_COLLECTION, 2)]:
            collections = await self.client.get_collections()
            exists = any(c.name == name for c in collections.collections)
            if not exists:
                await self.client.create_collection(
                    collection_name=name,
                    vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
                    optimizers_config={"default_segment_number": segments},
                    replication_factor=1,
                )
        # Create payload indexes for hard filtering (Tech Spec Section 5.2)
        solution_indexes = [
            ("framework", "keyword"), ("framework_version", "keyword"),
            ("runtime", "keyword"), ("llm", "keyword"), ("error_type", "keyword"),
            ("severity", "keyword"), ("status", "keyword"), ("source", "keyword"),
            ("confidence_score", "float"), ("success_rate", "float"),
            ("last_validated_at", "integer"),
        ]
        for field, schema in solution_indexes:
            await self.client.create_payload_index(
                SOLUTIONS_COLLECTION, field, field_schema=schema
            )
        problem_indexes = [
            ("framework", "keyword"), ("error_type", "keyword"),
            ("status", "keyword"), ("severity", "keyword"),
            ("duplicate_count", "integer"),
        ]
        for field, schema in problem_indexes:
            await self.client.create_payload_index(
                PROBLEMS_COLLECTION, field, field_schema=schema
            )

    async def upsert_point(
        self, collection: str, point_id: str, vector: list[float], payload: dict
    ) -> None:
        await self.client.upsert(
            collection_name=collection,
            points=[PointStruct(id=point_id, vector=vector, payload=payload)],
        )

    async def search(
        self,
        collection: str,
        vector: list[float],
        filter_: Filter | None = None,
        limit: int = 10,
        score_threshold: float | None = None,
    ) -> list:
        return await self.client.search(
            collection_name=collection,
            query_vector=vector,
            query_filter=filter_,
            limit=limit,
            score_threshold=score_threshold,
            search_params=SearchParams(exact=False, hnsw_ef=128),
        )

    async def delete_point(self, collection: str, point_id: str) -> None:
        await self.client.delete(
            collection_name=collection,
            points_selector=[point_id],
        )
