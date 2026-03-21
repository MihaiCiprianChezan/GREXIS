from grexis.db.postgres import PostgresClient


def test_postgres_client_initializes():
    client = PostgresClient.__new__(PostgresClient)
    assert client is not None
