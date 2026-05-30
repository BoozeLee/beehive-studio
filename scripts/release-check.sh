#!/usr/bin/env bash
#
# Beehive Studio Release Checklist Script
# Usage: ./scripts/release-check.sh [version]
#

set -uo pipefail

VERSION="${1:-0.2.0}"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

check() {
    local name="$1"
    shift
    echo -n "Checking $name... "
    if "$@" >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        ((PASS=PASS+1))
    else
        echo -e "${RED}✗${NC}"
        ((FAIL=FAIL+1))
    fi
}

check_cmd() {
    local name="$1"
    local cmd="$2"
    echo -n "Checking $name... "
    if bash -c "$cmd" >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
        ((PASS=PASS+1))
    else
        echo -e "${RED}✗${NC}"
        ((FAIL=FAIL+1))
    fi
}

echo "========================================"
echo "Beehive Studio Release Checklist v$VERSION"
echo "========================================"
echo ""

# Environment checks
echo "--- Environment ---"
check "Node.js" node --version
check "pnpm" pnpm --version
check "Rust" rustc --version
check "uv" uv --version
check "Ollama" ollama --version
check "Podman" podman --version

# Code quality - these are critical
echo ""
echo "--- Code Quality ---"

# Rust
check_cmd "Rust formatting" "cd /home/kilisan/mixhive/apps/desktop/src-tauri && cargo fmt -- --check"
check_cmd "Rust clippy" "cd /home/kilisan/mixhive/apps/desktop/src-tauri && cargo clippy -- -D warnings"

# Python
check_cmd "Python formatting" "cd /home/kilisan/mixhive/services/agent-orchestrator && uv run ruff format --check api/ agents/ tools/ lua/ integrations/"
check_cmd "Python linting" "cd /home/kilisan/mixhive/services/agent-orchestrator && uv run ruff check api/ agents/ tools/ lua/ integrations/"

# TypeScript
check_cmd "TypeScript compilation" "cd /home/kilisan/mixhive/apps/desktop && ./node_modules/.bin/tsc --noEmit --project tsconfig.json"

# Tests
echo ""
echo "--- Tests ---"
check_cmd "Rust tests" "cd /home/kilisan/mixhive/apps/desktop/src-tauri && cargo test"
check_cmd "Python tests" "cd /home/kilisan/mixhive/services/agent-orchestrator && PYTHONPATH=. uv run pytest tests/test_smoke.py -q"

# Build verification
echo ""
echo "--- Build Verification ---"
check_cmd "Desktop dev build" "cd /home/kilisan/mixhive/apps/desktop/src-tauri && cargo check"
check_cmd "Desktop release build" "test -f /home/kilisan/mixhive/apps/desktop/src-tauri/target/release/beehive-studio"
check_cmd "VST release build" "test -f /home/kilisan/mixhive/crates/beehive-studio-vst/target/release/libbeehive_studio_vst.so"

# Backend health (optional - may not be running)
echo ""
echo "--- Backend Health ---"
if curl -s http://localhost:9876/health >/dev/null 2>&1; then
    check_cmd "Backend running" "curl -s http://localhost:9876/health | grep -q ok"
    check_cmd "Melody endpoint" "curl -s -X POST http://localhost:9876/agents/melody -H 'Content-Type: application/json' -d '{\"brief\":\"test\"}' | grep -q task_id"
    check_cmd "Harmony endpoint" "curl -s -X POST http://localhost:9876/agents/harmony -H 'Content-Type: application/json' -d '{\"brief\":\"test\"}' | grep -q task_id"
    check_cmd "Arrangement endpoint" "curl -s -X POST http://localhost:9876/agents/arrangement -H 'Content-Type: application/json' -d '{\"clips\":[]}' | grep -q arrangement"
    check_cmd "Export endpoint" "curl -s -X POST http://localhost:9876/export/midi -H 'Content-Type: application/json' -d '{\"clips\":[],\"bpm\":120}' | grep -q status"
else
    echo -e "${YELLOW}!${NC} Backend not running on port 9876 — skipping endpoint checks"
    echo "   Start with: just backend"
fi

# Ollama
echo ""
echo "--- Ollama ---"
if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
    check "Ollama running" curl -s http://localhost:11434/api/tags
    check_cmd "Model available" "curl -s http://localhost:11434/api/tags | grep -q baker-creative"
else
    echo -e "${YELLOW}!${NC} Ollama not running — skipping model checks"
fi

# Summary
echo ""
echo "========================================"
echo -e "Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}Release blocked — fix failures before continuing${NC}"
    exit 1
else
    echo -e "${GREEN}All checks passed! Ready to release v$VERSION${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Update CHANGELOG.md"
    echo "  2. git tag v$VERSION"
    echo "  3. just build"
    echo "  4. Create GitHub Release"
    echo "  5. Attach artifacts from target/release/bundle/"
    exit 0
fi
