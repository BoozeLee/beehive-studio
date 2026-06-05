#!/usr/bin/env python3
from __future__ import annotations

import re
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "crates" / "beehive-studio-vst" / "Cargo.toml"
SOURCE = ROOT / "crates" / "beehive-studio-vst" / "src" / "lib.rs"

manifest = tomllib.loads(MANIFEST.read_text())
package = manifest["package"]
source = SOURCE.read_text()

assert package["name"] == "beehive-studio-vst"
assert package["version"] == "0.2.0"
assert "Beehive Studio" in package["description"]
assert 'const NAME: &\'static str = "Beehive Studio"' in source
assert 'const CLAP_ID: &\'static str = "studio.beehive"' in source
assert not re.search(r"\bDawBridge\b|\bMixHive\b", source)

print("Plugin manifest ok")
