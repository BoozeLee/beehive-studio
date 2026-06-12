"""Comprehensive tests for the Lua scripting API (SafeMusicApi, TrackProxy, LuaScriptManager)."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_safemusicapi_import():
    from lua import SafeMusicApi, TrackProxy, LuaScriptManager
    assert SafeMusicApi is not None
    assert TrackProxy is not None
    assert LuaScriptManager is not None


def test_safemusicapi_all_methods():
    from lua import SafeMusicApi
    api = SafeMusicApi()
    expected = {
        "note_on", "note_off", "cc", "play_note",
        "now", "random", "random_int",
        "play", "pause", "stop", "set_bpm", "get_bpm",
        "set_volume", "set_pan", "set_mute", "set_solo",
        "automate_param", "automate", "automation_value",
        "get_scene", "get_partners", "get_xp",
        "track",
    }
    actual = {m for m in dir(api) if not m.startswith("_")}
    missing = expected - actual
    assert not missing, f"Missing methods: {missing}"
    assert len(expected) == 23


def test_safemusicapi_transport():
    from lua import SafeMusicApi
    api = SafeMusicApi()
    assert api.play() == {"type": "transport_play", "time": 0.0}
    assert api.pause() == {"type": "transport_pause", "time": 0.0}
    assert api.stop() == {"type": "transport_stop", "time": 0.0}
    assert api.set_bpm(bpm=140) == {"type": "transport_set_bpm", "bpm": 140.0}
    assert api.get_bpm() == {"type": "transport_get_bpm"}


def test_safemusicapi_transport_from_lua_table():
    from lua import SafeMusicApi
    api = SafeMusicApi()
    result = api.play(time=1.5)
    assert result["type"] == "transport_play"
    assert result["time"] == 1.5


def test_safemusicapi_mixer():
    from lua import SafeMusicApi
    api = SafeMusicApi()
    assert api.set_volume(channel=2, volume=0.75)["volume"] == 0.75
    assert api.set_pan(channel=1, pan=-0.5)["pan"] == -0.5
    assert api.set_mute(channel=0, muted=True)["muted"] is True
    assert api.set_solo(channel=0, solo=True)["solo"] is True
    assert api.set_mute(channel=0, muted=False)["muted"] is False


def test_safemusicapi_automation():
    from lua import SafeMusicApi
    api = SafeMusicApi()
    r = api.automate_param(target="filter", property_name="freq", beat=0.0, value=1000, duration=2.0)
    assert r["type"] == "automation"

    r = api.automate(target="filter", property_name="freq", value=1000, time=0.0, duration=2.0, easing="linear")
    assert r["type"] == "automation_set"
    assert r["easing"] == "linear"

    r = api.automation_value(target="filter", property_name="freq", time=4.0)
    assert r["type"] == "automation_query"
    assert r["time"] == 4.0


def test_safemusicapi_scene_quest():
    from lua import SafeMusicApi
    api = SafeMusicApi()
    assert api.get_scene(name="brussels-techno")["type"] == "scene_query"
    assert api.get_partners()["type"] == "partners_query"
    assert api.get_xp(user_id="current")["type"] == "xp_query"


def test_safemusicapi_note_methods():
    from lua import SafeMusicApi
    api = SafeMusicApi()
    r = api.note_on(pitch=60, velocity=100, channel=0, time=0.0)
    assert r[0]["type"] == "note_on"
    assert r[0]["pitch"] == 60

    r = api.note_off(pitch=60, channel=0, time=1.0)
    assert r[0]["type"] == "note_off"

    r = api.play_note(pitch=60, duration=0.25, velocity=100, channel=0, time=0.0)
    assert r["type"] == "note_on"
    assert r["duration"] == 0.25
    assert r["pitch"] == 60

    r = api.cc(control=1, value=64, channel=0, time=0.0)
    assert r[0]["type"] == "cc"


def test_safemusicapi_utility():
    from lua import SafeMusicApi
    api = SafeMusicApi()

    t = api.now()
    assert isinstance(t, float)
    assert t > 0

    r = api.random()
    assert 0 <= r <= 1

    r = api.random(a=10)
    assert 0 <= r <= 10

    r = api.random(a=5, b=10)
    assert 5 <= r <= 10

    r = api.random_int(a=10)
    assert isinstance(r, int)
    assert 0 <= r <= 10

    r = api.random_int(a=5, b=10)
    assert 5 <= r <= 10


def test_safemusicapi_create_clip():
    from lua import SafeMusicApi
    api = SafeMusicApi()
    result = api.create_clip(track=1, start=0.0, duration=4.0, notes="C3 D3", name="test")
    assert result["type"] == "clip_create"
    assert result["track"] == 1
    assert result["start"] == 0.0
    assert result["duration"] == 4.0
    assert result["notes"] == "C3 D3"


def test_safemusicapi_create_track():
    from lua import SafeMusicApi
    api = SafeMusicApi()
    result = api.create_track(name="synth", channel=2, instrument="midi")
    assert result["type"] == "track_create"
    assert result["name"] == "synth"
    assert result["channel"] == 2
    assert result["instrument"] == "midi"


def test_safemusicapi_set_effect():
    from lua import SafeMusicApi
    api = SafeMusicApi()
    result = api.set_effect(track=0, effect="reverb", slot=0)
    assert result["type"] == "effect_set"
    assert result["track"] == 0
    assert result["effect"] == "reverb"


def test_safemusicapi_set_effect_param():
    from lua import SafeMusicApi
    api = SafeMusicApi()
    result = api.set_effect_param(track=0, slot=0, param="mix", value=0.3)
    assert result["type"] == "effect_set_param"
    assert result["param"] == "mix"
    assert result["value"] == 0.3


def test_safemusicapi_render():
    from lua import SafeMusicApi
    api = SafeMusicApi()
    result = api.render(start=0, duration=32, format="wav")
    assert result["type"] == "render_trigger"
    assert result["start"] == 0.0
    assert result["duration"] == 32.0
    assert result["format"] == "wav"


def test_safemusicapi_get_tracks():
    from lua import SafeMusicApi
    api = SafeMusicApi()
    result = api.get_tracks()
    assert result["type"] == "tracks_list"


def test_safemusicapi_delete_track():
    from lua import SafeMusicApi
    api = SafeMusicApi()
    result = api.delete_track(track=1)
    assert result["type"] == "track_delete"
    assert result["track"] == 1


def test_safemusicapi_get_clips():
    from lua import SafeMusicApi
    api = SafeMusicApi()
    result = api.get_clips(track=0)
    assert result["type"] == "clips_list"
    assert result["track"] == 0
    from lua import SafeMusicApi, TrackProxy
    api = SafeMusicApi()
    track = api.track(channel=2)
    assert isinstance(track, TrackProxy)
    assert track._channel == 2


def test_trackproxy_mixer_methods():
    from lua import SafeMusicApi
    api = SafeMusicApi()
    track = api.track(channel=1)

    r = track.set_volume(volume=0.9)
    assert r["channel"] == 1
    assert r["volume"] == 0.9

    r = track.set_pan(pan=0.3)
    assert r["pan"] == 0.3

    r = track.set_mute(muted=True)
    assert r["muted"] is True

    r = track.set_solo(solo=True)
    assert r["solo"] is True

    r = track.set_arm(arm=True)
    assert r["arm"] is True

    r = track.meter()
    assert r["type"] == "mixer_meter"
    assert r["channel"] == 1


def test_trackproxy_properties():
    from lua import SafeMusicApi
    api = SafeMusicApi()
    track = api.track(channel=0)

    assert track.volume == 0.8
    assert track.pan == 0.0
    assert track.muted is False
    assert track.solo is False
    assert track.arm is False

    track.volume = 0.5
    track.pan = -0.8
    track.muted = True
    track.solo = False
    track.arm = False


def test_luascriptmanager_execute():
    from lua import LuaScriptManager
    mgr = LuaScriptManager()
    r = mgr.execute("return 1 + 1")
    assert r == 2


def test_luascriptmanager_execute_action():
    from lua import LuaScriptManager
    mgr = LuaScriptManager()
    mgr.clear_actions()
    r = mgr.execute("return music.play{}")
    assert r == {"type": "transport_play", "time": 0.0}
    actions = mgr.get_actions()
    assert len(actions) == 1
    assert actions[0]["type"] == "transport_play"


def test_luascriptmanager_execute_multiple_actions():
    from lua import LuaScriptManager
    mgr = LuaScriptManager()
    mgr.clear_actions()
    mgr.execute("""
    return {
      music.set_bpm{bpm=128},
      music.set_volume{channel=1, volume=0.7},
      music.play{time=0.0}
    }
    """)
    actions = mgr.get_actions()
    assert len(actions) == 3
    assert actions[0]["type"] == "transport_set_bpm"
    assert actions[1]["type"] == "mixer_set_volume"
    assert actions[2]["type"] == "transport_play"


def test_luascriptmanager_call_function():
    from lua import LuaScriptManager
    mgr = LuaScriptManager()
    mgr.clear_actions()
    mgr.execute("function fn() return music.set_bpm{bpm=140} end")
    r = mgr.call_function("fn")
    assert r == {"type": "transport_set_bpm", "bpm": 140.0}
    assert len(mgr.get_actions()) == 1


def test_luascriptmanager_call_function_not_found():
    from lua import LuaScriptManager
    mgr = LuaScriptManager()
    try:
        mgr.call_function("nonexistent")
        assert False, "Should have raised NameError"
    except NameError:
        pass


def test_luascriptmanager_reset():
    from lua import LuaScriptManager
    mgr = LuaScriptManager()
    mgr.execute("return music.play{}")
    assert len(mgr.get_actions()) > 0
    mgr.reset()
    assert len(mgr.get_actions()) == 0


def test_luascriptmanager_clear_actions():
    from lua import LuaScriptManager
    mgr = LuaScriptManager()
    mgr.execute("return music.play{}")
    assert len(mgr.get_actions()) == 1
    mgr.clear_actions()
    assert len(mgr.get_actions()) == 0


def test_luascriptmanager_trackproxy_from_lua():
    from lua import LuaScriptManager
    mgr = LuaScriptManager()
    mgr.clear_actions()
    mgr.execute("""
    local t = music.track{channel=1}
    return {t.set_volume{volume=0.9}, t.set_pan{pan=-0.3}, t.set_mute{muted=true}}
    """)
    actions = mgr.get_actions()
    assert len(actions) == 3
    assert actions[0]["type"] == "mixer_set_volume"
    assert actions[0]["channel"] == 1


def test_luascriptmanager_automation_from_lua():
    from lua import LuaScriptManager
    mgr = LuaScriptManager()
    mgr.clear_actions()
    mgr.execute("""
    return {music.automate{target='filter', property_name='freq', value=1000, time=0, duration=4, easing='linear'}}
    """)
    actions = mgr.get_actions()
    assert len(actions) == 1
    assert actions[0]["type"] == "automation_set"


def test_whitelist_getter_allows_known():
    from lua import SafeMusicApi, _whitelist_getter
    api = SafeMusicApi()
    for method in {"play", "set_bpm", "track", "automate", "note_on"}:
        fn = _whitelist_getter(api, method)
        assert callable(fn), f"{method} should be callable"


def test_whitelist_getter_blocks_unknown():
    from lua import SafeMusicApi, _whitelist_getter
    api = SafeMusicApi()
    try:
        _whitelist_getter(api, "os")
        assert False, "Should have raised AttributeError"
    except AttributeError:
        pass


def test_whitelist_trackproxy_allows_known():
    from lua import SafeMusicApi, _whitelist_getter
    api = SafeMusicApi()
    track = api.track(channel=0)
    for attr in {"set_volume", "meter", "volume", "pan", "muted", "solo", "arm"}:
        val = _whitelist_getter(track, attr)
        assert val is not None, f"{attr} should be accessible"


def test_whitelist_trackproxy_blocks_unknown():
    from lua import SafeMusicApi, _whitelist_getter
    api = SafeMusicApi()
    track = api.track(channel=0)
    try:
        _whitelist_getter(track, "delete")
        assert False, "Should have raised AttributeError"
    except AttributeError:
        pass


def test_whitelist_setter_blocks_api():
    from lua import SafeMusicApi, _whitelist_setter
    api = SafeMusicApi()
    try:
        _whitelist_setter(api, "volume", 0.8)
        assert False, "Should have raised AttributeError"
    except AttributeError:
        pass


def test_whitelist_setter_allows_object():
    from lua import _whitelist_setter

    class Dummy:
        pass

    d = Dummy()
    _whitelist_setter(d, "new_attr", 123)
    assert d.new_attr == 123


def test_manager_registry():
    from lua import get_lua_manager
    m1 = get_lua_manager("sess-test")
    m2 = get_lua_manager("sess-test")
    assert m1 is m2

    m3 = get_lua_manager("sess-other")
    assert m1 is not m3


def test_manager_registry_reset():
    from lua import get_lua_manager, reset_lua_manager, remove_lua_manager
    m1 = get_lua_manager("sess-a")
    assert len(m1.get_actions()) == 0
    m1.execute("return music.play{}")
    assert len(m1.get_actions()) == 1
    reset_lua_manager("sess-a")
    assert len(m1.get_actions()) == 0

    remove_lua_manager("sess-a")


def test_allowed_reads_complete():
    from lua import _ALLOWED_READS
    expected_methods = {
        "note_on", "note_off", "cc", "play_note",
        "now", "random", "random_int",
        "play", "pause", "stop", "set_bpm", "get_bpm",
        "set_volume", "set_pan", "set_mute", "set_solo",
        "automate_param", "automate", "automation_value",
        "get_scene", "get_partners", "get_xp",
        "track",
        "create_clip", "create_track",
        "set_effect", "set_effect_param",
        "render", "get_tracks", "delete_track", "get_clips",
    }
    assert _ALLOWED_READS == expected_methods


def test_allowed_track_reads_complete():
    from lua import _ALLOWED_TRACK_READS
    expected = {
        "set_volume", "set_pan", "set_mute", "set_solo", "set_arm",
        "meter",
        "volume", "pan", "muted", "solo", "arm",
    }
    assert _ALLOWED_TRACK_READS == expected
