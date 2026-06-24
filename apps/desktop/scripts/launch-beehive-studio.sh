#!/usr/bin/env bash
set -euo pipefail

BINARY="${BEEHIVE_STUDIO_BINARY:-$HOME/.local/bin/beehive-studio}"
export GDK_BACKEND=x11

# WebKitGTK + NVIDIA/Wayland compositing workaround.
# Try accelerated path first; if the window stays blank, set BEEHIVE_FORCE_SOFTWARE=1.
if [[ "${BEEHIVE_FORCE_SOFTWARE:-0}" == "1" ]]; then
  export WEBKIT_DISABLE_COMPOSITING_MODE=1
  export LIBGL_ALWAYS_SOFTWARE=1
fi

exec "$BINARY" "$@"
