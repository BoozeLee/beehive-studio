#!/usr/bin/env bash
set -euo pipefail

VERSION="0.3.0-alpha"
SCRIPT_PATH="${BASH_SOURCE[0]}"
if command -v readlink >/dev/null 2>&1; then
    SCRIPT_PATH="$(readlink -f "${SCRIPT_PATH}")"
fi
SCRIPT_DIR="$(cd "$(dirname "${SCRIPT_PATH}")" && pwd)"
export BEEHIVE_DIR="${BEEHIVE_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
BACKEND_PID=""

cleanup() {
    if [[ -n "${BACKEND_PID}" ]]; then
        kill "${BACKEND_PID}" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

backend_is_running() {
    curl -fsS http://127.0.0.1:9876/health >/dev/null 2>&1
}

start_backend_if_needed() {
    if backend_is_running; then
        return
    fi

    echo "Starting Beehive Studio backend on 127.0.0.1:9876..."
    (
        cd "${BEEHIVE_DIR}/services/agent-orchestrator"
        PYTHONPATH=. uv run uvicorn api.main:app --host 127.0.0.1 --port 9876
    ) &
    BACKEND_PID="$!"

    for _ in {1..30}; do
        if backend_is_running; then
            return
        fi
        sleep 0.5
    done

    echo "Backend did not become healthy on 127.0.0.1:9876" >&2
    exit 1
}

run_desktop() {
    local release_bin="${BEEHIVE_DIR}/apps/desktop/src-tauri/target/release/beehive-studio"
    local debug_bin="${BEEHIVE_DIR}/apps/desktop/src-tauri/target/debug/beehive-studio"

    if [[ -x "${release_bin}" && -d "${BEEHIVE_DIR}/apps/desktop/dist" ]]; then
        exec "${release_bin}"
    fi

    if [[ -x "${debug_bin}" && -d "${BEEHIVE_DIR}/apps/desktop/dist" ]]; then
        exec "${debug_bin}"
    fi

    cd "${BEEHIVE_DIR}/apps/desktop"
    exec pnpm tauri dev
}

case "${1:-}" in
    --version|-V)
        echo "Beehive Studio ${VERSION}"
        ;;
    --repo)
        echo "${BEEHIVE_DIR}"
        ;;
    --check)
        test -d "${BEEHIVE_DIR}/apps/desktop"
        test -d "${BEEHIVE_DIR}/services/agent-orchestrator"
        test -f "${BEEHIVE_DIR}/apps/desktop/src-tauri/tauri.conf.json"
        echo "Beehive Studio launcher ok (${BEEHIVE_DIR})"
        ;;
    backend)
        cd "${BEEHIVE_DIR}"
        exec just backend
        ;;
    dev)
        cd "${BEEHIVE_DIR}"
        exec just dev
        ;;
    test)
        cd "${BEEHIVE_DIR}"
        exec just test
        ;;
    ""|launch)
        start_backend_if_needed
        run_desktop
        ;;
    *)
        echo "Usage: beehivestudio [--version|--repo|--check|backend|dev|test|launch]" >&2
        exit 2
        ;;
esac
