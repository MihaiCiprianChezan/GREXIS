# GREXIS Development Launcher (PowerShell)
# Usage: .\start.ps1 [api|web|infra|all|stop]

param(
    [Parameter(Position=0)]
    [ValidateSet("api", "web", "infra", "all", "stop")]
    [string]$Command = "all"
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

function Start-Infra {
    Write-Host "[GREXIS] Starting infrastructure (Postgres, Qdrant, Redis)..." -ForegroundColor Cyan
    docker compose -f "$Root/docker-compose.yml" up -d postgres qdrant redis
    Write-Host "[GREXIS] Waiting for services..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
    Write-Host "[GREXIS] Infrastructure ready." -ForegroundColor Green
}

function Start-Api {
    Write-Host "[GREXIS] Starting API on http://localhost:8000 ..." -ForegroundColor Cyan
    if (-not (Test-Path "$Root/api/.env")) {
        Copy-Item "$Root/.env.example" "$Root/api/.env"
        (Get-Content "$Root/api/.env") `
            -replace 'postgres:5432', 'localhost:5432' `
            -replace 'qdrant:6333', 'localhost:6333' `
            -replace 'redis:6379', 'localhost:6379' `
            -replace 'http://api:8000', 'http://localhost:8000' |
            Set-Content "$Root/api/.env"
        Write-Host "[GREXIS] Created api/.env with localhost URLs" -ForegroundColor Yellow
    }
    Push-Location "$Root/api"
    & .venv/Scripts/uvicorn grexis.main:app --reload --port 8000
    Pop-Location
}

function Start-Web {
    Write-Host "[GREXIS] Starting Web UI on http://localhost:3000 ..." -ForegroundColor Cyan
    Push-Location "$Root/web"
    if (-not (Test-Path "node_modules")) {
        Write-Host "[GREXIS] Installing npm dependencies..." -ForegroundColor Yellow
        npm install
    }
    npm run dev
    Pop-Location
}

function Stop-All {
    Write-Host "[GREXIS] Stopping infrastructure..." -ForegroundColor Yellow
    docker compose -f "$Root/docker-compose.yml" down
    Write-Host "[GREXIS] Stopped." -ForegroundColor Green
}

switch ($Command) {
    "infra" { Start-Infra }
    "api"   { Start-Infra; Start-Api }
    "web"   { Start-Web }
    "all"   {
        Start-Infra
        Write-Host ""
        Write-Host "[GREXIS] Run these in separate terminals:" -ForegroundColor Magenta
        Write-Host "  .\start.ps1 api    # API on :8000" -ForegroundColor White
        Write-Host "  .\start.ps1 web    # Web on :3000" -ForegroundColor White
    }
    "stop"  { Stop-All }
}
