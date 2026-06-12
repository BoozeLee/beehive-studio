#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCHER="${ROOT_DIR}/scripts/beehivestudio.sh"
TAURI_CONF="${ROOT_DIR}/apps/desktop/src-tauri/tauri.conf.json"

test -x "${LAUNCHER}"
"${LAUNCHER}" --version | grep -q "Beehive Studio 0.4.0-beta"
"${LAUNCHER}" --check | grep -q "launcher ok"

python - "$TAURI_CONF" <<'PY'
import json
import sys
from pathlib import Path

conf = json.loads(Path(sys.argv[1]).read_text())
assert conf["productName"] == "Beehive Studio"
assert conf["identifier"] == "studio.beehive.desktop"
assert conf["version"] == "0.4.0-beta"
targets = conf["bundle"]["targets"]
assert "appimage" not in {str(target).lower() for target in targets}
assert set(targets) == {"deb", "rpm"}
PY
