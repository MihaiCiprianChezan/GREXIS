FROM python:3.12-slim

WORKDIR /app

# Install system deps for onnxruntime
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

# Download bge-m3 ONNX model at build time
RUN python -c "from huggingface_hub import snapshot_download; snapshot_download('BAAI/bge-m3', local_dir='/models/bge-m3', allow_patterns=['*.onnx', '*.json', '*.txt', 'tokenizer*'])"

EXPOSE 8000

CMD ["uvicorn", "grexis.main:app", "--host", "0.0.0.0", "--port", "8000"]
