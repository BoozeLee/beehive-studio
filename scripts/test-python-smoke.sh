#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}/services/agent-orchestrator"

BEEHIVE_SKIP_OLLAMA_CHECK=1 PYTHONPATH=. uv run pytest tests/test_smoke.py -q
