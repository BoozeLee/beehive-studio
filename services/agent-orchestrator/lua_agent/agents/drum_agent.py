"""DrumProgrammingAgent — generates drum patterns across multiple genres."""

from __future__ import annotations

import random
from typing import Any, Dict, List, Optional

from lua_agent.sdk import AgentContext, AgentStatus, BaseAgent, Tool


# General MIDI drum note mapping
GM_KICK = 36
GM_SNARE = 38
GM_CLAP = 39
GM_HAT_CLOSED = 42
GM_HAT_OPEN = 46
GM_HAT_PEDAL = 44
GM_RIDE = 51
GM_CRASH = 49
GM_SPLASH = 55
GM_CHINA = 52
GM_TOM_HI = 50
GM_TOM_MID = 47
GM_TOM_LO = 45
GM_SHAKER = 70
GM_TAMBOURINE = 54
GM_COWBELL = 56
GM_CLAVES = 75
GM_RIMSHOT = 37
GM_CONGA_HI = 62
GM_CONGA_MID = 63
GM_CONGA_LO = 64
GM_BONGO_HI = 60
GM_BONGO_LO = 61


# Genre pattern templates: each entry is (step_within_16, velocity_min, velocity_max)
# 16 steps = 1 bar of 16th notes
GENRE_PATTERNS: Dict[str, Dict[str, List]] = {
    "techno": {
        "kick": [(1, 110, 127), (9, 95, 115)],
        "snare": [(5, 100, 115), (13, 100, 115)],
        "clap": [(5, 80, 95), (13, 80, 95)],
        "hat_closed": [(s, 55, 75) for s in range(1, 17)],
        "hat_open": [(5, 45, 60), (13, 45, 60)],
        "ride": [(1, 60, 75)],
        "crash": [(1, 80, 100), (9, 70, 90)],
    },
    "psytrance": {
        "kick": [(1, 115, 127), (9, 100, 115)],
        "clap": [(5, 90, 105), (13, 90, 105)],
        "snare": [],
        "hat_closed": [(s, 60, 80) if s % 2 == 1 else (s, 50, 65) for s in range(1, 17)],
        "hat_open": [(3, 50, 65), (7, 50, 65), (11, 50, 65), (15, 50, 65)],
        "ride": [],
        "crash": [(1, 75, 95)],
        "shaker": [(s, 30, 45) for s in range(1, 17)],
    },
    "house": {
        "kick": [(1, 110, 125), (11, 90, 110)],
        "snare": [(5, 95, 115), (13, 95, 115)],
        "clap": [],
        "hat_closed": [(s, 50, 70) for s in range(1, 17)],
        "hat_open": [(5, 40, 55), (13, 40, 55)],
        "ride": [(1, 55, 70)],
        "crash": [(1, 80, 100)],
        "shaker": [],
    },
    "drum_and_bass": {
        "kick": [(1, 115, 127), (7, 90, 110), (11, 95, 115)],
        "snare": [(5, 100, 120), (13, 100, 120)],
        "clap": [(5, 80, 95), (13, 80, 95)],
        "hat_closed": [(s, 60, 80) if s % 2 == 1 else (s, 50, 65) for s in range(1, 17)],
        "hat_open": [(7, 45, 60), (15, 45, 60)],
        "ride": [],
        "crash": [(1, 80, 100)],
    },
    "hip_hop": {
        "kick": [(1, 110, 127), (7, 90, 110), (11, 85, 105)],
        "snare": [(5, 95, 115), (13, 85, 105)],
        "clap": [(5, 85, 100)],
        "hat_closed": [(s, 50, 75) for s in [1, 3, 4, 6, 7, 9, 11, 12, 14, 15, 16]],
        "hat_open": [(5, 40, 55), (13, 35, 50)],
        "ride": [],
        "crash": [(1, 70, 90)],
    },
    "lo_fi": {
        "kick": [(1, 100, 115), (11, 85, 100)],
        "snare": [(5, 85, 105)],
        "clap": [],
        "hat_closed": [(s, 40, 60) for s in range(1, 17) if s not in (3, 7, 11, 15)],
        "hat_open": [(3, 35, 50), (7, 35, 50), (11, 35, 50), (15, 35, 50)],
        "ride": [],
        "crash": [],
        "shaker": [],
    },
}


class DrumProgrammingAgent(BaseAgent):
    """Generates drum/percussion patterns across genres.

    Tools:
      - generate_kick: four-on-the-floor or syncopated kick patterns
      - generate_snare: snare/clap backbeat patterns
      - generate_hihat: closed/open hi-hat patterns
      - generate_percussion: toms, shaker, ride, crash patterns
      - generate_full_pattern: complete multi-layer drum pattern
      - set_genre: switch genre template
      - add_fill: add a drum fill at a specified bar
    """

    MIDI_MAP = {
        "kick": GM_KICK,
        "snare": GM_SNARE,
        "clap": GM_CLAP,
        "hat_closed": GM_HAT_CLOSED,
        "hat_open": GM_HAT_OPEN,
        "hat_pedal": GM_HAT_PEDAL,
        "ride": GM_RIDE,
        "crash": GM_CRASH,
        "splash": GM_SPLASH,
        "china": GM_CHINA,
        "tom_hi": GM_TOM_HI,
        "tom_mid": GM_TOM_MID,
        "tom_lo": GM_TOM_LO,
        "shaker": GM_SHAKER,
        "tambourine": GM_TAMBOURINE,
        "cowbell": GM_COWBELL,
        "rimshot": GM_RIMSHOT,
    }

    def __init__(
        self,
        name: str = "drum_agent",
        version: str = "0.2.0",
        description: str = "Generates drum/percussion patterns across genres",
    ):
        super().__init__(name, version, description)
        self._genre: str = "techno"
        self._bpm: float = 130.0
        self._swing: float = 0.0
        self._humanize: float = 0.3
        self._velocity_deviation: int = 5
        self._register_tools()

    def _register_tools(self) -> None:
        for name, info in [
            ("generate_kick", ("Generate kick drum pattern", self.generate_kick)),
            ("generate_snare", ("Generate snare/clap pattern", self.generate_snare)),
            ("generate_hihat", ("Generate hi-hat pattern (closed + open)", self.generate_hihat)),
            ("generate_percussion", ("Generate percussion layer", self.generate_percussion)),
            ("generate_full_pattern", ("Generate complete multi-layer drum pattern", self.generate_full_pattern)),
            ("set_genre", ("Switch genre template", self.set_genre)),
            ("add_fill", ("Add drum fill at specified bar", self.add_fill)),
        ]:
            desc, handler = info
            self.add_tool(Tool(name=name, description=desc, handler=handler))

    # --- Parameter helpers ---

    def _step_time(self, bar: int, step_16th: int) -> float:
        """Convert bar + 16th-step (1-indexed) to beat time."""
        return bar * 4.0 + (step_16th - 1) * 0.25

    def _apply_swing(self, step_16th: int, beat_time: float) -> float:
        """Apply swing offset to off-beat 16th steps."""
        if self._swing > 0 and step_16th % 2 == 0:
            return beat_time + (self._swing * 0.12)
        return beat_time

    def _humanize_time(self, time: float) -> float:
        """Add micro-timing variation."""
        if self._humanize > 0:
            max_offset = self._humanize * 0.04
            time = time + random.uniform(-max_offset, max_offset)
            return max(0.0, time)
        return time

    def _humanize_velocity(self, vel: int) -> int:
        """Add velocity variation."""
        if self._velocity_deviation > 0:
            delta = random.randint(-self._velocity_deviation, self._velocity_deviation)
            return max(1, min(127, vel + delta))
        return vel

    def _make_note(self, pitch: int, time: float, velocity: int, duration: float = 0.25, channel: int = 0) -> Dict[str, Any]:
        """Create a note action dict."""
        return {
            "type": "note_on",
            "pitch": pitch,
            "time": round(time, 4),
            "velocity": self._humanize_velocity(velocity),
            "duration": duration,
            "channel": channel,
        }

    def _steps_from_pattern(self, pattern: Optional[List[int]], genre_key: str) -> List[int]:
        """Get 16th-step positions from explicit pattern or genre default.

        Args:
            pattern: Explicit list of steps (1-16), or None for genre default
            genre_key: Key into GENRE_PATTERNS[self._genre]
        """
        if pattern is not None:
            return pattern
        return [p[0] for p in GENRE_PATTERNS[self._genre].get(genre_key, [])]

    def set_genre(self, genre: str = "techno", bpm: float = 130.0, swing: float = 0.0, humanize: float = 0.3) -> Dict[str, Any]:
        """Switch genre template.

        Args:
            genre: One of techno, psytrance, house, drum_and_bass, hip_hop, lo_fi
            bpm: Beats per minute
            swing: Swing amount (0.0 - 1.0)
            humanize: Humanization amount (0.0 - 1.0)
        """
        genre = genre.lower().replace(" ", "_").replace("-", "_")
        if genre not in GENRE_PATTERNS:
            raise ValueError(f"Unknown genre '{genre}'. Available: {list(GENRE_PATTERNS.keys())}")
        self._genre = genre
        self._bpm = float(bpm)
        self._swing = max(0.0, min(1.0, float(swing)))
        self._humanize = max(0.0, min(1.0, float(humanize)))
        return {"type": "agent_status", "agent": self._name, "status": f"genre={genre}, bpm={bpm}"}

    # --- Layer generators ---

    def generate_kick(
        self,
        bars: int = 8,
        pattern: Optional[List[int]] = None,
        velocity_range: tuple = (100, 120),
        accent_every: int = 4,
    ) -> List[Dict[str, Any]]:
        """Generate kick drum pattern.

        Args:
            bars: Number of bars
            pattern: 16th-step positions (1-indexed, default from genre template)
            velocity_range: (min_velocity, max_velocity)
            accent_every: Accent on first beat every N bars
        """
        notes: List[Dict[str, Any]] = []
        steps = self._steps_from_pattern(pattern, "kick")
        vel_min, vel_max = velocity_range

        for bar in range(bars):
            for step in steps:
                beat_time = self._apply_swing(step, self._step_time(bar, step))
                beat_time = self._humanize_time(beat_time)
                vel = random.randint(vel_min, vel_max)
                # Accent on first beat
                if bar % accent_every == 0 and step == 1:
                    vel = min(127, vel + 15)
                notes.append(self._make_note(GM_KICK, beat_time, vel, duration=0.35))

        return notes

    def generate_snare(
        self,
        bars: int = 8,
        pattern: Optional[List[int]] = None,
        velocity_range: tuple = (90, 115),
        use_clap: bool = True,
        clap_only: bool = False,
    ) -> List[Dict[str, Any]]:
        """Generate snare/clap pattern.

        Args:
            bars: Number of bars
            pattern: 16th-step positions (default from genre template)
            velocity_range: (min, max)
            use_clap: Add clap layer alongside snare
            clap_only: Use only clap (no snare)
        """
        notes: List[Dict[str, Any]] = []
        snare_steps = self._steps_from_pattern(pattern, "snare")
        clap_steps = self._steps_from_pattern(None, "clap")
        vel_min, vel_max = velocity_range

        for bar in range(bars):
            for step in snare_steps:
                if clap_only:
                    continue
                beat_time = self._apply_swing(step, self._step_time(bar, step))
                beat_time = self._humanize_time(beat_time)
                vel = random.randint(vel_min, vel_max)
                if step == 5:
                    vel = min(127, vel + 10)  # accent backbeat
                pitch = GM_SNARE
                dur = 0.15
                notes.append(self._make_note(pitch, beat_time, vel, duration=dur))

            if use_clap or clap_only:
                for step in clap_steps:
                    beat_time = self._apply_swing(step, self._step_time(bar, step))
                    beat_time = self._humanize_time(beat_time)
                    vel = random.randint(vel_min - 10, vel_max - 5)
                    notes.append(self._make_note(GM_CLAP, beat_time, vel, duration=0.08))

        return notes

    def generate_hihat(
        self,
        bars: int = 8,
        closed_pattern: Optional[List[int]] = None,
        open_pattern: Optional[List[int]] = None,
        closed_velocity_range: tuple = (50, 75),
        open_velocity_range: tuple = (40, 60),
        open_duration: float = 0.12,
    ) -> List[Dict[str, Any]]:
        """Generate hi-hat pattern (closed + open).

        Args:
            bars: Number of bars
            closed_pattern: 16th-step positions for closed hats
            open_pattern: 16th-step positions for open hats
            closed_velocity_range: (min, max) for closed hats
            open_velocity_range: (min, max) for open hats
            open_duration: Duration of open hat in beats
        """
        notes: List[Dict[str, Any]] = []
        closed_steps = self._steps_from_pattern(closed_pattern, "hat_closed")
        open_steps = self._steps_from_pattern(open_pattern, "hat_open")

        for bar in range(bars):
            for step in closed_steps:
                beat_time = self._apply_swing(step, self._step_time(bar, step))
                beat_time = self._humanize_time(beat_time)
                vel = random.randint(closed_velocity_range[0], closed_velocity_range[1])
                notes.append(self._make_note(GM_HAT_CLOSED, beat_time, vel, duration=0.03))

            for step in open_steps:
                beat_time = self._apply_swing(step, self._step_time(bar, step))
                beat_time = self._humanize_time(beat_time)
                vel = random.randint(open_velocity_range[0], open_velocity_range[1])
                notes.append(self._make_note(GM_HAT_OPEN, beat_time, vel, duration=open_duration))

        return notes

    def generate_percussion(
        self,
        bars: int = 8,
        shaker: bool = True,
        ride: bool = False,
        crash: bool = False,
        toms: bool = False,
    ) -> List[Dict[str, Any]]:
        """Generate auxiliary percussion layers.

        Args:
            bars: Number of bars
            shaker: Add shaker on 16th notes
            ride: Add ride cymbal pattern
            crash: Add crash accents
            toms: Add tom fills at transition points
        """
        notes: List[Dict[str, Any]] = []

        # Shaker
        if shaker:
            shaker_steps = [p[0] for p in GENRE_PATTERNS[self._genre].get("shaker", [(s, 30, 45) for s in range(1, 17)])]
            for bar in range(bars):
                for step in shaker_steps:
                    beat_time = self._step_time(bar, step)
                    beat_time = self._humanize_time(beat_time)
                    vel = random.randint(20, 40)
                    notes.append(self._make_note(GM_SHAKER, beat_time, vel, duration=0.04))

        # Ride
        if ride:
            ride_steps = [p[0] for p in GENRE_PATTERNS[self._genre].get("ride", [(1, 55, 70)])]
            for bar in range(bars):
                for step in ride_steps:
                    beat_time = self._step_time(bar, step)
                    beat_time = self._humanize_time(beat_time)
                    vel = random.randint(55, 75)
                    notes.append(self._make_note(GM_RIDE, beat_time, vel, duration=0.5))

        # Crash
        if crash:
            crash_steps = [p[0] for p in GENRE_PATTERNS[self._genre].get("crash", [(1, 75, 95)])]
            for bar in range(bars):
                for step in crash_steps:
                    if bar % 4 == 0 or bar == 0:
                        beat_time = self._step_time(bar, step)
                        beat_time = self._humanize_time(beat_time)
                        vel = random.randint(75, 95)
                        notes.append(self._make_note(GM_CRASH, beat_time, vel, duration=0.3))

        # Tom fills
        if toms:
            for bar in range(bars):
                if bar > 0 and bar % 8 == 0:
                    for step in range(9, 17):
                        beat_time = self._step_time(bar, step)
                        beat_time = self._humanize_time(beat_time)
                        pitch = [GM_TOM_LO, GM_TOM_LO, GM_TOM_MID, GM_TOM_MID, GM_TOM_HI, GM_TOM_HI, GM_TOM_MID, GM_TOM_MID][step - 9]
                        vel = 60 + step * 2
                        notes.append(self._make_note(pitch, beat_time, vel, duration=0.08))

        return notes

    def generate_full_pattern(
        self,
        bars: int = 8,
        genre: Optional[str] = None,
        bpm: Optional[float] = None,
        layers: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """Generate a complete multi-layer drum pattern.

        Args:
            bars: Number of bars
            genre: Genre override (default: current genre)
            bpm: BPM override (default: current BPM)
            layers: Which layers to include, e.g. ["kick", "snare", "hihat", "percussion"]
                    (default: all layers for the genre)
        """
        if genre:
            self._genre = genre.lower().replace(" ", "_").replace("-", "_")
            if self._genre not in GENRE_PATTERNS:
                raise ValueError(f"Unknown genre '{genre}'")
        if bpm:
            self._bpm = bpm

        # Categorize layers
        has_kick = layers is None or "kick" in layers
        has_snare = layers is None or "snare" in layers or "clap" in layers
        has_hihat = layers is None or "hihat" in layers or "hat" in layers
        has_perc = layers is None or "percussion" in layers or "perc" in layers

        all_notes: List[Dict[str, Any]] = []
        if has_kick:
            all_notes.extend(self.generate_kick(bars=bars))
        if has_snare:
            all_notes.extend(self.generate_snare(bars=bars))
        if has_hihat:
            all_notes.extend(self.generate_hihat(bars=bars))
        if has_perc:
            all_notes.extend(self.generate_percussion(bars=bars, shaker=True, crash=True))

        all_notes.sort(key=lambda n: n["time"])
        return all_notes

    def add_fill(
        self,
        bar: int = 8,
        bars: int = 1,
        style: str = "tom",
        density: float = 0.8,
    ) -> List[Dict[str, Any]]:
        """Add a drum fill at specified bar.

        Args:
            bar: Starting bar for the fill
            bars: Length of fill in bars
            style: Fill style — "tom", "snare_roll", "kick_pattern", "random"
            density: Note density (0.0 - 1.0)
        """
        notes: List[Dict[str, Any]] = []

        for fill_bar in range(bar, bar + bars):
            for step in range(1, 17):
                if random.random() > density:
                    continue

                beat_time = self._step_time(fill_bar, step)
                beat_time = self._humanize_time(beat_time)

                if style == "tom":
                    pitch = [GM_TOM_LO, GM_TOM_MID, GM_TOM_HI, GM_TOM_MID][step % 4]
                    vel = random.randint(65, 100)
                    dur = 0.1
                elif style == "snare_roll":
                    pitch = GM_SNARE
                    vel = random.randint(40, 90)
                    dur = 0.05
                elif style == "kick_pattern":
                    pitch = GM_KICK
                    vel = random.randint(60, 115)
                    dur = 0.2
                else:  # random
                    pitch = random.choice([GM_KICK, GM_SNARE, GM_TOM_HI, GM_TOM_MID, GM_TOM_LO, GM_CRASH])
                    vel = random.randint(50, 110)
                    dur = 0.12

                notes.append(self._make_note(pitch, beat_time, vel, duration=dur))

        return notes

    # --- Agent lifecycle ---

    def on_init(self, ctx: AgentContext) -> None:
        self._status = AgentStatus.IDLE
        if ctx.genre:
            try:
                self.set_genre(genre=ctx.genre, bpm=ctx.bpm)
            except ValueError:
                pass

    def run(self, ctx: Optional[AgentContext] = None) -> List[Dict[str, Any]]:
        self._status = AgentStatus.RUNNING
        if ctx is not None:
            self.on_init(ctx)
        result = self.generate_full_pattern(bars=8)
        self._status = AgentStatus.COMPLETED
        return result
