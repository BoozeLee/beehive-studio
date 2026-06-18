#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_DIR="$(cd "${SCRIPT_DIR}/../dist" && pwd)"
PORT="${DEMO_PORT:-5174}"
OUT_DIR="${DEMO_OUT_DIR:-${SCRIPT_DIR}/../../demo-screenshots}"

mkdir -p "${OUT_DIR}"

cd "${DEMO_DIR}"
python3 -m http.server "${PORT}" >"${OUT_DIR}/demo-server.log" 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "${SERVER_PID}" 2>/dev/null || true
  wait "${SERVER_PID}" 2>/dev/null || true
}
trap cleanup EXIT

sleep 1

ROUTES=(
  "dashboard:demo.html:Dashboard:Demo Track:Toggle Transport"
  "timeline:route-timeline.html:Timeline:Beat:Track"
  "pattern:route-pattern.html:Pattern:Steps:Piano Roll"
  "mixer:route-mixer.html:Mixer:tracks:Timeline"
  "taste:route-taste.html:Taste:graph:liked"
  "agent:route-agent.html:Agent:Console:Run"
  "branches:route-branches.html:Branches:main:compare"
)

for entry in "${ROUTES[@]}"; do
  IFS=':' read -r name file token1 token2 token3 <<<"${entry}"
  url="http://localhost:${PORT}/${file}"
  out="${OUT_DIR}/${name}.png"
  echo "Capturing ${name} (${url}) ..."
  CHROME_TEMP=$(mktemp -d)
  chromium \
    --headless \
    --no-sandbox \
    --disable-gpu \
    --disable-dev-shm-usage \
    --user-data-dir="${CHROME_TEMP}" \
    --window-size=1400,900 \
    --virtual-time-budget=4000 \
    --run-all-compositor-stages-before-draw \
    --dump-dom \
    "${url}" >"${OUT_DIR}/${name}-dom.html" 2>"${OUT_DIR}/${name}-chromium.log"
  rm -rf "${CHROME_TEMP}"

  MISSING=0
  for token in "${token1}" "${token2}" "${token3}"; do
    if grep -qi "${token}" "${OUT_DIR}/${name}-dom.html"; then
      echo "  ✓ ${token}"
    else
      echo "  ✗ ${token}"
      MISSING=$((MISSING + 1))
    fi
  done

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
    --screenshot="${out}" \
    "${url}" >/dev/null 2>>"${OUT_DIR}/${name}-chromium.log"
  rm -rf "${CHROME_TEMP2}"

  if [[ ${MISSING} -gt 0 ]]; then
    echo "  ${name} verification had ${MISSING} missing tokens"
  else
    echo "  ${name} OK -> ${out}"
  fi
done

echo "All route screenshots saved to ${OUT_DIR}"
