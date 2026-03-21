from grexis.db.postgres import PostgresClient
from grexis.db.qdrant import QdrantClient
from grexis.db.redis import RedisClient
from grexis.lib.embed import EmbeddingService
from grexis.lib.config import Settings

postgres = PostgresClient()
qdrant = QdrantClient()
redis = RedisClient()
embed_service = EmbeddingService()
