set dotenv-load := true
set fallback := true

# Default: list available commands
default:
    @just --list --unsorted

# ─────────────────────────────────────────────────────────────
# INSTALL & SETUP
# ─────────────────────────────────────────────────────────────

# Install all dependencies (Node + Python)
install:
    @echo "=== Installing Node dependencies ==="
    cd apps/desktop && pnpm install
    @echo "=== Syncing Python environment ==="
    cd services/agent-orchestrator && uv sync
    @echo "=== Setup complete ==="

# ─────────────────────────────────────────────────────────────
# DEVELOPMENT
# ─────────────────────────────────────────────────────────────

# Start the Python agent orchestrator backend
backend:
    cd services/agent-orchestrator && PYTHONPATH=. uv run uvicorn api.main:app --host 0.0.0.0 --port 9876 --reload

# Start the Tauri desktop app in dev mode
dev:
    cd apps/desktop && pnpm tauri dev

# Start both backend and frontend (requires tmux or two terminals)
dev-all:
    @echo "Start backend in one terminal: just backend"
    @echo "Start desktop in another:     just dev"

# ─────────────────────────────────────────────────────────────
# BUILD & BUNDLE
# ─────────────────────────────────────────────────────────────

# Build Python backend as a single executable (PyInstaller sidecar)
build-sidecar:
    #!/usr/bin/env bash
    set -euo pipefail
    TRIPLE=$(rustc --print host-tuple)
    SIDECAR_DIR="apps/desktop/src-tauri/binaries"
    BACKEND_DIR="services/agent-orchestrator"
    BINARY_NAME="beehive-studio-agent"
    mkdir -p "$SIDECAR_DIR"
    rm -f "$SIDECAR_DIR/$BINARY_NAME"*
    cd "$BACKEND_DIR"
    uv run pyinstaller \
        --onefile \
        --name "$BINARY_NAME" \
        --hidden-import uvicorn.logging \
        --hidden-import uvicorn.loops \
        --hidden-import uvicorn.loops.auto \
        --hidden-import fastapi.middleware.cors \
        --distpath "../../$SIDECAR_DIR" \
        api/main.py
    mv "$SIDECAR_DIR/$BINARY_NAME" "$SIDECAR_DIR/$BINARY_NAME-$TRIPLE"
    echo "✓ Sidecar built: $SIDECAR_DIR/$BINARY_NAME-$TRIPLE"

# Build Tauri app for production
build-desktop:
    cd apps/desktop && pnpm tauri build

# Build VST plugin for release
build-vst:
    cd crates/beehive-studio-vst && cargo build --release
    @echo "✓ VST built: crates/beehive-studio-vst/target/release/libbeehive_studio_vst.so"

# Full production build
build: build-sidecar build-desktop build-vst
    @echo "✓ Full production build complete"

# ─────────────────────────────────────────────────────────────
# PODMAN / CONTAINERS
# ─────────────────────────────────────────────────────────────

# Build container image for the agent orchestrator
podman-build:
    podman build -t beehive-studio-agent:latest -f services/agent-orchestrator/Containerfile services/agent-orchestrator

# Run the agent orchestrator in a Podman container
podman-run:
    podman run --rm -it \
        -p 127.0.0.1:9876:9876 \
        -e OLLAMA_HOST=host.containers.internal:11434 \
        --name beehive-studio-agent \
        beehive-studio-agent:latest

# Run Ollama in a Podman container (optional, if not using system Ollama)
podman-ollama:
    podman run --rm -it \
        -p 127.0.0.1:11434:11434 \
        -v ollama_data:/root/.ollama \
        --name ollama \
        docker.io/ollama/ollama:latest

# ─────────────────────────────────────────────────────────────
# CODE QUALITY
# ─────────────────────────────────────────────────────────────

# Format all code
fmt:
    cd apps/desktop && pnpm exec prettier --write "src/**/*.{ts,tsx}" 2>/dev/null || true
    cd services/agent-orchestrator && uv run ruff format .
    cd apps/desktop/src-tauri && cargo fmt

# Lint all code
lint:
    cd services/agent-orchestrator && uv run ruff check .
    cd apps/desktop/src-tauri && cargo clippy -- -D warnings
    cd apps/desktop && pnpm exec tsc --noEmit

# Run tests
test:
    cd services/agent-orchestrator && uv run pytest
    cd apps/desktop/src-tauri && cargo test

# ─────────────────────────────────────────────────────────────
# UTILITIES
# ─────────────────────────────────────────────────────────────

# Clean build artifacts
clean:
    cd apps/desktop/src-tauri && cargo clean
    rm -rf apps/desktop/dist
    rm -rf apps/desktop/src-tauri/binaries/*
    rm -rf services/agent-orchestrator/build

# Health check — verify all services
health:
    @echo "=== Beehive Studio Health Check ==="
    @echo "Node:     $(node --version)"
    @echo "pnpm:     $(pnpm --version)"
    @echo "Rust:     $(rustc --version)"
    @echo "Tauri:    $(cd apps/desktop && pnpm exec tauri --version)"
    @echo "uv:       $(uv --version)"
    @echo "Python:   $(cd services/agent-orchestrator && uv run python --version)"
    @echo "Ollama:   $(curl -s http://localhost:11434/api/tags >/dev/null && echo 'running' || echo 'NOT RUNNING')"
    @echo "Podman:   $(podman --version)"
    @echo "Backend:  $(curl -s http://localhost:9876/health 2>/dev/null | grep -o 'ok' || echo 'NOT RUNNING')"

# Quick test — generate a brief via the backend
test-brief:
    curl -s -X POST http://localhost:9876/brief \
      -H "Content-Type: application/json" \
      -d '{"brief":"dark rolling acid bassline 142 bpm","session_context":{"bpm":142}}' | python3 -m json.tool
