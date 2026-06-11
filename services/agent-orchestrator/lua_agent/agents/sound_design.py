"""SoundDesignAgent — generates pads, textures, and FX automation for electronic music."""

from __future__ import annotations

import random
from typing import Any, Dict, List, Optional, Tuple

from lua_agent.sdk import AgentContext, AgentStatus, BaseAgent, Tool


# Scale interval patterns (semitones from root)
SCALES: Dict[str, List[int]] = {
    "major":            [0, 2, 4, 5, 7, 9, 11],
    "minor":            [0, 2, 3, 5, 7, 8, 10],
    "harmonic_minor":   [0, 2, 3, 5, 7, 8, 11],
    "melodic_minor":    [0, 2, 3, 5, 7, 9, 11],
    "pentatonic_major": [0, 2, 4, 7, 9],
    "pentatonic_minor": [0, 3, 5, 7, 10],
    "blues":            [0, 3, 5, 6, 7, 10],
    "wholetone":        [0, 2, 4, 6, 8, 10],
    "chromatic":        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
}

# Chord intervals (semitones from root)
CHORDS: Dict[str, List[int]] = {
    "maj":       [0, 4, 7],
    "min":       [0, 3, 7],
    "dim":       [0, 3, 6],
    "aug":       [0, 4, 8],
    "maj7":      [0, 4, 7, 11],
    "min7":      [0, 3, 7, 10],
    "dim7":      [0, 3, 6, 9],
    "dom7":      [0, 4, 7, 10],
    "maj9":      [0, 4, 7, 11, 14],
    "min9":      [0, 3, 7, 10, 14],
    "sus2":      [0, 2, 7],
    "sus4":      [0, 5, 7],
    "power":     [0, 7],
    "maj7sus2":  [0, 2, 7, 11],
    "min7sus4":  [0, 5, 7, 10],
}

# Texture type presets
TEXTURES: Dict[str, Dict[str, Any]] = {
    "shimmer":      {"pitch_range": (72, 96), "density": 0.2, "velocity_range": (40, 70), "duration_range": (0.5, 2.0)},
    "drone":        {"pitch_range": (36, 60), "density": 1.0, "velocity_range": (50, 80), "duration_range": (8.0, 16.0)},
    "granular":     {"pitch_range": (48, 84), "density": 0.6, "velocity_range": (30, 60), "duration_range": (0.05, 0.15)},
    "noise":        {"pitch_range": (60, 96), "density": 0.8, "velocity_range": (20, 50), "duration_range": (0.02, 0.08)},
    "swell":        {"pitch_range": (48, 72), "density": 0.15, "velocity_range": (30, 90), "duration_range": (2.0, 6.0)},
    "arp_fragment": {"pitch_range": (60, 84), "density": 0.4, "velocity_range": (50, 80), "duration_range": (0.12, 0.25)},
    "whisper":      {"pitch_range": (72, 108), "density": 0.3, "velocity_range": (15, 35), "duration_range": (0.5, 1.5)},
    "sub":          {"pitch_range": (24, 40), "density": 0.8, "velocity_range": (60, 100), "duration_range": (4.0, 8.0)},
}

# MIDI note name to number helper
NOTE_NAMES = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6,
              "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def note_name_to_midi(name: str) -> int:
    """Convert note name like 'C4' to MIDI number. Returns pitch class if no octave."""
    name = name.strip().capitalize()
    if name and name[-1].isdigit():
        pitch_class = NOTE_NAMES.get(name[:-1], 0)
        octave = int(name[-1])
        return (octave + 1) * 12 + pitch_class
    return NOTE_NAMES.get(name, 0)


class SoundDesignAgent(BaseAgent):
    """Generates pads, textures, and FX automation for electronic music.

    Tools:
      - generate_pad: sustained chord pads with filter sweeps
      - generate_texture: atmospheric textural layers
      - generate_fx_chain: filter/volume/reverb automation
      - generate_full_pattern: complete multi-layer sound design
    """

    def __init__(
        self,
        name: str = "sound_design_agent",
        version: str = "0.1.0",
        description: str = "Generates pads, textures, and FX automation",
    ):
        super().__init__(name, version, description)
        self._key: str = "C"
        self._scale: str = "minor"
        self._bpm: float = 130.0
        self._humanize: float = 0.2
        self._velocity_deviation: int = 5
        self._register_tools()

    def _register_tools(self) -> None:
        for name, info in [
            ("generate_pad", ("Generate sustained chord pad", self.generate_pad)),
            ("generate_texture", ("Generate atmospheric texture", self.generate_texture)),
            ("generate_fx_chain", ("Generate FX automation chain", self.generate_fx_chain)),
            ("generate_full_pattern", ("Generate complete sound design layer", self.generate_full_pattern)),
        ]:
            desc, handler = info
            self.add_tool(Tool(name=name, description=desc, handler=handler))

    # --- Helpers ---

    def _step_time(self, bar: int, step_16th: int) -> float:
        return bar * 4.0 + (step_16th - 1) * 0.25

    def _beat_time(self, bar: int, beat: float) -> float:
        """Convert bar + beat offset to absolute beat time."""
        return bar * 4.0 + beat

    def _humanize_time(self, t: float) -> float:
        if self._humanize > 0:
            return max(0.0, t + random.uniform(-self._humanize * 0.04, self._humanize * 0.04))
        return t

    def _humanize_vel(self, vel: int) -> int:
        if self._velocity_deviation > 0:
            return max(1, min(127, vel + random.randint(-self._velocity_deviation, self._velocity_deviation)))
        return vel

    def _note(self, pitch: int, time: float, velocity: int, duration: float, channel: int = 1) -> Dict[str, Any]:
        return {
            "type": "note_on",
            "pitch": pitch,
            "time": round(time, 4),
            "velocity": self._humanize_vel(velocity),
            "duration": duration,
            "channel": channel,
        }

    def _automation(self, target: str, prop: str, beat: float, value: float, duration: float = 0.0) -> Dict[str, Any]:
        return {
            "type": "automation",
            "target": target,
            "property": prop,
            "beat": round(beat, 4),
            "value": round(value, 4),
            "duration": round(duration, 4),
        }

    def _scale_notes(self, octave: int = 4) -> List[int]:
        """Return MIDI note numbers for the current scale in a given octave."""
        root = note_name_to_midi(f"{self._key}{octave}")
        scale_pattern = SCALES.get(self._scale, SCALES["minor"])
        return [root + interval for interval in scale_pattern if root + interval <= 127]

    def _chord_notes(self, chord_type: str, octave: int = 4, inversions: int = 0) -> List[int]:
        """Return MIDI notes for a chord voicing."""
        root = note_name_to_midi(f"{self._key}{octave}")
        intervals = CHORDS.get(chord_type, CHORDS["maj7"])
        notes = [root + i for i in intervals if root + i <= 127]
        if inversions > 0 and len(notes) > 1:
            for _ in range(inversions % len(notes)):
                notes = [notes[1] - 12] + notes[1:]
        return notes

    def _chord_from_scale_degrees(self, degrees: List[int], octave: int = 4) -> List[int]:
        """Build a chord from scale degrees (1-indexed, e.g. [1, 3, 5, 7] for a maj7)."""
        scale_notes = self._scale_notes(octave)
        result = []
        for d in degrees:
            idx = (d - 1) % len(scale_notes)
            oct_offset = (d - 1) // len(scale_notes)
            pitch = scale_notes[idx] + oct_offset * 12
            if pitch <= 127:
                result.append(pitch)
        return result

    # --- Layer generators ---

    def generate_pad(
        self,
        bars: int = 8,
        chord_type: str = "min7",
        voicing: str = "open",
        octave: int = 3,
        attack: float = 0.5,
        release: float = 2.0,
        velocity: int = 75,
        filter_cutoff: float = 0.7,
        filter_sweep: bool = True,
        volume_swell: bool = False,
        rate: str = "per_bar",
        channel: int = 1,
    ) -> List[Dict[str, Any]]:
        """Generate sustained chord pad.

        Args:
            bars: Number of bars
            chord_type: Chord type (maj, min, maj7, min7, dom7, etc.)
            voicing: open (spread across octaves), close (tight), power (just root+5th)
            octave: Root octave
            attack: Note attack in beats (affects note-on velocity ramp)
            release: Note release in beats
            velocity: Base velocity
            filter_cutoff: Initial filter cutoff (0.0-1.0)
            filter_sweep: Add gradual filter automation
            volume_swell: Add crescendo automation
            rate: Chord change rate — per_bar, per_2bars, per_4bars, static
            channel: MIDI channel
        """
        notes: List[Dict[str, Any]] = []
        automation: List[Dict[str, Any]] = []

        # Figure out chord change interval
        if rate == "per_bar":
            chord_bars = 1
        elif rate == "per_2bars":
            chord_bars = 2
        elif rate == "per_4bars":
            chord_bars = 4
        else:
            chord_bars = bars  # static

        # Determine chord progression (simple: cycle through scale degrees or stay on root)
        degree_cycle = [1, 4, 5, 1, 6, 4, 5, 1]  # common progression
        prog_idx = 0

        for bar_start in range(0, bars, chord_bars):
            section_bars = min(chord_bars, bars - bar_start)

            # Pick chord from degree cycle
            degree = degree_cycle[prog_idx % len(degree_cycle)]
            prog_idx += 1

            chord_notes_raw = self._chord_from_scale_degrees([degree, degree + 2, degree + 4, degree + 6])
            if not chord_notes_raw:
                chord_notes_raw = self._chord_notes(chord_type, octave)

            # Voicing
            if voicing == "open":
                # Spread across multiple octaves
                voiced: List[int] = []
                for i, n in enumerate(chord_notes_raw):
                    offset = i * 12 if i > 0 else 0
                    p = n + offset
                    if p <= 127:
                        voiced.append(p)
                    else:
                        voiced.append(n)
            elif voicing == "power":
                voiced = [chord_notes_raw[0], chord_notes_raw[2]]
            else:
                voiced = chord_notes_raw

            # Create sustained pad notes
            for n in voiced:
                time = self._beat_time(bar_start, attack)  # delayed by attack
                time = self._humanize_time(time)
                dur = section_bars * 4.0 - attack
                vel = velocity
                notes.append(self._note(n, time, vel, dur, channel=channel))

            # Filter sweep automation
            if filter_sweep:
                automation.append(self._automation(
                    target=f"track_{channel}",
                    prop="filter_cutoff",
                    beat=self._beat_time(bar_start, 0.0),
                    value=filter_cutoff,
                ))
                # Sweep up
                automation.append(self._automation(
                    target=f"track_{channel}",
                    prop="filter_cutoff",
                    beat=self._beat_time(bar_start + section_bars, 0.0),
                    value=min(1.0, filter_cutoff + 0.3),
                    duration=section_bars * 4.0,
                ))

            # Volume swell
            if volume_swell:
                automation.append(self._automation(
                    target=f"track_{channel}",
                    prop="volume",
                    beat=self._beat_time(bar_start, 0.0),
                    value=0.0,
                ))
                automation.append(self._automation(
                    target=f"track_{channel}",
                    prop="volume",
                    beat=self._beat_time(bar_start, section_bars * 2.0),
                    value=1.0,
                    duration=section_bars * 2.0,
                ))

        result: List[Dict[str, Any]] = []
        result.extend(notes)
        result.extend(automation)
        return result

    def generate_texture(
        self,
        bars: int = 8,
        texture_type: str = "shimmer",
        density: Optional[float] = None,
        pitch_range: Optional[Tuple[int, int]] = None,
        velocity_range: Optional[Tuple[int, int]] = None,
        channel: int = 2,
    ) -> List[Dict[str, Any]]:
        """Generate atmospheric texture layer.

        Args:
            bars: Number of bars
            texture_type: shimmer, drone, granular, noise, swell, arp_fragment, whisper, sub
            density: Note density (0.0-1.0), None = use texture preset
            pitch_range: (min, max) MIDI notes, None = use texture preset
            velocity_range: (min, max), None = use texture preset
            channel: MIDI channel
        """
        preset = TEXTURES.get(texture_type, TEXTURES["shimmer"])
        density = density if density is not None else preset["density"]
        p_range = pitch_range if pitch_range is not None else preset["pitch_range"]
        v_range = velocity_range if velocity_range is not None else preset["velocity_range"]
        d_range = preset["duration_range"]

        notes: List[Dict[str, Any]] = []

        if texture_type == "drone":
            # Single sustained note or interval
            root = note_name_to_midi(f"{self._key}2") + 12
            for bar in range(bars):
                if bar == 0:
                    dur = bars * 4.0
                    notes.append(self._note(
                        pitch=root,
                        time=self._humanize_time(0.0),
                        velocity=random.randint(v_range[0], v_range[1]),
                        duration=dur,
                        channel=channel,
                    ))
            return notes

        if texture_type == "sub":
            # Deep sub bass drone
            root = note_name_to_midi(f"{self._key}1")
            for bar in range(bars):
                if bar % 2 == 0:
                    dur = min(8.0, bars * 4.0 - bar * 4.0)
                    notes.append(self._note(
                        pitch=root,
                        time=self._humanize_time(self._beat_time(bar, 0.0)),
                        velocity=random.randint(v_range[0], v_range[1]),
                        duration=dur,
                        channel=channel,
                    ))
            return notes

        if texture_type == "granular":
            # Rapid short bursts
            total_beats = bars * 4.0
            t = 0.0
            while t < total_beats:
                if random.random() < density:
                    pitch = random.randint(p_range[0], p_range[1])
                    dur = random.uniform(d_range[0], d_range[1])
                    vel = random.randint(v_range[0], v_range[1])
                    notes.append(self._note(
                        pitch=pitch,
                        time=self._humanize_time(t),
                        velocity=vel,
                        duration=dur,
                        channel=channel,
                    ))
                t += 0.125  # 32nd note grid
            return notes

        if texture_type == "noise":
            # Dense random hits across wide range
            total_beats = bars * 4.0
            t = 0.0
            while t < total_beats:
                for _ in range(3):
                    if random.random() < density * 0.5:
                        pitch = random.randint(p_range[0], p_range[1])
                        dur = random.uniform(d_range[0], d_range[1])
                        vel = random.randint(v_range[0], v_range[1])
                        notes.append(self._note(
                            pitch=pitch,
                            time=self._humanize_time(t + random.uniform(-0.03, 0.03)),
                            velocity=vel,
                            duration=dur,
                            channel=channel,
                        ))
                t += 0.25
            return notes

        # shimmer, swell, arp_fragment, whisper — all use similar pattern
        total_beats = bars * 4.0
        t = 0.0
        beat_step = max(0.125, 1.0 / max(1, density * 4))
        while t < total_beats:
            if random.random() < density:
                pitch = random.randint(p_range[0], p_range[1])
                # Pick notes from scale if possible
                scale_notes = self._scale_notes(octave=5)
                if scale_notes:
                    pitch = random.choice(scale_notes)
                dur = random.uniform(d_range[0], d_range[1])
                # Velocity swell for "swell" texture
                vel = random.randint(v_range[0], v_range[1])
                if texture_type == "swell":
                    # More intense over time
                    phase = t / total_beats
                    vel = int(v_range[0] + (v_range[1] - v_range[0]) * phase)
                notes.append(self._note(
                    pitch=pitch,
                    time=self._humanize_time(t + random.uniform(-0.05, 0.05)),
                    velocity=vel,
                    duration=dur,
                    channel=channel,
                ))
            t += beat_step

        return notes

    def generate_fx_chain(
        self,
        bars: int = 8,
        fx_type: str = "filter_sweep",
        param: str = "filter_cutoff",
        start_value: float = 0.0,
        end_value: float = 1.0,
        target: str = "track_1",
        easing: str = "linear",
    ) -> List[Dict[str, Any]]:
        """Generate FX automation chain.

        Args:
            bars: Number of bars for the automation
            fx_type: filter_sweep, volume_automation, reverb_send, pan_automation, lfo_modulation
            param: Target parameter name
            start_value: Starting parameter value (0.0-1.0)
            end_value: Ending parameter value (0.0-1.0)
            target: Target identifier (e.g. "track_1", "send_1")
            easing: linear, ease_in, ease_out, sine
        """
        actions: List[Dict[str, Any]] = []

        # Map fx_type to param if not specified
        param_map = {
            "filter_sweep": "filter_cutoff",
            "volume_automation": "volume",
            "reverb_send": "reverb_send",
            "pan_automation": "pan",
            "lfo_modulation": "lfo_rate",
        }
        resolved_param = param_map.get(fx_type, param)

        total_beats = bars * 4.0

        if easing == "linear":
            # Two-point automation (start, end)
            actions.append(self._automation(
                target=target,
                prop=resolved_param,
                beat=0.0,
                value=start_value,
            ))
            actions.append(self._automation(
                target=target,
                prop=resolved_param,
                beat=total_beats,
                value=end_value,
                duration=total_beats,
            ))
        elif easing in ("ease_in", "ease_out", "sine"):
            # 4-point curve for smoother transitions
            import math as m
            points = 4
            for i in range(points + 1):
                t = (i / points) * total_beats
                phase = i / points
                if easing == "ease_in":
                    val = start_value + (end_value - start_value) * (phase ** 2)
                elif easing == "ease_out":
                    val = start_value + (end_value - start_value) * (1 - (1 - phase) ** 2)
                elif easing == "sine":
                    val = start_value + (end_value - start_value) * (m.sin(phase * m.pi / 2))
                actions.append(self._automation(
                    target=target,
                    prop=resolved_param,
                    beat=t,
                    value=round(val, 4),
                    duration=total_beats / points if i < points else 0.0,
                ))

        return actions

    def generate_full_pattern(
        self,
        bars: int = 8,
        layers: Optional[List[str]] = None,
        chord_type: str = "min7",
        texture_type: str = "shimmer",
        fx_type: str = "filter_sweep",
    ) -> List[Dict[str, Any]]:
        """Generate complete sound design layer (pad + texture + FX).

        Args:
            bars: Number of bars
            layers: Which layers to include, e.g. ["pad", "texture", "fx"] (default: all)
            chord_type: Chord type for pad
            texture_type: Texture type
            fx_type: FX automation type
        """
        has_pad = layers is None or "pad" in layers
        has_texture = layers is None or "texture" in layers
        has_fx = layers is None or "fx" in layers

        result: List[Dict[str, Any]] = []
        if has_pad:
            result.extend(self.generate_pad(bars=bars, chord_type=chord_type))
        if has_texture:
            result.extend(self.generate_texture(bars=bars, texture_type=texture_type))
        if has_fx:
            result.extend(self.generate_fx_chain(bars=bars, fx_type=fx_type))

        result.sort(key=lambda a: a.get("time", a.get("beat", 0)))
        return result

    def set_key(self, key: str = "C", scale: str = "minor", bpm: float = 130.0) -> Dict[str, Any]:
        """Set musical key and scale.

        Args:
            key: Note name (C, C#, D, etc.)
            scale: Scale pattern (major, minor, harmonic_minor, pentatonic_*, blues, etc.)
            bpm: Beats per minute
        """
        self._key = key.upper().replace("_", "#")
        self._scale = scale.lower()
        self._bpm = float(bpm)
        return {"type": "agent_status", "agent": self._name, "status": f"key={key}, scale={scale}, bpm={bpm}"}

    # --- Lifecycle ---

    def on_init(self, ctx: AgentContext) -> None:
        self._status = AgentStatus.IDLE
        if ctx.key:
            self._key = ctx.key
        if ctx.bpm:
            self._bpm = ctx.bpm
        genre_scale_map = {
            "techno": "minor", "psytrance": "minor", "house": "major",
            "drum_and_bass": "minor", "hip_hop": "minor", "lo_fi": "major",
        }
        self._scale = genre_scale_map.get(ctx.genre.lower().replace(" ", "_"), self._scale)

    def run(self, ctx: Optional[AgentContext] = None) -> List[Dict[str, Any]]:
        self._status = AgentStatus.RUNNING
        if ctx is not None:
            self.on_init(ctx)
        result = self.generate_full_pattern(bars=8)
        self._status = AgentStatus.COMPLETED
        return result
