set dotenv-load := true
set fallback := true
set shell := ["bash", "-cu"]

default:
    @just --list --unsorted

# Install project dependencies and the local beehivestudio launcher.
install:
    cd apps/desktop && pnpm install
    cd services/agent-orchestrator && uv sync
    bash scripts/install-beehivestudio.sh

# Python backend on port 9876.
backend:
    cd services/agent-orchestrator && PYTHONPATH=. uv run uvicorn api.main:app --host 127.0.0.1 --port 9876 --reload

# Tauri dev app.
dev:
    cd apps/desktop && pnpm tauri dev

# All alpha gates that do not require external cloud services.
test:
    bash scripts/test-frontend.sh
    bash scripts/test-python-smoke.sh
    python scripts/test-plugin-manifest.py
    python scripts/test-package-metadata.py
    bash scripts/test-packaging.sh
    python scripts/render-smoke.py --preset festival --output build/reports/render-smoke.wav --report build/reports/render-smoke-report.json

# Build plugin artifacts.
plugins:
    cd crates/beehive-studio-vst && cargo check

# Render a deterministic QA sample and report.
render:
    python scripts/render-smoke.py --preset festival --output build/reports/render-smoke.wav --report build/reports/render-smoke-report.json

# Full release readiness check.
release-check:
    bash scripts/release-check.sh 0.4.0-beta

# Optional desktop/package build. AppImage is intentionally disabled on Arch.
build-desktop:
    cd apps/desktop && pnpm tauri build

# Clean generated alpha artifacts.
clean:
    rm -rf build/reports
    rm -rf apps/desktop/dist
    cd apps/desktop/src-tauri && cargo clean
