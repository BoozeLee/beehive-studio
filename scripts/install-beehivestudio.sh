#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${HOME}/.local/bin"
APP_DIR="${HOME}/.local/share/applications"
DESKTOP_FILE="${APP_DIR}/studio.beehive.desktop"
LAUNCHER="${BIN_DIR}/beehivestudio"

mkdir -p "${BIN_DIR}" "${APP_DIR}"
ln -sfn "${ROOT_DIR}/scripts/beehivestudio.sh" "${LAUNCHER}"

cat > "${DESKTOP_FILE}" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Beehive Studio
Comment=Local-first AI music production environment
Exec=${LAUNCHER} launch
Terminal=false
Categories=Audio;AudioVideo;Music;Development;
StartupWMClass=Beehive Studio
X-GNOME-UsesNotifications=false
DESKTOP

chmod +x "${ROOT_DIR}/scripts/beehivestudio.sh" "${LAUNCHER}"
chmod 644 "${DESKTOP_FILE}"

echo "Installed Beehive Studio launcher: ${LAUNCHER}"
echo "Installed desktop entry: ${DESKTOP_FILE}"
