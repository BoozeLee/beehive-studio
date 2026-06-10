"""
Sound Design Agent — Synth patch generation from text descriptions.

Generates JSON synth patches that map to Tone.js synthesizers:
- FMSynth, AMSynth: FM synthesis for rich harmonics
- MonoSynth, PolySynth: Classic oscillator + filter + envelope
- MembraneSynth: Kick drum / bass drum sounds
- MetalSynth: Metallic sounds (cymbals, bells)
- PluckSynth: Karplus-Strong algorithm (guitar, harp)
- NoiseSynth: Noise-based (hi-hats, snares, FX)

Output: JSON patch parameters + optional SFZ for DAW compatibility.
"""

from __future__ import annotations

import uuid
import random
from typing import Any

# ─────────────────────────────────────────────────────────────
# Synth Types (map to Tone.js)
# ─────────────────────────────────────────────────────────────

SYNTH_TYPES = {
    "bass": "MonoSynth",
    "lead": "PolySynth",
    "pad": "PolySynth",
    "pluck": "PluckSynth",
    "fx": "FMSynth",
    "arp": "PolySynth",
    "keys": "FMSynth",
    "atmosphere": "PolySynth",
}

OSCILLATOR_WAVEFORMS = ["sine", "triangle", "sawtooth", "square"]
FILTER_TYPES = ["lowpass", "highpass", "bandpass", "notch"]
LFO_WAVEFORMS = ["sine", "triangle", "sawtooth", "square", "random"]

# ─────────────────────────────────────────────────────────────
# Brief Parsing
# ─────────────────────────────────────────────────────────────


def parse_sound_description(brief: str) -> dict[str, Any]:
    """
    Extract sound characteristics from brief text.

    Returns:
        {
            "category": "bass|lead|pad|pluck|fx|arp|keys|atmosphere",
            "character": "dark|bright|warm|harsh|clean",
            "texture": "smooth|rough|gritty|soft",
            "movement": "static|evolving|pulsing|sweeping",
            "keywords": [...],
        }
    """
    brief_lower = brief.lower()
    keywords = brief_lower.split()

    # Detect category
    category = _detect_category(brief_lower, keywords)

    # Detect character
    character = _detect_character(brief_lower)

    # Detect texture
    texture = _detect_texture(brief_lower)

    # Detect movement
    movement = _detect_movement(brief_lower)

    return {
        "category": category,
        "character": character,
        "texture": texture,
        "movement": movement,
        "keywords": keywords,
    }


def _detect_category(brief: str, keywords: list[str]) -> str:
    """Detect synth category from brief."""
    # Priority order for keyword matching
    category_keywords = {
        "bass": ["bass", "sub", "low", "rumble", "wobble", "808", "reese", "deep"],
        "lead": ["lead", "melody", "solo", "cutting", "bright", "sharp"],
        "pad": ["pad", "warm", "lush", "evolving", "ambient", "choir", "string"],
        "pluck": ["pluck", "short", "percussive", "attack", "guitar", "harp", "harp"],
        "fx": ["fx", "effect", "riser", "sweep", "noise", "impact", "burst", "downlifter"],
        "arp": ["arp", "arpeggio", "sequence", "pattern", "rhythmic"],
        "keys": ["keys", "piano", "electric", "organ", "rhodes", "wurlitzer"],
        "atmosphere": ["atmosphere", "texture", "drone", "space", "ethereal", "cinematic"],
    }

    for cat, kws in category_keywords.items():
        if any(kw in brief for kw in kws):
            return cat

    return "bass"  # Default


def _detect_character(brief: str) -> str:
    """Detect character (tonality) from brief."""
    if any(k in brief for k in ["dark", "deep", "ritual", "underground", "moody", "gloomy"]):
        return "dark"
    if any(k in brief for k in ["bright", "light", "airy", "shimmer", "sparkle", "glass"]):
        return "bright"
    if any(k in brief for k in ["warm", "analog", "vintage", "soft", "smooth"]):
        return "warm"
    if any(k in brief for k in ["harsh", "aggressive", "distorted", "gritty", "industrial", "harsh"]):
        return "harsh"
    if any(k in brief for k in ["clean", "pure", "digital", "modern", "crisp"]):
        return "clean"
    return "dark"  # Default to dark for ritual music


def _detect_texture(brief: str) -> str:
    """Detect texture from brief."""
    if any(k in brief for k in ["smooth", "soft", "silky", "velvet"]):
        return "smooth"
    if any(k in brief for k in ["rough", "grainy", "dusty"]):
        return "rough"
    if any(k in brief for k in ["gritty", "broken", "lo-fi", "distorted"]):
        return "gritty"
    if any(k in brief for k in ["soft", "gentle", "delicate", "feather"]):
        return "soft"
    return "smooth"


def _detect_movement(brief: str) -> str:
    """Detect movement style from brief."""
    if any(k in brief for k in ["static", "frozen", "still", "locked"]):
        return "static"
    if any(k in brief for k in ["evolving", "morphing", "changing", "dynamic"]):
        return "evolving"
    if any(k in brief for k in ["pulsing", "rhythmic", "grooving", "shaking"]):
        return "pulsing"
    if any(k in brief for k in ["sweeping", "flying", "rising", "falling"]):
        return "sweeping"
    return "evolving"


# ─────────────────────────────────────────────────────────────
# Oscillator Generation
# ─────────────────────────────────────────────────────────────


def generate_oscillator_params(
    category: str,
    character: str,
) -> list[dict[str, Any]]:
    """
    Generate oscillator configuration for the synth.

    Returns list of oscillators:
    [
        {
            "type": "sawtooth|square|sine|triangle",
            "detune": -50 to +50 (cents),
            "octave": -2 to +2,
            "gain": 0.0 to 1.0,
        }
    ]
    """
    # Oscillator templates by category
    templates = {
        "bass": [
            {"type": "sawtooth", "detune": -5, "octave": 0, "gain": 0.7},
            {"type": "sawtooth", "detune": 5, "octave": 0, "gain": 0.5},
            {"type": "sine", "detune": 0, "octave": -1, "gain": 0.4},  # Sub
        ],
        "lead": [
            {"type": "sawtooth", "detune": -7, "octave": 0, "gain": 0.6},
            {"type": "sawtooth", "detune": 7, "octave": 0, "gain": 0.6},
            {"type": "square", "detune": 0, "octave": 1, "gain": 0.3},
        ],
        "pad": [
            {"type": "sawtooth", "detune": -12, "octave": 0, "gain": 0.4},
            {"type": "sawtooth", "detune": 0, "octave": 0, "gain": 0.5},
            {"type": "sawtooth", "detune": 12, "octave": 0, "gain": 0.4},
            {"type": "triangle", "detune": 0, "octave": 1, "gain": 0.2},
        ],
        "pluck": [
            {"type": "sawtooth", "detune": 0, "octave": 0, "gain": 0.8},
        ],
        "fx": [
            {"type": "sine", "detune": 0, "octave": 0, "gain": 0.6},
            {"type": "square", "detune": 3, "octave": 1, "gain": 0.4},
        ],
        "arp": [
            {"type": "square", "detune": 0, "octave": 0, "gain": 0.6},
            {"type": "square", "detune": 0, "octave": 1, "gain": 0.4},
        ],
        "keys": [
            {"type": "sine", "detune": 0, "octave": 0, "gain": 0.5},
            {"type": "triangle", "detune": 0, "octave": 1, "gain": 0.3},
        ],
        "atmosphere": [
            {"type": "sawtooth", "detune": -8, "octave": 0, "gain": 0.4},
            {"type": "sawtooth", "detune": 8, "octave": 0, "gain": 0.4},
            {"type": "sine", "detune": 0, "octave": -1, "gain": 0.3},
        ],
    }

    oscillators = templates.get(category, templates["bass"]).copy()

    # Adjust based on character
    if character == "dark":
        # Lower octave for darker sound
        for osc in oscillators:
            if osc["octave"] >= 0:
                osc["octave"] = max(-2, osc["octave"] - 1)
    elif character == "bright":
        # Higher detune for shimmer
        for osc in oscillators:
            if osc["type"] in ["sawtooth", "square"]:
                osc["detune"] += 5

    return oscillators


# ─────────────────────────────────────────────────────────────
# Filter Generation
# ─────────────────────────────────────────────────────────────


def generate_filter_params(
    category: str,
    character: str,
    movement: str,
) -> dict[str, Any]:
    """
    Generate filter configuration.

    Returns:
        {
            "type": "lowpass|highpass|bandpass|notch",
            "frequency": 20 to 20000 (Hz),
            "rolloff": -12|-24|-48,
            "resonance": 0 to 20,
            "envelope": {
                "attack": 0.001 to 10.0,
                "decay": 0.001 to 10.0,
                "sustain": 0.0 to 1.0,
                "release": 0.001 to 10.0,
                "baseFrequency": 20 to 20000,
                "octaves": 1 to 8,
            }
        }
    """
    # Base filter parameters by category
    base_params = {
        "bass": {
            "type": "lowpass",
            "frequency": 300,
            "rolloff": -24,
            "resonance": 6,
            "env_amount": 4000,
            "env_attack": 0.01,
            "env_decay": 0.4,
            "env_sustain": 0.3,
            "env_release": 0.2,
            "env_base": 100,
            "env_octaves": 4,
        },
        "lead": {
            "type": "lowpass",
            "frequency": 3000,
            "rolloff": -24,
            "resonance": 4,
            "env_amount": 2000,
            "env_attack": 0.01,
            "env_decay": 0.3,
            "env_sustain": 0.5,
            "env_release": 0.2,
            "env_base": 500,
            "env_octaves": 3,
        },
        "pad": {
            "type": "lowpass",
            "frequency": 2500,
            "rolloff": -12,
            "resonance": 2,
            "env_amount": 1500,
            "env_attack": 1.0,
            "env_decay": 1.5,
            "env_sustain": 0.6,
            "env_release": 2.5,
            "env_base": 300,
            "env_octaves": 3,
        },
        "pluck": {
            "type": "lowpass",
            "frequency": 6000,
            "rolloff": -24,
            "resonance": 5,
            "env_amount": 6000,
            "env_attack": 0.001,
            "env_decay": 0.5,
            "env_sustain": 0.0,
            "env_release": 0.3,
            "env_base": 2000,
            "env_octaves": 5,
        },
        "fx": {
            "type": "lowpass",
            "frequency": 1500,
            "rolloff": -24,
            "resonance": 8,
            "env_amount": 5000,
            "env_attack": 0.5,
            "env_decay": 1.0,
            "env_sustain": 0.4,
            "env_release": 0.5,
            "env_base": 500,
            "env_octaves": 4,
        },
        "arp": {
            "type": "lowpass",
            "frequency": 3500,
            "rolloff": -24,
            "resonance": 3,
            "env_amount": 2500,
            "env_attack": 0.01,
            "env_decay": 0.4,
            "env_sustain": 0.4,
            "env_release": 0.25,
            "env_base": 600,
            "env_octaves": 3,
        },
        "keys": {
            "type": "lowpass",
            "frequency": 4000,
            "rolloff": -12,
            "resonance": 2,
            "env_amount": 1000,
            "env_attack": 0.005,
            "env_decay": 1.2,
            "env_sustain": 0.3,
            "env_release": 0.5,
            "env_base": 800,
            "env_octaves": 2,
        },
        "atmosphere": {
            "type": "lowpass",
            "frequency": 2000,
            "rolloff": -12,
            "resonance": 3,
            "env_amount": 2000,
            "env_attack": 2.0,
            "env_decay": 2.0,
            "env_sustain": 0.5,
            "env_release": 3.0,
            "env_base": 200,
            "env_octaves": 4,
        },
    }

    params = base_params.get(category, base_params["bass"]).copy()

    # Adjust based on character
    if character == "dark":
        params["frequency"] = int(params["frequency"] * 0.6)
        params["resonance"] += 2
    elif character == "bright":
        params["frequency"] = int(params["frequency"] * 1.5)
        params["resonance"] = max(1, params["resonance"] - 1)

    # Adjust based on movement
    if movement == "sweeping":
        params["env_amount"] = int(params["env_amount"] * 1.5)
        params["resonance"] += 2

    # Build envelope dict
    envelope = {
        "attack": params.pop("env_attack"),
        "decay": params.pop("env_decay"),
        "sustain": params.pop("env_sustain"),
        "release": params.pop("env_release"),
        "baseFrequency": params.pop("env_base"),
        "octaves": params.pop("env_octaves"),
    }
    params["envelope"] = envelope

    return params


# ─────────────────────────────────────────────────────────────
# Envelope Generation
# ─────────────────────────────────────────────────────────────


def generate_envelope_params(
    category: str,
    texture: str,
) -> dict[str, Any]:
    """
    Generate amplitude envelope configuration.

    Returns:
        {
            "attack": 0.001 to 10.0 (seconds),
            "decay": 0.001 to 10.0,
            "sustain": 0.0 to 1.0,
            "release": 0.001 to 10.0,
        }
    """
    # Envelope templates by category
    templates = {
        "bass": {"attack": 0.005, "decay": 0.3, "sustain": 0.7, "release": 0.1},
        "lead": {"attack": 0.01, "decay": 0.2, "sustain": 0.8, "release": 0.2},
        "pad": {"attack": 1.5, "decay": 2.0, "sustain": 0.8, "release": 3.0},
        "pluck": {"attack": 0.001, "decay": 0.5, "sustain": 0.0, "release": 0.3},
        "fx": {"attack": 2.0, "decay": 1.0, "sustain": 0.5, "release": 0.5},
        "arp": {"attack": 0.01, "decay": 0.3, "sustain": 0.6, "release": 0.2},
        "keys": {"attack": 0.005, "decay": 1.5, "sustain": 0.4, "release": 0.5},
        "atmosphere": {"attack": 3.0, "decay": 2.0, "sustain": 0.7, "release": 4.0},
    }

    envelope = templates.get(category, templates["bass"]).copy()

    # Adjust based on texture
    if texture == "smooth":
        # Smoother, slower attack
        envelope["attack"] = min(10.0, envelope["attack"] * 1.5)
    elif texture == "gritty":
        # Faster, punchier
        envelope["attack"] = max(0.001, envelope["attack"] * 0.5)
        envelope["decay"] = max(0.01, envelope["decay"] * 0.7)

    return envelope


# ─────────────────────────────────────────────────────────────
# LFO Generation
# ─────────────────────────────────────────────────────────────


def generate_lfo_params(
    category: str,
    movement: str,
    character: str,
) -> list[dict[str, Any]]:
    """
    Generate LFO modulation configuration.

    Returns list of LFOs:
    [
        {
            "frequency": 0.01 to 20.0 (Hz),
            "type": "sine|triangle|sawtooth|square",
            "amplitude": 0.0 to 1.0,
            "target": "filter|pitch|amplitude",
            "min": ...,
            "max": ...,
        }
    ]
    """
    # LFO templates by category
    templates = {
        "bass": [
            {"frequency": 0.5, "type": "sine", "amplitude": 0.3, "target": "filter", "min": 100, "max": 600},
        ],
        "lead": [
            {"frequency": 5.0, "type": "sine", "amplitude": 0.15, "target": "pitch", "min": -10, "max": 10},
            {"frequency": 3.0, "type": "sine", "amplitude": 0.1, "target": "filter", "min": 2000, "max": 4000},
        ],
        "pad": [
            {"frequency": 0.3, "type": "sine", "amplitude": 0.4, "target": "filter", "min": 500, "max": 3000},
        ],
        "pluck": [],  # No LFO for plucks
        "fx": [
            {"frequency": 0.2, "type": "sine", "amplitude": 0.6, "target": "pitch", "min": -24, "max": 24},
        ],
        "arp": [
            {"frequency": 6.0, "type": "square", "amplitude": 0.7, "target": "amplitude", "min": 0, "max": 1},
        ],
        "keys": [
            {"frequency": 4.5, "type": "sine", "amplitude": 0.15, "target": "amplitude", "min": 0.8, "max": 1.0},
        ],
        "atmosphere": [
            {"frequency": 0.15, "type": "sine", "amplitude": 0.5, "target": "filter", "min": 300, "max": 2500},
            {"frequency": 0.1, "type": "sine", "amplitude": 0.3, "target": "pitch", "min": -5, "max": 5},
        ],
    }

    lfos = templates.get(category, templates["bass"]).copy()

    # Add more LFO for evolving movement
    if movement == "evolving" and len(lfos) < 3:
        lfos.append({
            "frequency": 0.1,
            "type": "sine",
            "amplitude": 0.2,
            "target": "filter",
            "min": 200,
            "max": 2000,
        })

    # Adjust based on character
    if character == "harsh":
        for lfo in lfos:
            lfo["amplitude"] = min(1.0, lfo["amplitude"] * 1.3)

    return lfos


# ─────────────────────────────────────────────────────────────
# Effects Chain Generation
# ─────────────────────────────────────────────────────────────


def generate_effects_chain(
    category: str,
    character: str,
    texture: str,
) -> list[dict[str, Any]]:
    """
    Generate effects chain configuration.

    Returns list of effects:
    [
        {
            "type": "reverb|delay|distortion|chorus|phaser|compressor",
            "wet": 0.0 to 1.0,
            "params": {...},
        }
    ]
    """
    # Base effects by category
    templates = {
        "bass": [
            {"type": "distortion", "wet": 0.15, "params": {"distortion": 0.4}},
            {"type": "compressor", "wet": 1.0, "params": {"threshold": -20, "ratio": 4}},
        ],
        "lead": [
            {"type": "delay", "wet": 0.2, "params": {"delayTime": "8n", "feedback": 0.3}},
            {"type": "reverb", "wet": 0.25, "params": {"decay": 2, "wet": 0.3}},
        ],
        "pad": [
            {"type": "reverb", "wet": 0.4, "params": {"decay": 4, "wet": 0.5}},
            {"type": "chorus", "wet": 0.15, "params": {"frequency": 1.5, "delayTime": 3.5, "depth": 0.7}},
        ],
        "pluck": [
            {"type": "reverb", "wet": 0.2, "params": {"decay": 1.5, "wet": 0.3}},
            {"type": "delay", "wet": 0.15, "params": {"delayTime": "8n", "feedback": 0.2}},
        ],
        "fx": [
            {"type": "reverb", "wet": 0.5, "params": {"decay": 6, "wet": 0.6}},
            {"type": "delay", "wet": 0.3, "params": {"delayTime": "4n", "feedback": 0.4}},
        ],
        "arp": [
            {"type": "delay", "wet": 0.25, "params": {"delayTime": "8n", "feedback": 0.35}},
            {"type": "reverb", "wet": 0.15, "params": {"decay": 1.5, "wet": 0.2}},
        ],
        "keys": [
            {"type": "reverb", "wet": 0.3, "params": {"decay": 2.5, "wet": 0.4}},
            {"type": "chorus", "wet": 0.1, "params": {"frequency": 1.0, "delayTime": 4, "depth": 0.5}},
        ],
        "atmosphere": [
            {"type": "reverb", "wet": 0.6, "params": {"decay": 8, "wet": 0.7}},
            {"type": "delay", "wet": 0.2, "params": {"delayTime": "4n", "feedback": 0.3}},
        ],
    }

    effects = templates.get(category, templates["pad"]).copy()

    # Adjust based on character
    if character == "warm":
        # Reduce harsh effects
        for fx in effects:
            if fx["type"] == "distortion":
                fx["wet"] = 0.05
    elif character == "harsh":
        # Increase distortion
        for fx in effects:
            if fx["type"] == "distortion":
                fx["wet"] = 0.4
                fx["params"]["distortion"] = 0.6

    # Adjust based on texture
    if texture == "gritty":
        for fx in effects:
            if fx["type"] == "distortion":
                fx["wet"] = min(0.8, fx["wet"] * 2)

    return effects


# ─────────────────────────────────────────────────────────────
# Patch Name Generation (LLM-enhanced)
# ─────────────────────────────────────────────────────────────


def generate_patch_name(category: str, character: str, texture: str, keywords: list[str]) -> str:
    """
    Generate a creative patch name based on characteristics.

    Combines category, character, and keywords into a evocative name.
    """
    # Prefix templates by category
    prefixes = {
        "bass": ["Deep", "Sub", "Ritual", "Dark", "Acid", "Wobble", "Rolling", "Thumping"],
        "lead": ["Sharp", "Cutting", "Slicing", "Crystal", "Biting", "Screaming", "Serpent"],
        "pad": ["Ethereal", "Lush", "Celestial", "Dream", "Void", "Ambient", "Airy"],
        "pluck": ["Pluck", "String", "Picked", "Strum", "Bouncy", "Staccato"],
        "fx": ["Riser", "Impact", "Sweep", "Noise", "Drone", "Chaos", "Glitch"],
        "arp": ["Sequence", "Pattern", "Pulse", "Step", "Arp", "Chase"],
        "keys": ["Rhodes", "Keys", "Electric", "Warm", "Vintage", "Bell"],
        "atmosphere": ["Atmos", "Texture", "Void", "Space", "Ethereal", "Nebula"],
    }

    # Suffix templates by character
    suffixes = {
        "dark": ["Dark", "Void", "Shadow", "Ritual", "Abyss"],
        "bright": ["Shine", "Sparkle", "Light", "Glass", "Crystal"],
        "warm": ["Warm", "Vintage", "Cozy", "Analog", "Soft"],
        "harsh": ["Harsh", "Grind", "Break", "Riot", "Chaos"],
        "clean": ["Pure", "Clean", "Clear", "Sharp", "Ice"],
    }

    prefixes_list = prefixes.get(category, ["Synth"])
    suffixes_list = suffixes.get(character, ["Synth"])

    # Filter out any keywords that match category/character
    noise_words = ["sound", "synth", "synthesizer", "patch", "preset", "make", "generate"]
    filtered_keywords = [k for k in keywords if k not in noise_words and len(k) > 2]

    # Build name
    parts = []

    # Add a prefix
    parts.append(random.choice(prefixes_list))

    # Add keyword if meaningful
    if filtered_keywords:
        parts.append(filtered_keywords[0].capitalize())

    # Add suffix
    parts.append(random.choice(suffixes_list))

    return " ".join(parts)


# ─────────────────────────────────────────────────────────────
# SFZ Generation (for DAW compatibility)
# ─────────────────────────────────────────────────────────────


def generate_sfz_file(
    patch_name: str,
    oscillators: list[dict[str, Any]],
    filter_params: dict[str, Any],
    envelope_params: dict[str, Any],
) -> str:
    """
    Generate SFZ preset file content.

    Note: SFZ is sample-based, so this generates a template
    with placeholder sample references. The actual synthesis
    happens via Web Audio, but SFZ provides DAW compatibility.
    """
    sfz = f"""// {patch_name}
// Generated by Beehive Studio Sound Design Agent
// Note: This is a parameter template. Actual synthesis via Web Audio.

<global>
amplitude_oncc1=0.5

// Filter
fil_type={filter_params.get('type', 'lpf_2p')}
cutoff={filter_params.get('frequency', 1000)}
resonance={filter_params.get('resonance', 4)}

// Amplitude Envelope
ampeg_attack={envelope_params.get('attack', 0.01)}
ampeg_decay={envelope_params.get('decay', 0.3)}
ampeg_sustain={envelope_params.get('sustain', 0.7)}
ampeg_release={envelope_params.get('release', 0.3)}

// Filter Envelope
fileg_attack={filter_params.get('envelope', {}).get('attack', 0.01)}
fileg_decay={filter_params.get('envelope', {}).get('decay', 0.3)}
fileg_sustain={filter_params.get('envelope', {}).get('sustain', 0.4)}
fileg_release={filter_params.get('envelope', {}).get('release', 0.2)}
fileg_depth={filter_params.get('envelope', {}).get('baseFrequency', 1000)}

"""

    # Add oscillator regions
    for i, osc in enumerate(oscillators):
        sample_ref = f"waveform_{osc.get('type', 'sawtooth')}.wav"
        pitch_key = 60 + (osc.get("octave", 0) * 12)
        detune = osc.get("detune", 0)

        sfz += f"""// Oscillator {i+1}: {osc.get('type', 'sawtooth')}
<region>
sample={sample_ref}
pitch_keycenter={pitch_key}
tune={detune}
amp={osc.get('gain', 0.8)}

"""

    return sfz


# ─────────────────────────────────────────────────────────────
# Main Agent Function
# ─────────────────────────────────────────────────────────────


async def run_sound_design_agent(
    brief: str,
    session_context: dict[str, Any] | None = None,
) -> dict:
    """
    Generate synth patch from text description.

    Args:
        brief: Description of desired sound
        session_context: BPM and other parameters

    Returns:
        {
            "id": "uuid",
            "status": "completed",
            "reasoning": [...],
            "patch": {
                "name": "Dark Ritual Bass",
                "category": "bass",
                "synth_type": "MonoSynth",
                "oscillators": [...],
                "filter": {...},
                "envelope": {...},
                "lfos": [...],
                "effects": [...]
            },
            "sfz_file": "...",  # SFZ content as string
            "web_audio_config": {...},  # Direct Tone.js config
        }
    """
    reasoning = []
    session_context = session_context or {}

    # Parse the brief
    parsed = parse_sound_description(brief)
    category = parsed["category"]
    character = parsed["character"]
    texture = parsed["texture"]
    movement = parsed["movement"]
    keywords = parsed["keywords"]

    reasoning.append(f"Detected category: {category}")
    reasoning.append(f"Character: {character}, Texture: {texture}, Movement: {movement}")

    # Generate patch components
    oscillators = generate_oscillator_params(category, character)
    reasoning.append(f"Generated {len(oscillators)} oscillator(s)")

    filter_params = generate_filter_params(category, character, movement)
    reasoning.append(f"Filter: {filter_params['type']} @ {filter_params['frequency']}Hz")

    envelope_params = generate_envelope_params(category, texture)
    reasoning.append(f"Envelope: A={envelope_params['attack']:.3f}, D={envelope_params['decay']:.2f}, S={envelope_params['sustain']:.1f}, R={envelope_params['release']:.2f}")

    lfos = generate_lfo_params(category, movement, character)
    reasoning.append(f"Generated {len(lfos)} LFO(s)")

    effects = generate_effects_chain(category, character, texture)
    reasoning.append(f"Effects chain: {[fx['type'] for fx in effects]}")

    # Generate patch name
    patch_name = generate_patch_name(category, character, texture, keywords)
    reasoning.append(f"Patch name: {patch_name}")

    # Get synth type for this category
    synth_type = SYNTH_TYPES.get(category, "PolySynth")

    # Build patch
    patch = {
        "name": patch_name,
        "category": category,
        "synth_type": synth_type,
        "oscillators": oscillators,
        "filter": filter_params,
        "envelope": envelope_params,
        "lfos": lfos,
        "effects": effects,
    }

    # Generate SFZ file
    sfz_file = generate_sfz_file(
        patch_name=patch_name,
        oscillators=oscillators,
        filter_params=filter_params,
        envelope_params=envelope_params,
    )

    # Build Web Audio config (Tone.js compatible)
    web_audio_config = {
        "synthType": synth_type,
        "oscillator": {
            "type": oscillators[0]["type"] if oscillators else "sawtooth",
            "count": len(oscillators),
        },
        "envelope": envelope_params,
        "filter": {
            "type": filter_params["type"],
            "frequency": filter_params["frequency"],
            "rolloff": filter_params["rolloff"],
            "Q": filter_params["resonance"],
            "envelope": filter_params["envelope"],
        },
        "lfos": lfos,
        "effects": effects,
    }

    return {
        "id": str(uuid.uuid4()),
        "status": "completed",
        "reasoning": reasoning,
        "patch": patch,
        "sfz_file": sfz_file,
        "web_audio_config": web_audio_config,
        "_synth_type": synth_type,
        "_category": category,
    }


async def run_sound_design_agent_streaming(
    brief: str,
    session_context: dict[str, Any] | None = None,
):
    """
    Streaming version of the Sound Design agent.
    Yields events: status, reasoning, patch, complete
    """
    session_context = session_context or {}

    yield {"type": "status", "message": "Analyzing sound description..."}

    result = await run_sound_design_agent(
        brief=brief,
        session_context=session_context,
    )

    for reasoning_line in result["reasoning"]:
        yield {"type": "reasoning", "text": reasoning_line}

    yield {
        "type": "patch",
        "name": result["patch"]["name"],
        "category": result["_category"],
        "synth_type": result["_synth_type"],
    }

    yield {
        "type": "complete",
        "id": result["id"],
        "name": result["patch"]["name"],
        "category": result["_category"],
        "synth_type": result["_synth_type"],
    }