#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}/services/agent-orchestrator"

BEEHIVE_SKIP_OLLAMA_CHECK=1 BEEHIVE_HIVE999_TIMEOUT=2 PYTHONPATH=. uv run pytest \
  tests/test_smoke.py \
  tests/test_proposal_contract.py \
  tests/test_seed.py \
  tests/test_lua_api.py \
  tests/test_plugin_loader.py \
  -q
