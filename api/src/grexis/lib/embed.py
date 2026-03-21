import logging
import numpy as np

logger = logging.getLogger(__name__)

VECTOR_SIZE_LOCAL = 1024
VECTOR_SIZE_OPENAI = 1536


class EmbeddingService:
    def __init__(self) -> None:
        self._provider: str = "local"
        self._session = None
        self._tokenizer = None
        self._openai_client = None

    async def initialize(self, provider: str = "local", model_path: str = "/models/bge-m3", openai_key: str = "") -> None:
        self._provider = provider

        if provider == "local":
            self._init_local(model_path)
        elif provider == "openai":
            self._init_openai(openai_key)
        else:
            raise ValueError(f"Unknown embedding provider: {provider}")

    def _init_local(self, model_path: str) -> None:
        import os
        import onnxruntime as ort
        from transformers import AutoTokenizer

        # Add NVIDIA pip-installed DLL paths so ONNX Runtime can find cuDNN/cuBLAS
        nvidia_pkg = os.path.join(os.path.dirname(ort.__file__), "..", "nvidia")
        if os.path.isdir(nvidia_pkg):
            for sub in ("cudnn", "cublas"):
                bin_dir = os.path.join(nvidia_pkg, sub, "bin")
                if os.path.isdir(bin_dir) and bin_dir not in os.environ.get("PATH", ""):
                    os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")

        # Auto-download model if not present locally
        onnx_path = os.path.join(model_path, "model.onnx")
        if not os.path.exists(onnx_path):
            logger.info("bge-m3 ONNX model not found locally, downloading from HuggingFace Hub...")
            from huggingface_hub import snapshot_download
            model_path = snapshot_download(
                "BAAI/bge-m3",
                allow_patterns=["onnx/*", "*.json", "*.txt", "tokenizer*"],
            )
            onnx_path = os.path.join(model_path, "model.onnx")
            if not os.path.exists(onnx_path):
                # Some ONNX models live in onnx/ subdirectory
                onnx_subdir = os.path.join(model_path, "onnx", "model.onnx")
                if os.path.exists(onnx_subdir):
                    onnx_path = onnx_subdir
                else:
                    # List what we got to help debug
                    onnx_files = [f for f in os.listdir(model_path) if f.endswith(".onnx")]
                    raise FileNotFoundError(
                        f"No model.onnx found in {model_path}. Files: {onnx_files}"
                    )
            logger.info(f"Model downloaded to {model_path}")

        providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
        self._session = ort.InferenceSession(onnx_path, providers=providers)
        active = self._session.get_providers()
        logger.info(f"ONNX providers: {active}")

        self._tokenizer = AutoTokenizer.from_pretrained(model_path)

    def _init_openai(self, api_key: str) -> None:
        from openai import AsyncOpenAI

        self._openai_client = AsyncOpenAI(api_key=api_key)

    @property
    def vector_size(self) -> int:
        return VECTOR_SIZE_LOCAL if self._provider == "local" else VECTOR_SIZE_OPENAI

    async def embed(self, text: str) -> list[float]:
        if self._provider == "local":
            return await self._embed_local(text)
        return await self._embed_openai(text)

    async def _embed_local(self, text: str) -> list[float]:
        inputs = self._tokenizer(
            text, padding=True, truncation=True, max_length=512, return_tensors="np"
        )
        outputs = self._session.run(
            None,
            {
                "input_ids": inputs["input_ids"].astype(np.int64),
                "attention_mask": inputs["attention_mask"].astype(np.int64),
            },
        )
        # Mean pooling over token dimension
        token_embeddings = outputs[0]  # (batch, seq_len, hidden_dim)
        attention_mask = inputs["attention_mask"]
        mask_expanded = np.expand_dims(attention_mask, -1)
        summed = np.sum(token_embeddings * mask_expanded, axis=1)
        counts = np.clip(np.sum(mask_expanded, axis=1), a_min=1e-9, a_max=None)
        pooled = summed / counts
        # Normalize
        norm = np.linalg.norm(pooled, axis=1, keepdims=True)
        normalized = pooled / np.clip(norm, a_min=1e-9, a_max=None)
        return normalized[0].tolist()

    async def _embed_openai(self, text: str) -> list[float]:
        response = await self._openai_client.embeddings.create(
            model="text-embedding-3-small",
            input=text,
        )
        return response.data[0].embedding
