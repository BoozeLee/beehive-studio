#!/usr/bin/env python3
from __future__ import annotations

import json
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = "0.4.0-beta"

desktop_package = json.loads((ROOT / "apps" / "desktop" / "package.json").read_text())
tauri_conf = json.loads((ROOT / "apps" / "desktop" / "src-tauri" / "tauri.conf.json").read_text())
tauri_cargo = tomllib.loads((ROOT / "apps" / "desktop" / "src-tauri" / "Cargo.toml").read_text())
vst_cargo = tomllib.loads((ROOT / "crates" / "beehive-studio-vst" / "Cargo.toml").read_text())
backend = tomllib.loads((ROOT / "services" / "agent-orchestrator" / "pyproject.toml").read_text())

assert desktop_package["version"] == VERSION
assert tauri_conf["version"] == VERSION
assert tauri_conf["productName"] == "Beehive Studio"
assert tauri_conf["identifier"] == "studio.beehive.desktop"
assert "appimage" not in {str(target).lower() for target in tauri_conf["bundle"]["targets"]}
assert tauri_cargo["package"]["version"] == VERSION
assert vst_cargo["package"]["version"] == VERSION
assert backend["project"]["version"] == VERSION

print("Package metadata ok")
