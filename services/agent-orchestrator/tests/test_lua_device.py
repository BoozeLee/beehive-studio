"""M6.3: a Lua instrument device renders audible audio from its script."""

from agents.lua_device import render_lua_instrument

ARP_SCRIPT = """
local notes = {}
for i = 0, 7 do
  notes[#notes+1] = music.play_note{pitch = 48 + i, duration = 0.25, velocity = 110, time = i*0.25}
end
return notes
"""


def _peak_dbfs(seg) -> float:
    return seg.max_dBFS


def test_lua_instrument_produces_audible_audio():
    device = {"id": "d1", "name": "Arp", "kind": "instrument", "script": ARP_SCRIPT, "enabled": True}
    seg = render_lua_instrument(device, bpm=120.0)
    assert seg is not None
    assert len(seg) > 0
    assert _peak_dbfs(seg) > -40.0  # clearly non-silent


def test_disabled_device_is_silent():
    device = {"id": "d1", "name": "Arp", "kind": "instrument", "script": ARP_SCRIPT, "enabled": False}
    assert render_lua_instrument(device, bpm=120.0) is None


def test_empty_script_is_none():
    assert render_lua_instrument({"script": "", "enabled": True}) is None
    assert render_lua_instrument({"script": "return 1+1", "enabled": True}) is None  # no notes
