#!/bin/bash
set -euo pipefail

BACKEND=${BACKEND:-podman}
COMPOSE_FILE="$(dirname "$0")/docker-compose.yml"

echo "Starting vLLM inference service..."
echo "Backend: $BACKEND"

$BACKEND compose -f "$COMPOSE_FILE" up -d

echo "vLLM starting on http://localhost:8000"
echo "Health: curl http://localhost:8000/health"
echo ""
echo "To stop: $BACKEND compose -f $COMPOSE_FILE down"
