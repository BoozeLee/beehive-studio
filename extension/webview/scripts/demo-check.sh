#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_DIR="$(cd "${SCRIPT_DIR}/../dist" && pwd)"
PORT="${DEMO_PORT:-5174}"
OUT_DIR="${DEMO_OUT_DIR:-${SCRIPT_DIR}/../../demo-screenshots}"
URL="http://localhost:${PORT}/demo.html"

mkdir -p "${OUT_DIR}"

# Start static server in background
cd "${DEMO_DIR}"
python3 -m http.server "${PORT}" >"${OUT_DIR}/demo-server.log" 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "${SERVER_PID}" 2>/dev/null || true
  wait "${SERVER_PID}" 2>/dev/null || true
}
trap cleanup EXIT

sleep 1

# Render the page in Chromium and dump the final DOM
echo "Rendering demo at ${URL} ..."
CHROME_TEMP=$(mktemp -d)
chromium \
  --headless \
  --no-sandbox \
  --disable-gpu \
  --disable-dev-shm-usage \
  --user-data-dir="${CHROME_TEMP}" \
  --virtual-time-budget=4000 \
  --run-all-compositor-stages-before-draw \
  --dump-dom \
  "${URL}" >"${OUT_DIR}/demo-dom.html" 2>"${OUT_DIR}/demo-chromium.log"
rm -rf "${CHROME_TEMP}"

# Verify expected content is present
EXPECTED_TOKENS=("Beehive Studio" "Demo Track" "Pattern" "Mixer" "Timeline")
MISSING=0
for token in "${EXPECTED_TOKENS[@]}"; do
  if grep -q "${token}" "${OUT_DIR}/demo-dom.html"; then
    echo "✓ Found: ${token}"
  else
    echo "✗ Missing: ${token}"
    MISSING=$((MISSING + 1))
  fi
done

# Capture screenshot
echo "Capturing screenshot ..."
CHROME_TEMP2=$(mktemp -d)
chromium \
  --headless \
  --no-sandbox \
  --disable-gpu \
  --disable-dev-shm-usage \
  --user-data-dir="${CHROME_TEMP2}" \
  --window-size=1400,900 \
  --virtual-time-budget=4000 \
  --run-all-compositor-stages-before-draw \
  --screenshot="${OUT_DIR}/demo.png" \
  "${URL}" >/dev/null 2>>"${OUT_DIR}/demo-chromium.log"
rm -rf "${CHROME_TEMP2}"

if [[ ${MISSING} -gt 0 ]]; then
  echo "Demo verification FAILED: ${MISSING} expected tokens missing."
  echo "DOM dump: ${OUT_DIR}/demo-dom.html"
  echo "Chromium log: ${OUT_DIR}/demo-chromium.log"
  exit 1
fi

echo "Demo verification PASSED."
echo "Screenshot: ${OUT_DIR}/demo.png"
echo "DOM dump: ${OUT_DIR}/demo-dom.html"
