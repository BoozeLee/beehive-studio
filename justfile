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
# LAUNCH & OMARCHY
# ─────────────────────────────────────────────────────────────

# Launch Beehive Studio (backend + desktop) — uses beehivestudio script
run:
    beehivestudio

# Stop all Beehive Studio processes
stop:
    beehivestudio stop

# Build production desktop app
build-desktop:
    cd apps/desktop && pnpm tauri build
    @echo "✓ Desktop built: apps/desktop/src-tauri/target/release/beehive-studio"
    @echo "  To install: just install-desktop"

# Full production build (desktop + VST)
build: build-desktop build-vst
    @echo "✓ Full production build complete"

# Install desktop entry and launcher for omarchy
install-desktop:
    @echo "=== Installing beehivestudio launcher ==="
    mkdir -p ~/.local/bin
    cp scripts/beehivestudio.sh ~/.local/bin/beehivestudio
    chmod +x ~/.local/bin/beehivestudio
    @echo "=== Installing desktop entry ==="
    mkdir -p ~/.local/share/applications
    cp scripts/beehive-studio.desktop ~/.local/share/applications/
    @echo "=== Installing icon ==="
    mkdir -p ~/.local/share/icons/hicolor/128x128/apps
    cp apps/desktop/src-tauri/icons/128x128.png \
      ~/.local/share/icons/hicolor/128x128/apps/beehive-studio.png
    gtk-update-icon-cache ~/.local/share/icons/hicolor/ 2>/dev/null || true
    @echo "✓ Install complete — run: just run"
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
