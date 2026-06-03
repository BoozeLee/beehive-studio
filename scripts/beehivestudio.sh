#!/usr/bin/env bash
# Beehive Studio — Launch script
# Starts the Python agent backend and launches the Tauri desktop app.
# Designed for omarchy desktop integration.

set -euo pipefail

BEEHIVE_DIR="${BEEHIVE_DIR:-$HOME/mixhive}"
BACKEND_PORT="${BACKEND_PORT:-9876}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
LOG_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/beehive-studio/logs"
BACKEND_DIR="$BEEHIVE_DIR/services/agent-orchestrator"

# Wayland fix: Tauri/GTK needs explicit display backend
export GDK_BACKEND="${GDK_BACKEND:-wayland,x11}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

# Colors for output
GREEN='\033[0;32m'
AMBER='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

log()   { echo -e "${GREEN}[beehive]${NC} $1"; }
warn()  { echo -e "${AMBER}[beehive]${NC} $1"; }
err()   { echo -e "${RED}[beehive]${NC} $1"; }

# Ensure log directory exists
mkdir -p "$LOG_DIR"

# Check if backend is already running
check_backend() {
  if curl -sf "http://${BACKEND_HOST}:${BACKEND_PORT}/health" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

# Start the Python backend
start_backend() {
  log "Starting agent orchestrator backend..."
  cd "$BACKEND_DIR"
  PYTHONPATH=. uv run uvicorn api.main:app \
    --host "$BACKEND_HOST" \
    --port "$BACKEND_PORT" \
    --loop asyncio \
    --no-access-log \
    >> "$LOG_DIR/backend.log" 2>&1 &
  BACKEND_PID=$!
  echo "$BACKEND_PID" > "$LOG_DIR/backend.pid"

  # Wait for backend to be ready (up to 15 seconds)
  for i in $(seq 1 15); do
    if check_backend; then
      log "Backend ready on http://${BACKEND_HOST}:${BACKEND_PORT}"
      return 0
    fi
    sleep 1
  done

  warn "Backend started but not yet responding (PID: $BACKEND_PID)"
  return 0
}

# Stop the backend
stop_backend() {
  if [ -f "$LOG_DIR/backend.pid" ]; then
    PID=$(cat "$LOG_DIR/backend.pid")
    if kill -0 "$PID" 2>/dev/null; then
      log "Stopping backend (PID: $PID)..."
      kill "$PID" 2>/dev/null || true
      wait "$PID" 2>/dev/null || true
    fi
    rm -f "$LOG_DIR/backend.pid"
  fi
}

# Launch the Tauri desktop app (production build or dev)
launch_desktop() {
  local binary="$BEEHIVE_DIR/apps/desktop/src-tauri/target/release/beehive-studio"

  if [ -x "$binary" ]; then
    log "Launching Beehive Studio desktop..."
    cd "$BEEHIVE_DIR"
    "$binary" &
    DESKTOP_PID=$!
    echo "$DESKTOP_PID" > "$LOG_DIR/desktop.pid"
  else
    warn "Production binary not found, starting in dev mode..."
    cd "$BEEHIVE_DIR/apps/desktop"
    pnpm tauri dev &
    DESKTOP_PID=$!
    echo "$DESKTOP_PID" > "$LOG_DIR/desktop.pid"
  fi
}

# Main
case "${1:-}" in
  stop)
    stop_backend
    if [ -f "$LOG_DIR/desktop.pid" ]; then
      kill "$(cat "$LOG_DIR/desktop.pid")" 2>/dev/null || true
      rm -f "$LOG_DIR/desktop.pid"
    fi
    log "Stopped"
    ;;
  restart)
    "$0" stop
    sleep 1
    "$0"
    ;;
  status)
    if check_backend; then
      echo "Backend:  ${GREEN}running${NC}"
    else
      echo "Backend:  ${RED}stopped${NC}"
    fi
    if [ -f "$LOG_DIR/desktop.pid" ] && kill -0 "$(cat "$LOG_DIR/desktop.pid")" 2>/dev/null; then
      echo "Desktop:  ${GREEN}running${NC}"
    else
      echo "Desktop:  ${RED}stopped${NC}"
    fi
    ;;
  build)
    log "Building desktop app..."
    cd "$BEEHIVE_DIR/apps/desktop"
    pnpm tauri build
    log "Build complete"
    ;;
  build-vst)
    log "Building VST plugin..."
    cd "$BEEHIVE_DIR/crates/beehive-studio-vst"
    cargo build --release
    log "VST built: target/release/libbeehive_studio_vst.so"
    ;;
  *)
    # Start backend if not running
    if ! check_backend; then
      start_backend
    else
      log "Backend already running"
    fi

    # Launch desktop
    launch_desktop

    # Trap to clean up on exit
    trap 'stop_backend' EXIT INT TERM

    # Wait for desktop to close
    wait "$DESKTOP_PID" 2>/dev/null || true
    log "Desktop closed"
    ;;
esac
