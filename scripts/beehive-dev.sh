#!/bin/bash
# Beehive Studio dev launcher: starts backend on 9876 + Tauri desktop
set -e

echo "Starting Beehive Studio dev environment (port 9876)..."

# Start backend in background
cd "$(dirname "$0")/../services/agent-orchestrator"
PYTHONPATH=. .venv/bin/uvicorn api.main:app --host 127.0.0.1 --port 9876 --reload &
BACKEND_PID=$!

echo "Backend started (PID $BACKEND_PID) on :9876"

# Start Tauri desktop
cd "$(dirname "$0")/../apps/desktop"
npm run tauri:dev

# Cleanup on exit
trap "kill $BACKEND_PID 2>/dev/null || true" EXIT
