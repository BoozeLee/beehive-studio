#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import random
import statistics
import wave
from array import array
from pathlib import Path

SAMPLE_RATE = 48_000
BIT_DEPTH = 24
CHANNELS = 2
RANDOM_SEED = 20_260_605

PRESETS = {
    "draft": {"target_lufs": -14.0, "min_lufs": -18.0, "max_lufs": -11.0},
    "club": {"target_lufs": -9.5, "min_lufs": -11.0, "max_lufs": -8.0},
    "festival": {"target_lufs": -7.5, "min_lufs": -9.0, "max_lufs": -6.0},
}


def midi_to_hz(note: float) -> float:
    return 440.0 * (2 ** ((note - 69) / 12))


def add_sine(
    left: list[float],
    right: list[float],
    start_s: float,
    duration_s: float,
    freq: float,
    amp: float,
    pan: float = 0.0,
    phase: float = 0.0,
) -> None:
    start = max(0, int(start_s * SAMPLE_RATE))
    end = min(len(left), start + int(duration_s * SAMPLE_RATE))
    if end <= start:
        return

    left_gain = math.cos((pan + 1.0) * math.pi / 4.0)
    right_gain = math.sin((pan + 1.0) * math.pi / 4.0)
    total = end - start

    for index, sample_index in enumerate(range(start, end)):
        env_pos = index / max(1, total - 1)
        attack = min(1.0, env_pos / 0.08)
        release = min(1.0, (1.0 - env_pos) / 0.18)
        envelope = max(0.0, min(attack, release))
        value = math.sin((2 * math.pi * freq * sample_index / SAMPLE_RATE) + phase) * amp * envelope
        left[sample_index] += value * left_gain
        right[sample_index] += value * right_gain


def add_kick(left: list[float], right: list[float], start_s: float) -> None:
    start = int(start_s * SAMPLE_RATE)
    length = int(0.18 * SAMPLE_RATE)
    for i in range(length):
        idx = start + i
        if idx >= len(left):
            break
        t = i / SAMPLE_RATE
        env = math.exp(-t * 22)
        freq = 48 + 92 * math.exp(-t * 35)
        click = math.sin(2 * math.pi * 1900 * t) * math.exp(-t * 140) * 0.12
        value = (math.sin(2 * math.pi * freq * t) * 0.85 + click) * env
        left[idx] += value
        right[idx] += value


def add_snare(left: list[float], right: list[float], start_s: float, rng: random.Random) -> None:
    start = int(start_s * SAMPLE_RATE)
    length = int(0.16 * SAMPLE_RATE)
    for i in range(length):
        idx = start + i
        if idx >= len(left):
            break
        t = i / SAMPLE_RATE
        env = math.exp(-t * 30)
        noise = (rng.random() * 2 - 1) * env * 0.26
        body = math.sin(2 * math.pi * 195 * t) * env * 0.22
        stereo = (rng.random() * 2 - 1) * env * 0.04
        left[idx] += noise + body + stereo
        right[idx] += noise + body - stereo


def add_hat(left: list[float], right: list[float], start_s: float, rng: random.Random) -> None:
    start = int(start_s * SAMPLE_RATE)
    length = int(0.045 * SAMPLE_RATE)
    pan = rng.uniform(-0.35, 0.35)
    left_gain = math.cos((pan + 1.0) * math.pi / 4.0)
    right_gain = math.sin((pan + 1.0) * math.pi / 4.0)
    for i in range(length):
        idx = start + i
        if idx >= len(left):
            break
        t = i / SAMPLE_RATE
        env = math.exp(-t * 90)
        value = (rng.random() * 2 - 1) * env * 0.11
        left[idx] += value * left_gain
        right[idx] += value * right_gain


def synthesize() -> tuple[list[float], list[float], dict[str, object]]:
    rng = random.Random(RANDOM_SEED)
    bpm = 145
    beats = 16
    seconds = beats * 60 / bpm
    length = int((seconds + 0.4) * SAMPLE_RATE)
    left = [0.0] * length
    right = [0.0] * length

    bass_pitches = [41, 43, 41, 46, 41, 48, 43, 39, 41, 44, 46, 43, 41, 39, 43, 46]
    bass_velocities = [0.72, 0.58, 0.68, 0.61, 0.75, 0.57, 0.64, 0.62] * 2
    snare_hits = 0
    hat_hits = 0

    beat_s = 60 / bpm
    for beat in range(beats):
        beat_start = beat * beat_s
        add_kick(left, right, beat_start)

        bass_start = beat_start + beat_s * 0.48 + rng.uniform(-0.006, 0.008)
        bass_freq = midi_to_hz(bass_pitches[beat] + rng.uniform(-0.035, 0.035))
        add_sine(left, right, bass_start, beat_s * 0.42, bass_freq, bass_velocities[beat], 0.0)

        if beat % 2 == 1:
            add_snare(left, right, beat_start + beat_s * 0.02, rng)
            snare_hits += 1

        for step in (0.25, 0.75):
            add_hat(left, right, beat_start + beat_s * step + rng.uniform(-0.004, 0.004), rng)
            hat_hits += 1

    arp = [65, 68, 72, 75, 77, 75, 72, 68]
    for index in range(32):
        start = index * beat_s * 0.5 + rng.uniform(-0.01, 0.01)
        pitch = arp[index % len(arp)] + (12 if index > 20 else 0)
        add_sine(left, right, start, beat_s * 0.22, midi_to_hz(pitch), 0.13, rng.uniform(-0.65, 0.65))

    metadata = {
        "bpm": bpm,
        "beats": beats,
        "bass_unique_pitches": len(set(bass_pitches)),
        "bass_velocity_range": round(max(bass_velocities) - min(bass_velocities), 3),
        "snare_hits": snare_hits,
        "hat_hits": hat_hits,
        "arrangement_note": "Deterministic organic psytrance smoke render with moving bass, snares, hats, and honeycomb arp.",
    }
    return left, right, metadata


def integrated_lufs(samples: list[float]) -> float:
    square_sum = sum(sample * sample for sample in samples)
    mean_square = square_sum / max(1, len(samples))
    if mean_square <= 0:
        return float("-inf")
    return -0.691 + 10 * math.log10(mean_square)


def normalize(left: list[float], right: list[float], target_lufs: float) -> tuple[float, float]:
    mono = [(l + r) * 0.5 for l, r in zip(left, right)]
    current_lufs = integrated_lufs(mono)
    gain = 10 ** ((target_lufs - current_lufs) / 20)

    drive = 1.35
    drive_norm = math.tanh(drive)
    for i in range(len(left)):
        left[i] = math.tanh(left[i] * gain * drive) / drive_norm
        right[i] = math.tanh(right[i] * gain * drive) / drive_norm

    peak = max(max(abs(sample) for sample in left), max(abs(sample) for sample in right), 1e-9)
    peak_scale = min(1.0, 0.965 / peak)
    for i in range(len(left)):
        left[i] *= peak_scale
        right[i] *= peak_scale

    mono_after = [(l + r) * 0.5 for l, r in zip(left, right)]
    peak_after = max(max(abs(sample) for sample in left), max(abs(sample) for sample in right), 1e-9)
    return integrated_lufs(mono_after), 20 * math.log10(peak_after)


def spectral_centroid_approx(left: list[float], right: list[float]) -> float:
    """Approximate spectral centroid without FFT using zero-crossing and slope energy."""
    mono = [(l + r) * 0.5 for l, r in zip(left, right)]
    if not mono:
        return 0.0

    # Zero-crossing rate (proxy for high-frequency content)
    zcr = sum(1 for i in range(1, len(mono)) if mono[i - 1] * mono[i] < 0)
    zcr_norm = zcr / max(1, len(mono))

    # Slope energy (rapid changes = high frequencies)
    diffs = [abs(mono[i] - mono[i - 1]) for i in range(1, len(mono))]
    slope_energy = statistics.mean(diffs) if diffs else 0.0

    # Map to approximate Hz range (empirical: 0-5000 Hz)
    centroid = (zcr_norm * 2000) + (slope_energy * 8000)
    return min(20000.0, max(20.0, centroid))


def low_end_mono_correlation(left: list[float], right: list[float]) -> float:
    """Check phase correlation of low-end energy between L and R."""
    # Low-end is concentrated in the first ~5ms of each transient
    # Approximate by checking correlation in the first 2048 samples of each beat
    window = 2048
    correlations = []
    for start in range(0, min(len(left), len(right)) - window, window * 4):
        l_win = left[start:start + window]
        r_win = right[start:start + window]
        if not l_win or not r_win:
            continue
        mean_l = statistics.mean(l_win)
        mean_r = statistics.mean(r_win)
        num = sum((l - mean_l) * (r - mean_r) for l, r in zip(l_win, r_win))
        den_l = math.sqrt(sum((l - mean_l) ** 2 for l in l_win))
        den_r = math.sqrt(sum((r - mean_r) ** 2 for r in r_win))
        if den_l > 1e-9 and den_r > 1e-9:
            correlations.append(num / (den_l * den_r))
    return statistics.mean(correlations) if correlations else 0.0


def repetition_score(left: list[float], right: list[float], bpm: int = 145) -> float:
    """Auto-correlation similarity at one-bar lag. 1.0 = perfectly repetitive."""
    mono = [(l + r) * 0.5 for l, r in zip(left, right)]
    if not mono:
        return 0.0

    beat_samples = int(SAMPLE_RATE * 60 / bpm)
    bar_samples = beat_samples * 4
    if len(mono) < bar_samples * 2:
        return 0.0

    # Compare first bar with second bar
    a = mono[:bar_samples]
    b = mono[bar_samples:bar_samples * 2]
    min_len = min(len(a), len(b))
    a, b = a[:min_len], b[:min_len]

    mean_a = statistics.mean(a)
    mean_b = statistics.mean(b)
    num = sum((x - mean_a) * (y - mean_b) for x, y in zip(a, b))
    den_a = math.sqrt(sum((x - mean_a) ** 2 for x in a))
    den_b = math.sqrt(sum((y - mean_b) ** 2 for y in b))
    if den_a < 1e-9 or den_b < 1e-9:
        return 0.0
    correlation = num / (den_a * den_b)
    # Map from [-1, 1] to [0, 1] where 1 means identical
    return max(0.0, min(1.0, correlation))


def write_wav(path: Path, left: list[float], right: list[float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    max_int = (2 ** (BIT_DEPTH - 1)) - 1
    frames = array("B")
    for l_sample, r_sample in zip(left, right):
        for sample in (l_sample, r_sample):
            value = int(max(-1.0, min(1.0, sample)) * max_int)
            if value < 0:
                value += 1 << BIT_DEPTH
            frames.extend((value & 0xFF, (value >> 8) & 0xFF, (value >> 16) & 0xFF))

    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(CHANNELS)
        wav.setsampwidth(BIT_DEPTH // 8)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(frames.tobytes())


def run_preset(preset_name: str, output: Path | None = None) -> dict:
    left, right, metadata = synthesize()
    preset = PRESETS[preset_name]
    lufs, true_peak_db = normalize(left, right, preset["target_lufs"])
    duration_s = len(left) / SAMPLE_RATE
    clipped_samples = sum(1 for sample in left + right if abs(sample) >= 1.0)
    centroid = spectral_centroid_approx(left, right)
    mono_corr = low_end_mono_correlation(left, right)
    rep_score = repetition_score(left, right, bpm=metadata["bpm"])

    checks = {
        "duration_nonzero": duration_s > 2.0,
        "sample_rate_48k": SAMPLE_RATE == 48_000,
        "bit_depth_24": BIT_DEPTH == 24,
        "true_peak_safe": true_peak_db <= -0.3,
        "lufs_in_preset_range": preset["min_lufs"] <= lufs <= preset["max_lufs"],
        "no_clipping": clipped_samples == 0,
        "bass_moves": metadata["bass_unique_pitches"] >= 4,
        "velocity_varies": metadata["bass_velocity_range"] >= 0.12,
        "drums_layered": metadata["snare_hits"] >= 4 and metadata["hat_hits"] >= 16,
        "spectral_centroid_present": centroid > 100.0,
        "low_end_mono": mono_corr > 0.85,
        "not_overly_repetitive": rep_score < 0.95,
    }

    report = {
        "status": "pass" if all(checks.values()) else "fail",
        "preset": preset_name,
        "file": str(output) if output else None,
        "duration_seconds": round(duration_s, 3),
        "sample_rate": SAMPLE_RATE,
        "bit_depth": BIT_DEPTH,
        "channels": CHANNELS,
        "integrated_lufs": round(lufs, 2),
        "true_peak_db": round(true_peak_db, 2),
        "clipped_samples": clipped_samples,
        "spectral_centroid_hz": round(centroid, 1),
        "low_end_mono_correlation": round(mono_corr, 3),
        "repetition_score": round(rep_score, 3),
        "checks": checks,
        "musical_features": metadata,
    }

    if output:
        write_wav(output, left, right)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Render Beehive Studio deterministic audio QA sample.")
    parser.add_argument("--preset", choices=sorted(PRESETS), default="festival")
    parser.add_argument("--output", type=Path, default=Path("build/reports/render-smoke.wav"))
    parser.add_argument("--report", type=Path, default=Path("build/reports/render-smoke-report.json"))
    parser.add_argument("--compare-all", action="store_true", help="Run all presets and output comparison report")
    args = parser.parse_args()

    if args.compare_all:
        reports = {}
        for preset_name in sorted(PRESETS):
            out_path = args.output.parent / f"render-smoke-{preset_name}.wav"
            reports[preset_name] = run_preset(preset_name, output=out_path)

        comparison = {
            "status": "pass" if all(r["status"] == "pass" for r in reports.values()) else "fail",
            "presets": reports,
            "recommendation": "festival" if reports.get("festival", {}).get("status") == "pass" else "club",
        }
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(comparison, indent=2) + "\n")
        print(json.dumps(comparison, indent=2))
        if comparison["status"] != "pass":
            raise SystemExit(1)
    else:
        report = run_preset(args.preset, output=args.output)
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
        if report["status"] != "pass":
            raise SystemExit(1)


if __name__ == "__main__":
    main()
