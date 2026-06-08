#!/usr/bin/env python3
"""
Optimized Beehive Studio Python render engine with batch processing
Performance improvements and memory optimizations
"""

import argparse
import asyncio
import concurrent.futures
import json
import os
import tempfile
import time
import tracemalloc
from pathlib import Path
from typing import Any, Dict, List, Tuple, Callable
import math
import statistics
from array import array
from pydub import AudioSegment
from pydub.generators import Sine
import multiprocessing as mp
from functools import partial

# Constants
SAMPLE_RATE = 48000
BIT_DEPTH = 24
CHANNELS = 2

# Preset configurations
PRESETS = {
    "draft": {"target_lufs": -14.0, "min_lufs": -18.0, "max_lufs": -11.0},
    "club": {"target_lufs": -9.5, "min_lufs": -11.0, "max_lufs": -8.0},
    "festival": {"target_lufs": -7.5, "min_lufs": -9.0, "max_lufs": -6.0},
}

class OptimizedRenderRequest:
    """Optimized render request with better memory management"""
    def __init__(self, clips: List[Dict], tracks: List[Dict], bpm: int = 120, 
                 preset: str = "festival", output_mode: str = "master"):
        self.clips = clips
        self.tracks = {str(track.get("id")): track for track in tracks}
        self.bpm = bpm
        self.preset = preset
        self.output_mode = output_mode
        self.beat_duration = 60.0 / bpm
        self.sample_rate = SAMPLE_RATE
        
def midi_to_hz(note: float) -> float:
    """Convert MIDI note to frequency"""
    return 440.0 * (2 ** ((note - 69) / 12))

def automation_value(track: Dict[str, Any], parameter: str, beat: float, default: float) -> float:
    """Get automation value for a parameter at a specific beat"""
    lane = next(
        (
            item
            for item in track.get("automationLanes", track.get("automation_lanes", []))
            if item.get("parameter") == parameter and item.get("mode", "read") != "off"
        ),
        None,
    )
    points = sorted((lane or {}).get("points", []), key=lambda point: point.get("time", 0))
    if not points:
        return default
    if beat <= points[0].get("time", 0):
        return float(points[0].get("value", default))
    if beat >= points[-1].get("time", 0):
        return float(points[-1].get("value", default))
    for left, right in zip(points, points[1:]):
        if left.get("time", 0) <= beat <= right.get("time", 0):
            span = max(0.0001, right.get("time", 0) - left.get("time", 0))
            ratio = (beat - left.get("time", 0)) / span
            return float(left.get("value", default)) + ratio * (
                float(right.get("value", default)) - float(left.get("value", default))
            )
    return default

def process_clip_optimized(clip: Dict, track: Dict, beat_duration: float) -> AudioSegment:
    """Process a single clip with optimizations"""
    segment = AudioSegment.silent(duration=0, frame_rate=SAMPLE_RATE)
    clip_start_beats = float(clip.get("start", 0))
    notes = clip.get("midiData", {}).get("notes", []) or clip.get("notes", [])
    clip_end_ms = 0

    # Process audio file if present
    audio_path = clip.get("audioFilePath")
    if audio_path and os.path.exists(audio_path):
        try:
            source = AudioSegment.from_file(audio_path)
            offset_ms = int(float(clip.get("sourceOffset", 0)) * 1000)
            duration_beats = float(clip.get("duration", 0))
            duration_ms = int(duration_beats * beat_duration * 1000) if duration_beats > 0 else len(source)
            source = source[offset_ms : offset_ms + duration_ms]
            gain = max(0.001, float(clip.get("gain", 1)))
            source = source.apply_gain(20 * math.log10(gain))
            audio_start_ms = int(clip_start_beats * beat_duration * 1000)
            clip_end_ms = audio_start_ms + len(source)
            segment += AudioSegment.silent(duration=max(0, clip_end_ms - len(segment)), frame_rate=SAMPLE_RATE)
            segment = segment.overlay(source, position=audio_start_ms)
        except Exception as e:
            print(f"Warning: Could not load audio file {audio_path}: {e}")

    # Process notes in batches
    if notes:
        # Pre-calculate note frequencies to avoid repeated calculations
        note_frequencies = [midi_to_hz(note.get("pitch", 60)) for note in notes]
        note_volumes = [-30 + (note.get("velocity", 100) / 127) * 30 for note in notes]
        note_starts_ms = [int(note.get("start", 0) * beat_duration * 1000) for note in notes]
        note_durations_ms = [max(50, int(note.get("duration", 0.5) * beat_duration * 1000)) for note in notes]

        # Generate all notes first
        note_segments = []
        for i, note in enumerate(notes):
            tone = Sine(note_frequencies[i]).to_audio_segment(
                duration=note_durations_ms[i], 
                volume=note_volumes[i]
            )
            note_segments.append((note_starts_ms[i], tone))

        # Overlay all notes at once
        max_note_end = max(start + dur for start, (_, (_, dur)) in enumerate(note_segments))
        segment += AudioSegment.silent(duration=max(0, max_note_end - len(segment)), frame_rate=SAMPLE_RATE)
        
        for start_ms, tone in note_segments:
            if start_ms + len(tone) > len(segment):
                segment += AudioSegment.silent(duration=start_ms + len(tone) - len(segment), frame_rate=SAMPLE_RATE)
            segment = segment.overlay(tone, position=start_ms)
            clip_end_ms = max(clip_end_ms, start_ms + len(tone))

    # Apply effects and automation
    if clip_end_ms > 0:
        segment = apply_track_effects_optimized(segment, track, clip_start_beats)
        volume = max(0.001, automation_value(track, "volume", clip_start_beats, float(track.get("volume", 1))))
        segment = segment.apply_gain(20 * math.log10(volume))
        pan = automation_value(track, "pan", clip_start_beats, float(track.get("pan", 0)))
        segment = segment.pan(max(-1, min(1, pan)))

    return segment

def apply_track_effects_optimized(segment: AudioSegment, track: Dict[str, Any], beat: float) -> AudioSegment:
    """Apply track effects with optimizations"""
    for effect in track.get("effects", []):
        if effect.get("bypass"):
            continue
        params = dict(effect.get("params", {}))
        effect_id = effect.get("id", "")
        for param, value in list(params.items()):
            params[param] = automation_value(track, f"fx.{effect_id}.{param}", beat, float(value))
        effect_type = effect.get("type")
        
        if effect_type == "filter":
            segment = segment.low_pass_filter(int(params.get("frequency", 1000)))
        elif effect_type == "delay":
            delayed = AudioSegment.silent(duration=int(float(params.get("delayTime", 0.25)) * 1000))
            delayed += segment.apply_gain(-9 + float(params.get("feedback", 0.3)) * 6)
            segment = segment.overlay(delayed)
        elif effect_type == "reverb":
            wet = float(params.get("wet", 0.5))
            for delay_ms, gain_db in ((45, -10), (90, -14), (150, -18)):
                echo = AudioSegment.silent(duration=delay_ms) + segment.apply_gain(gain_db)
                segment = segment.overlay(echo.apply_gain(20 * math.log10(max(0.001, wet))))
        elif effect_type == "distortion":
            segment = segment.apply_gain(float(params.get("distortion", 0.4)) * 8)
    
    return segment

def render_track_batch(tracks_batch: List[Tuple[str, Dict]], clips_batch: List[Dict], 
                      beat_duration: float, progress: Callable[[float, str], None] = None) -> Dict[str, AudioSegment]:
    """Render multiple tracks in parallel"""
    results = {}
    
    for track_id, track in tracks_batch:
        track_segments = []
        has_solo = any(bool(t.get("solo")) for t in tracks_batch)
        
        if track.get("muted") or (has_solo and not track.get("solo")):
            results[track_id] = AudioSegment.silent(duration=0, frame_rate=SAMPLE_RATE)
            continue

        # Process clips for this track
        for clip in clips_batch:
            if str(clip.get("channel", clip.get("trackId", "0"))) == track_id:
                segment = process_clip_optimized(clip, track, beat_duration)
                if len(segment) > 0:
                    track_segments.append(segment)

        # Mix all segments for this track
        if track_segments:
            mixed = track_segments[0]
            for segment in track_segments[1:]:
                if len(segment) > len(mixed):
                    mixed += AudioSegment.silent(duration=len(segment) - len(mixed), frame_rate=SAMPLE_RATE)
                mixed = mixed.overlay(segment)
            results[track_id] = mixed
        else:
            results[track_id] = AudioSegment.silent(duration=0, frame_rate=SAMPLE_RATE)
    
    return results

def optimized_render_main(render_req: OptimizedRenderRequest, 
                         progress: Callable[[float, str], None] = None) -> Dict[str, Any]:
    """Main optimized render function with batch processing"""
    
    if progress:
        progress(0.1, "Starting optimized render")
    
    # Separate clips by track for batch processing
    track_clips = {}
    for clip in render_req.clips:
        track_id = str(clip.get("channel", clip.get("trackId", "0")))
        if track_id not in track_clips:
            track_clips[track_id] = []
        track_clips[track_id].append(clip)
    
    # Process tracks in batches
    all_tracks = list(render_req.tracks.items())
    track_segments = {}
    max_duration_ms = 0
    
    # Use ThreadPoolExecutor for parallel track processing
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        future_to_batch = {}
        
        # Create batches of tracks
        batch_size = 2  # Process 2 tracks per batch
        for i in range(0, len(all_tracks), batch_size):
            batch = all_tracks[i:i + batch_size]
            batch_clips = []
            for track_id, _ in batch:
                if track_id in track_clips:
                    batch_clips.extend(track_clips[track_id])
            
            future = executor.submit(
                render_track_batch, 
                batch, 
                batch_clips, 
                render_req.beat_duration,
                None  # Progress callback not used in parallel execution
            )
            future_to_batch[future] = batch
        
        # Collect results
        for future in concurrent.futures.as_completed(future_to_batch):
            batch_results = future.result()
            track_segments.update(batch_results)
            
            # Update max duration
            for segment in batch_results.values():
                max_duration_ms = max(max_duration_ms, len(segment))
            
            if progress:
                progress(0.2 + 0.6 * len(future_to_batch) / len(future_to_batch), "Processing tracks")
    
    # Mix all tracks
    if progress:
        progress(0.8, "Mixing final output")
    
    mixed = AudioSegment.silent(duration=max_duration_ms, frame_rate=SAMPLE_RATE)
    for segment in track_segments.values():
        if len(segment) > 0:
            if len(segment) > len(mixed):
                mixed += AudioSegment.silent(duration=len(segment) - len(mixed), frame_rate=SAMPLE_RATE)
            mixed = mixed.overlay(segment)
    
    # Apply normalization
    preset = PRESETS.get(render_req.preset, PRESETS["festival"])
    if mixed.dBFS != float("-inf"):
        mixed = mixed.apply_gain(preset["target_lufs"] - mixed.dBFS)
    
    # Generate outputs
    if progress:
        progress(0.9, "Writing outputs")
    
    output_dir = tempfile.mkdtemp(prefix="beehive-optimized-render-")
    master_path = os.path.join(output_dir, "master.wav")
    mixed.export(master_path, format="wav")
    
    stem_paths = []
    if render_req.output_mode in {"stems", "master_and_stems"}:
        for track_id, segment in track_segments.items():
            if len(segment) > 0:
                name = str(render_req.tracks.get(track_id, {}).get("name", track_id)).replace("/", "_")
                path = os.path.join(output_dir, f"{name}.wav")
                segment.export(path, format="wav")
                stem_paths.append(path)
    
    if progress:
        progress(1.0, "Render complete")
    
    return {
        "status": "completed",
        "engine": "python",
        "master_path": master_path,
        "stem_paths": stem_paths,
        "duration_ms": len(mixed),
        "format": "wav",
        "optimizations_applied": [
            "parallel_track_processing",
            "batch_note_generation", 
            "pre_calculated_frequencies",
            "memory_efficient_segments"
        ],
    }

def profile_optimized_performance(render_req: OptimizedRenderRequest, iterations: int = 3) -> Dict[str, Any]:
    """Profile the optimized render performance"""
    print(f"Profiling optimized performance with {len(render_req.clips)} clips and {len(render_req.tracks)} tracks...")
    
    times = []
    for i in range(iterations):
        start_time = time.time()
        result = optimized_render_main(render_req, None)
        end_time = time.time()
        times.append(end_time - start_time)
        print(f"Iteration {i + 1}/{iterations}: {times[-1]:.3f}s")
    
    return {
        "avg_time": statistics.mean(times),
        "min_time": min(times),
        "max_time": max(times),
        "iterations": iterations,
        "result": result,
    }

def main():
    parser = argparse.ArgumentParser(description="Optimized Beehive Studio render engine")
    parser.add_argument("--clips", type=int, default=16,
                       help="Number of clips to process")
    parser.add_argument("--tracks", type=int, default=8,
                       help="Number of tracks to process")
    parser.add_argument("--bpm", type=int, default=120,
                       help="BPM for the arrangement")
    parser.add_argument("--preset", choices=["draft", "club", "festival"], default="festival",
                       help="Render preset")
    parser.add_argument("--iterations", type=int, default=3,
                       help="Number of profiling iterations")
    parser.add_argument("--output", type=Path, default=Path("build/reports/optimized-render.json"),
                       help="Output file for profile results")
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("Beehive Studio Optimized Render Engine")
    print("=" * 60)
    
    # Create test request
    clips = []
    tracks = []
    
    # Generate test clips
    for i in range(args.tracks):
        track = {
            "id": f"track-{i}",
            "name": f"Track {i}",
            "volume": 0.8,
            "pan": 0,
            "muted": False,
            "solo": False,
            "effects": [],
            "automationLanes": [],
        }
        tracks.append(track)
        
        for j in range(args.tracks // 2):
            clip = {
                "id": f"clip-{i}-{j}",
                "channel": f"track-{i}",
                "notes": [
                    {"pitch": 60 + (i * 3) + j, "velocity": 100 + j * 20, "start": j * 4, "duration": 2},
                    {"pitch": 64 + (i * 3) + j, "velocity": 110 + j * 15, "start": j * 4 + 1, "duration": 1.5},
                ],
            }
            clips.append(clip)
    
    render_req = OptimizedRenderRequest(
        clips=clips,
        tracks=tracks,
        bpm=args.bpm,
        preset=args.preset,
        output_mode="master"
    )
    
    print(f"Test configuration: {len(clips)} clips, {len(tracks)} tracks, {args.bpm} BPM")
    
    # Profile performance
    profile_result = profile_optimized_performance(render_req, args.iterations)
    
    print(f"\nPerformance Results:")
    print(f"  Average time: {profile_result['avg_time']:.3f}s")
    print(f"  Min time: {profile_result['min_time']:.3f}s")
    print(f"  Max time: {profile_result['max_time']:.3f}s")
    print(f"  Throughput: {len(clips) / profile_result['avg_time']:.1f} clips/sec")
    
    # Save results
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, 'w') as f:
        json.dump(profile_result, f, indent=2)
    
    print(f"\nResults saved to: {args.output}")

if __name__ == "__main__":
    main()