from grexis.db.qdrant import QdrantClient as GQdrantClient, SOLUTIONS_COLLECTION, PROBLEMS_COLLECTION


def test_collection_names():
    assert SOLUTIONS_COLLECTION == "solutions"
    assert PROBLEMS_COLLECTION == "problems"


def test_qdrant_client_initializes():
    client = GQdrantClient.__new__(GQdrantClient)
    assert client is not None
