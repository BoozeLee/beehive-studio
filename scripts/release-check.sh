#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${1:-0.3.0-alpha}"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

check_cmd() {
    local name="$1"
    local cmd="$2"
    printf "Checking %s... " "$name"
    if bash -c "$cmd" >/dev/null 2>&1; then
        echo -e "${GREEN}ok${NC}"
        ((PASS=PASS+1))
    else
        echo -e "${RED}failed${NC}"
        ((FAIL=FAIL+1))
    fi
}

echo "========================================"
echo "Beehive Studio Release Checklist v$VERSION"
echo "========================================"

check_cmd "Node.js" "node --version"
check_cmd "pnpm" "pnpm --version"
check_cmd "Rust" "rustc --version"
check_cmd "uv" "uv --version"
check_cmd "Python" "python --version"

echo ""
echo "--- Alpha Gates ---"
check_cmd "Frontend unit/type tests" "cd '$ROOT_DIR' && bash scripts/test-frontend.sh"
check_cmd "Python smoke tests" "cd '$ROOT_DIR' && bash scripts/test-python-smoke.sh"
check_cmd "Plugin manifest" "cd '$ROOT_DIR' && python scripts/test-plugin-manifest.py"
check_cmd "Package metadata" "cd '$ROOT_DIR' && python scripts/test-package-metadata.py"
check_cmd "Packaging launcher" "cd '$ROOT_DIR' && bash scripts/test-packaging.sh"
check_cmd "Renderer QA" "cd '$ROOT_DIR' && python scripts/render-smoke.py --preset festival --output build/reports/render-smoke.wav --report build/reports/render-smoke-report.json"

echo ""
echo "--- Optional Runtime Checks ---"
if curl -s http://localhost:9876/health >/dev/null 2>&1; then
    check_cmd "Backend health" "curl -s http://localhost:9876/health | grep -q '\"status\":\"ok\"\\|\"status\": \"ok\"'"
    check_cmd "Agents endpoint" "curl -s http://localhost:9876/agents | grep -q 'mix_master'"
else
    echo -e "${YELLOW}Backend not running on port 9876; skipping live endpoint checks${NC}"
fi

if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
    check_cmd "Ollama running" "curl -s http://localhost:11434/api/tags"
else
    echo -e "${YELLOW}Ollama not running; skipping model checks${NC}"
fi

echo ""
echo "========================================"
echo -e "Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}Release blocked${NC}"
    exit 1
fi

echo -e "${GREEN}Beehive Studio alpha gates passed for v$VERSION${NC}"
