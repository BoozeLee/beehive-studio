#!/bin/bash
# Beehive Studio dev launcher: starts JetBee gateway, backend, and Tauri desktop
set -e

echo "Starting Beehive Studio dev environment (ports 9000 + 9876)..."
if ! curl -sf --max-time 1 http://127.0.0.1:17999/api/v1/health >/dev/null; then
    echo "Note: Hive 999 advisor is unavailable; Studio will use visible degraded mode."
fi

# Start canonical JetBee gateway in background
cd "$(dirname "$0")/../apps/api"
../../services/agent-orchestrator/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 9000 --reload &
GATEWAY_PID=$!

# Start deterministic agent backend in background
cd "$(dirname "$0")/../services/agent-orchestrator"
PYTHONPATH=. .venv/bin/uvicorn api.main:app --host 127.0.0.1 --port 9876 --reload &
BACKEND_PID=$!

echo "Gateway started (PID $GATEWAY_PID) on :9000"
echo "Backend started (PID $BACKEND_PID) on :9876"

trap "kill $GATEWAY_PID $BACKEND_PID 2>/dev/null || true" EXIT

# Start Tauri desktop
cd "$(dirname "$0")/../apps/desktop"
npm run tauri:dev
