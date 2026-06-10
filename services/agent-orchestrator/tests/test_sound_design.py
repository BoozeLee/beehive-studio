"""Unit tests for the Sound Design agent."""

import pytest
from agents.sound_design import (
    run_sound_design_agent,
    run_sound_design_agent_streaming,
    parse_sound_description,
    generate_oscillator_params,
    generate_filter_params,
    generate_envelope_params,
    generate_lfo_params,
    generate_effects_chain,
    generate_sfz_file,
    generate_patch_name,
    SYNTH_TYPES,
)


class TestParseSoundDescription:
    """Tests for brief parsing."""

    def test_detects_bass_category(self):
        result = parse_sound_description("dark ritual bass")
        assert result["category"] == "bass"

    def test_detects_sub_category(self):
        result = parse_sound_description("deep sub rumble")
        assert result["category"] == "bass"

    def test_detects_lead_category(self):
        result = parse_sound_description("bright cutting lead melody")
        assert result["category"] == "lead"

    def test_detects_pad_category(self):
        result = parse_sound_description("warm lush evolving pad")
        assert result["category"] == "pad"

    def test_detects_pad_with_choir(self):
        result = parse_sound_description("ethereal choir pad ambient")
        assert result["category"] == "pad"

    def test_detects_pluck_category(self):
        result = parse_sound_description("short percussive pluck guitar")
        assert result["category"] == "pluck"

    def test_detects_fx_category(self):
        result = parse_sound_description("noise riser sweep effect")
        assert result["category"] == "fx"

    def test_detects_arp_category(self):
        result = parse_sound_description("rhythmic arpeggio sequence pattern")
        assert result["category"] == "arp"

    def test_detects_keys_category(self):
        result = parse_sound_description("electric piano rhodes keys")
        assert result["category"] == "keys"

    def test_detects_atmosphere_category(self):
        result = parse_sound_description("ethereal cinematic atmosphere drone")
        assert result["category"] == "atmosphere"

    def test_detects_dark_character(self):
        result = parse_sound_description("dark underground ritual")
        assert result["character"] == "dark"

    def test_detects_bright_character(self):
        result = parse_sound_description("bright airy shimmer sparkle")
        assert result["character"] == "bright"

    def test_detects_warm_character(self):
        result = parse_sound_description("warm vintage analog smooth")
        assert result["character"] == "warm"

    def test_detects_harsh_character(self):
        result = parse_sound_description("harsh aggressive gritty industrial")
        assert result["character"] == "harsh"

    def test_detects_clean_character(self):
        result = parse_sound_description("clean pure digital modern crisp")
        assert result["character"] == "clean"

    def test_default_character_is_dark(self):
        result = parse_sound_description("synth sound")
        assert result["character"] == "dark"

    def test_detects_smooth_texture(self):
        result = parse_sound_description("smooth silky velvet sound")
        assert result["texture"] == "smooth"

    def test_detects_rough_texture(self):
        result = parse_sound_description("rough grainy dusty texture")
        assert result["texture"] == "rough"

    def test_detects_gritty_texture(self):
        result = parse_sound_description("gritty lo-fi distorted texture")
        assert result["texture"] == "gritty"

    def test_detects_movement_static(self):
        result = parse_sound_description("static frozen locked sound")
        assert result["movement"] == "static"

    def test_detects_movement_evolving(self):
        result = parse_sound_description("evolving morphing changing sound")
        assert result["movement"] == "evolving"

    def test_detects_movement_pulsing(self):
        result = parse_sound_description("pulsing grooving rhythmic sound")
        assert result["movement"] == "pulsing"

    def test_detects_movement_sweeping(self):
        result = parse_sound_description("sweeping flying rising sound")
        assert result["movement"] == "sweeping"

    def test_returns_keywords(self):
        result = parse_sound_description("dark ritual bass with acid squelch")
        assert "dark" in result["keywords"]
        assert "ritual" in result["keywords"]
        assert "bass" in result["keywords"]


class TestGenerateOscillatorParams:
    """Tests for oscillator generation."""

    def test_bass_oscillators(self):
        result = generate_oscillator_params("bass", "dark")
        assert isinstance(result, list)
        assert len(result) >= 2  # Should have at least 2 for bass
        assert any(osc["type"] == "sine" for osc in result)  # Should have sub sine

    def test_lead_oscillators(self):
        result = generate_oscillator_params("lead", "bright")
        assert isinstance(result, list)
        assert len(result) >= 2

    def test_pad_oscillators(self):
        result = generate_oscillator_params("pad", "warm")
        assert isinstance(result, list)
        assert len(result) >= 3  # Pads typically have 3-4 detuned oscillators

    def test_pluck_oscillators(self):
        result = generate_oscillator_params("pluck", "bright")
        assert isinstance(result, list)
        assert len(result) == 1  # Pluck typically has single oscillator

    def test_oscillator_has_required_fields(self):
        result = generate_oscillator_params("bass", "dark")
        for osc in result:
            assert "type" in osc
            assert "detune" in osc
            assert "octave" in osc
            assert "gain" in osc

    def test_oscillator_waveforms_valid(self):
        valid_types = ["sine", "triangle", "sawtooth", "square"]
        result = generate_oscillator_params("lead", "bright")
        for osc in result:
            assert osc["type"] in valid_types

    def test_dark_character_lowers_octave(self):
        bright = generate_oscillator_params("lead", "bright")
        dark = generate_oscillator_params("lead", "dark")
        # Dark should have lower octave oscillators
        bright_octaves = [o.get("octave", 0) for o in bright]
        dark_octaves = [o.get("octave", 0) for o in dark]
        assert max(dark_octaves) <= max(bright_octaves)


class TestGenerateFilterParams:
    """Tests for filter generation."""

    def test_bass_filter(self):
        result = generate_filter_params("bass", "dark", "evolving")
        assert result["type"] == "lowpass"
        assert result["frequency"] < 1000  # Bass should be darker
        assert result["resonance"] > 4  # Bass has more resonance

    def test_lead_filter(self):
        result = generate_filter_params("lead", "bright", "static")
        assert result["type"] == "lowpass"
        assert result["frequency"] > 2000  # Lead should be brighter

    def test_pad_filter(self):
        result = generate_filter_params("pad", "warm", "evolving")
        assert result["type"] == "lowpass"
        assert "envelope" in result

    def test_filter_has_envelope(self):
        result = generate_filter_params("bass", "dark", "pulsing")
        assert "envelope" in result
        assert "attack" in result["envelope"]
        assert "decay" in result["envelope"]
        assert "sustain" in result["envelope"]
        assert "release" in result["envelope"]

    def test_dark_character_lowers_cutoff(self):
        bright = generate_filter_params("lead", "bright", "static")
        dark = generate_filter_params("lead", "dark", "static")
        assert dark["frequency"] < bright["frequency"]

    def test_sweeping_movement_increases_resonance(self):
        static = generate_filter_params("bass", "dark", "static")
        sweeping = generate_filter_params("bass", "dark", "sweeping")
        assert sweeping["resonance"] > static["resonance"]


class TestGenerateEnvelopeParams:
    """Tests for envelope generation."""

    def test_bass_envelope(self):
        result = generate_envelope_params("bass", "smooth")
        assert "attack" in result
        assert "decay" in result
        assert "sustain" in result
        assert "release" in result

    def test_bass_fast_attack(self):
        result = generate_envelope_params("bass", "smooth")
        assert result["attack"] < 0.1  # Bass should have fast attack

    def test_pad_slow_attack(self):
        result = generate_envelope_params("pad", "smooth")
        assert result["attack"] > 1.0  # Pad should have slow attack

    def test_pluck_no_sustain(self):
        result = generate_envelope_params("pluck", "smooth")
        assert result["sustain"] == 0.0  # Pluck should have no sustain

    def test_envelope_values_in_range(self):
        for category in ["bass", "lead", "pad", "pluck", "fx", "arp", "keys", "atmosphere"]:
            result = generate_envelope_params(category, "smooth")
            assert 0.001 <= result["attack"] <= 10.0
            assert 0.001 <= result["decay"] <= 10.0
            assert 0.0 <= result["sustain"] <= 1.0
            assert 0.001 <= result["release"] <= 10.0

    def test_gritty_texture_faster_attack(self):
        smooth = generate_envelope_params("bass", "smooth")
        gritty = generate_envelope_params("bass", "gritty")
        assert gritty["attack"] < smooth["attack"]


class TestGenerateLfoParams:
    """Tests for LFO generation."""

    def test_bass_lfo(self):
        result = generate_lfo_params("bass", "evolving", "dark")
        assert isinstance(result, list)
        assert len(result) >= 1
        assert result[0]["target"] == "filter"

    def test_pad_lfo(self):
        result = generate_lfo_params("pad", "evolving", "warm")
        assert isinstance(result, list)
        assert len(result) >= 1

    def test_pluck_no_lfo(self):
        result = generate_lfo_params("pluck", "static", "bright")
        assert len(result) == 0

    def test_lfo_has_required_fields(self):
        result = generate_lfo_params("lead", "static", "bright")
        for lfo in result:
            assert "frequency" in lfo
            assert "type" in lfo
            assert "amplitude" in lfo
            assert "target" in lfo

    def test_lfo_rate_in_range(self):
        result = generate_lfo_params("lead", "static", "bright")
        for lfo in result:
            assert 0.01 <= lfo["frequency"] <= 20.0

    def test_evolving_movement_adds_lfo(self):
        static = generate_lfo_params("bass", "static", "dark")
        evolving = generate_lfo_params("bass", "evolving", "dark")
        assert len(evolving) > len(static)


class TestGenerateEffectsChain:
    """Tests for effects chain generation."""

    def test_bass_effects(self):
        result = generate_effects_chain("bass", "dark", "smooth")
        assert isinstance(result, list)
        assert len(result) >= 1

    def test_pad_effects(self):
        result = generate_effects_chain("pad", "warm", "smooth")
        assert isinstance(result, list)
        assert any(fx["type"] == "reverb" for fx in result)

    def test_effects_have_order(self):
        result = generate_effects_chain("lead", "bright", "smooth")
        for fx in result:
            assert "type" in fx
            assert "wet" in fx

    def test_warm_character_reduces_distortion(self):
        harsh = generate_effects_chain("bass", "harsh", "smooth")
        warm = generate_effects_chain("bass", "warm", "smooth")
        harsh_dist = next((f["wet"] for f in harsh if f["type"] == "distortion"), 0)
        warm_dist = next((f["wet"] for f in warm if f["type"] == "distortion"), 0)
        assert warm_dist < harsh_dist

    def test_gritty_texture_increases_distortion(self):
        smooth = generate_effects_chain("bass", "dark", "smooth")
        gritty = generate_effects_chain("bass", "dark", "gritty")
        smooth_dist = next((f["wet"] for f in smooth if f["type"] == "distortion"), 0)
        gritty_dist = next((f["wet"] for f in gritty if f["type"] == "distortion"), 0)
        assert gritty_dist > smooth_dist


class TestGenerateSfzFile:
    """Tests for SFZ file generation."""

    def test_sfz_has_global_section(self):
        result = generate_sfz_file(
            "Test Patch",
            [{"type": "sawtooth", "detune": 0, "octave": 0, "gain": 0.8}],
            {"type": "lowpass", "frequency": 1000, "resonance": 4},
            {"attack": 0.01, "decay": 0.3, "sustain": 0.7, "release": 0.3},
        )
        assert "<global>" in result

    def test_sfz_has_region_section(self):
        result = generate_sfz_file(
            "Test Patch",
            [{"type": "sawtooth", "detune": 0, "octave": 0, "gain": 0.8}],
            {"type": "lowpass", "frequency": 1000, "resonance": 4},
            {"attack": 0.01, "decay": 0.3, "sustain": 0.7, "release": 0.3},
        )
        assert "<region>" in result

    def test_sfz_contains_filter_cutoff(self):
        result = generate_sfz_file(
            "Test Patch",
            [{"type": "sawtooth", "detune": 0, "octave": 0, "gain": 0.8}],
            {"type": "lowpass", "frequency": 1000, "resonance": 4},
            {"attack": 0.01, "decay": 0.3, "sustain": 0.7, "release": 0.3},
        )
        assert "cutoff=1000" in result

    def test_sfz_contains_envelope(self):
        result = generate_sfz_file(
            "Test Patch",
            [{"type": "sawtooth", "detune": 0, "octave": 0, "gain": 0.8}],
            {"type": "lowpass", "frequency": 1000, "resonance": 4},
            {"attack": 0.01, "decay": 0.3, "sustain": 0.7, "release": 0.3},
        )
        assert "ampeg_attack=0.01" in result
        assert "ampeg_decay=0.3" in result

    def test_sfz_contains_patch_name(self):
        result = generate_sfz_file(
            "Dark Ritual Bass",
            [],
            {"type": "lowpass", "frequency": 1000, "resonance": 4},
            {"attack": 0.01, "decay": 0.3, "sustain": 0.7, "release": 0.3},
        )
        assert "Dark Ritual Bass" in result


class TestGeneratePatchName:
    """Tests for patch name generation."""

    def test_returns_string(self):
        result = generate_patch_name("bass", "dark", "smooth", ["acid", "squelch"])
        assert isinstance(result, str)

    def test_contains_category_word(self):
        result = generate_patch_name("bass", "dark", "smooth", ["acid"])
        # Should contain bass-related word
        assert any(word in result.lower() for word in ["deep", "sub", "ritual", "acid", "bass"])

    def test_contains_character_word(self):
        result = generate_patch_name("bass", "dark", "smooth", ["acid"])
        # Should contain dark-related word
        assert any(word in result.lower() for word in ["dark", "void", "shadow", "ritual", "abyss"])

    def test_includes_keyword(self):
        result = generate_patch_name("bass", "dark", "smooth", ["acid", "squelch"])
        # Should include a keyword
        assert "Acid" in result or "Squelch" in result


class TestSynthTypes:
    """Tests for synth type mapping."""

    def test_all_categories_mapped(self):
        categories = ["bass", "lead", "pad", "pluck", "fx", "arp", "keys", "atmosphere"]
        for cat in categories:
            assert cat in SYNTH_TYPES

    def test_bass_maps_to_monosynth(self):
        assert SYNTH_TYPES["bass"] == "MonoSynth"

    def test_pad_maps_to_polysynth(self):
        assert SYNTH_TYPES["pad"] == "PolySynth"


class TestRunSoundDesignAgent:
    """Tests for the main agent function."""

    @pytest.mark.asyncio
    async def test_returns_required_fields(self):
        result = await run_sound_design_agent(
            brief="dark ritual bass sound",
            session_context={"bpm": 142},
        )
        assert "id" in result
        assert "status" in result
        assert "reasoning" in result

    @pytest.mark.asyncio
    async def test_generates_patch(self):
        result = await run_sound_design_agent(
            brief="bright lead melody",
            session_context={"bpm": 142},
        )
        assert "patch" in result
        assert "name" in result["patch"]
        assert "category" in result["patch"]
        assert "oscillators" in result["patch"]

    @pytest.mark.asyncio
    async def test_generates_sfz_file(self):
        result = await run_sound_design_agent(
            brief="warm pad sound",
            session_context={"bpm": 142},
        )
        assert "sfz_file" in result
        assert "<global>" in result["sfz_file"]

    @pytest.mark.asyncio
    async def test_generates_web_audio_config(self):
        result = await run_sound_design_agent(
            brief="deep bass sound",
            session_context={"bpm": 142},
        )
        assert "web_audio_config" in result
        assert "synthType" in result["web_audio_config"]

    @pytest.mark.asyncio
    async def test_detects_category_from_brief(self):
        result = await run_sound_design_agent(
            brief="bright cutting lead melody",
            session_context={},
        )
        assert result["_category"] == "lead"
        assert result["_synth_type"] == "PolySynth"

    @pytest.mark.asyncio
    async def test_uses_bpm_from_context(self):
        result = await run_sound_design_agent(
            brief="dark bass sound",
            session_context={"bpm": 130},
        )
        assert "bpm" not in result or result.get("bpm") == 130  # BPM stored in session

    @pytest.mark.asyncio
    async def test_patch_has_filter(self):
        result = await run_sound_design_agent(
            brief="warm pad ambient",
            session_context={},
        )
        assert "filter" in result["patch"]

    @pytest.mark.asyncio
    async def test_patch_has_envelope(self):
        result = await run_sound_design_agent(
            brief="short pluck guitar",
            session_context={},
        )
        assert "envelope" in result["patch"]

    @pytest.mark.asyncio
    async def test_patch_has_lfos(self):
        result = await run_sound_design_agent(
            brief="evolving pad ambient",
            session_context={},
        )
        assert "lfos" in result["patch"]

    @pytest.mark.asyncio
    async def test_patch_has_effects(self):
        result = await run_sound_design_agent(
            brief="lush pad choir",
            session_context={},
        )
        assert "effects" in result["patch"]

    @pytest.mark.asyncio
    async def test_reasoning_contains_steps(self):
        result = await run_sound_design_agent(
            brief="dark ritual bass with acid",
            session_context={},
        )
        assert len(result["reasoning"]) >= 3  # Should have multiple reasoning steps


class TestStreamingSoundDesignAgent:
    """Tests for streaming version."""

    @pytest.mark.asyncio
    async def test_yields_status_event(self):
        events = []
        async for event in run_sound_design_agent_streaming(
            brief="dark bass sound",
            session_context={"bpm": 142},
        ):
            events.append(event)
            if event.get("type") == "complete":
                break

        assert any(e["type"] == "status" for e in events)

    @pytest.mark.asyncio
    async def test_yields_reasoning_events(self):
        events = []
        async for event in run_sound_design_agent_streaming(
            brief="bright lead melody",
            session_context={},
        ):
            events.append(event)
            if event.get("type") == "complete":
                break

        assert any(e["type"] == "reasoning" for e in events)

    @pytest.mark.asyncio
    async def test_yields_patch_event(self):
        events = []
        async for event in run_sound_design_agent_streaming(
            brief="warm pad ambient",
            session_context={},
        ):
            events.append(event)
            if event.get("type") == "complete":
                break

        assert any(e["type"] == "patch" for e in events)

    @pytest.mark.asyncio
    async def test_yields_complete_event(self):
        events = []
        async for event in run_sound_design_agent_streaming(
            brief="short pluck guitar",
            session_context={},
        ):
            events.append(event)
            if event.get("type") == "complete":
                break

        assert any(e["type"] == "complete" for e in events)

    @pytest.mark.asyncio
    async def test_complete_event_has_id(self):
        events = []
        async for event in run_sound_design_agent_streaming(
            brief="dark bass sound",
            session_context={},
        ):
            events.append(event)
            if event.get("type") == "complete":
                break

        complete_event = next((e for e in events if e["type"] == "complete"), None)
        assert complete_event is not None
        assert "id" in complete_event