#!/usr/bin/env bash
set -euo pipefail

BINARY="${1:-$(dirname "$0")/../target/release/beehive-studio}"
BINARY="$(realpath "$BINARY")"

echo "Starting Beehive Studio..."
echo "Binary: $BINARY"
echo "PID: $$"

export __GLX_VENDOR_LIBRARY_NAME=nvidia
export __EGL_VENDOR_LIBRARY_FILENAMES=/usr/share/glvnd/egl_vendor.d/10_nvidia.json
export GDK_BACKEND=x11
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export WEBKIT_DISABLE_DMABUF_RENDERER=1

exec "$BINARY"
