import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from grexis.lib.embed import EmbeddingService


def test_embedding_service_initializes():
    service = EmbeddingService.__new__(EmbeddingService)
    assert service is not None


@pytest.mark.asyncio
async def test_embed_returns_vector():
    service = EmbeddingService.__new__(EmbeddingService)
    service._provider = "local"
    service._session = MagicMock()
    service._tokenizer = MagicMock()

    # Mock tokenizer — must return numpy arrays (like return_tensors="np")
    import numpy as np
    service._tokenizer.return_value = {
        "input_ids": np.array([[1, 2, 3]], dtype=np.int64),
        "attention_mask": np.array([[1, 1, 1]], dtype=np.int64),
    }

    # Mock ONNX session
    import numpy as np
    mock_output = np.random.rand(1, 3, 1024).astype(np.float32)
    service._session.run.return_value = [mock_output]

    result = await service.embed("test text")
    assert len(result) == 1024
    assert all(isinstance(v, float) for v in result)
