#!/usr/bin/env bash
# GREXIS Development Launcher (Linux/macOS)
# Usage: ./start.sh [api|web|infra|all|stop]

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
CMD="${1:-all}"

start_infra() {
    echo -e "\033[36m[GREXIS] Starting infrastructure (Postgres, Qdrant, Redis)...\033[0m"
    docker compose -f "$ROOT/docker-compose.yml" up -d postgres qdrant redis
    echo -e "\033[33m[GREXIS] Waiting for services...\033[0m"
    sleep 3
    echo -e "\033[32m[GREXIS] Infrastructure ready.\033[0m"
}

start_api() {
    echo -e "\033[36m[GREXIS] Starting API on http://localhost:8000 ...\033[0m"
    if [ ! -f "$ROOT/api/.env" ]; then
        sed -e 's/postgres:5432/localhost:5432/g' \
            -e 's/qdrant:6333/localhost:6333/g' \
            -e 's/redis:6379/localhost:6379/g' \
            -e 's|http://api:8000|http://localhost:8000|g' \
            "$ROOT/.env.example" > "$ROOT/api/.env"
        echo -e "\033[33m[GREXIS] Created api/.env with localhost URLs\033[0m"
    fi
    cd "$ROOT/api"
    .venv/bin/uvicorn grexis.main:app --reload --port 8000
}

start_web() {
    echo -e "\033[36m[GREXIS] Starting Web UI on http://localhost:3000 ...\033[0m"
    cd "$ROOT/web"
    if [ ! -d "node_modules" ]; then
        echo -e "\033[33m[GREXIS] Installing npm dependencies...\033[0m"
        npm install
    fi
    npm run dev
}

stop_all() {
    echo -e "\033[33m[GREXIS] Stopping infrastructure...\033[0m"
    docker compose -f "$ROOT/docker-compose.yml" down
    echo -e "\033[32m[GREXIS] Stopped.\033[0m"
}

case "$CMD" in
    infra) start_infra ;;
    api)   start_infra; start_api ;;
    web)   start_web ;;
    all)
        start_infra
        echo ""
        echo -e "\033[35m[GREXIS] Run these in separate terminals:\033[0m"
        echo "  ./start.sh api    # API on :8000"
        echo "  ./start.sh web    # Web on :3000"
        ;;
    stop) stop_all ;;
    *)
        echo "Usage: ./start.sh [api|web|infra|all|stop]"
        exit 1
        ;;
esac
