#!/usr/bin/env python3
"""
Simple performance test for Beehive Studio Python renderer
Tests the core rendering performance without complex dependencies
"""

import time
import tempfile
import os
from pathlib import Path
from typing import List, Dict, Any

# Import core components directly
import sys
sys.path.append('services/agent-orchestrator')

# Simplified test that doesn't depend on FastAPI structure
def create_test_clips(size: str = "medium") -> List[Dict]:
    """Create test clips for performance testing"""
    
    if size == "small":
        clips = [
            {
                "id": "clip-1",
                "channel": "track-1",
                "notes": [
                    {"pitch": 60, "velocity": 100, "start": 0, "duration": 1},
                    {"pitch": 64, "velocity": 110, "start": 1, "duration": 1},
                ],
            },
            {
                "id": "clip-2", 
                "channel": "track-2",
                "notes": [
                    {"pitch": 36, "velocity": 120, "start": 0, "duration": 2},
                ],
            },
        ]
        
    elif size == "medium":
        clips = []
        for i in range(8):  # 8 tracks
            for j in range(2):  # 2 clips per track
                clip = {
                    "id": f"clip-{i}-{j}",
                    "channel": f"track-{i}",
                    "notes": [
                        {"pitch": 60 + (i * 3) + j, "velocity": 100 + j * 20, "start": j * 4, "duration": 2},
                        {"pitch": 64 + (i * 3) + j, "velocity": 110 + j * 15, "start": j * 4 + 1, "duration": 1.5},
                    ],
                }
                clips.append(clip)
                
    elif size == "large":
        clips = []
        for i in range(16):  # 16 tracks
            for j in range(8):  # 8 clips per track
                notes = []
                for k in range(16):  # 16 notes per clip
                    notes.append({
                        "pitch": 48 + (i * 2) + (k % 12),
                        "velocity": 80 + (k % 40),
                        "start": k * 0.25,
                        "duration": 0.25,
                    })
                
                clip = {
                    "id": f"clip-{i}-{j}",
                    "channel": f"track-{i}",
                    "notes": notes,
                }
                clips.append(clip)
    
    return clips

def create_test_tracks(count: int = 8) -> List[Dict]:
    """Create test tracks for performance testing"""
    tracks = []
    for i in range(count):
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
    return tracks

def simple_render_performance_test(clips: List[Dict], tracks: List[Dict], bpm: int = 120) -> Dict[str, Any]:
    """Simple performance test that simulates the core rendering logic"""
    
    print(f"Testing performance with {len(clips)} clips and {len(tracks)} tracks...")
    
    start_time = time.time()
    
    # Simulate the key operations that take time in the real renderer
    beat_duration = 60.0 / bpm
    
    # Track processing simulation
    track_segments = {}
    max_duration = 0
    
    for clip_index, clip in enumerate(clips):
        track_id = clip.get("channel", "0")
        track = next((t for t in tracks if t["id"] == track_id), {})
        
        if track.get("muted"):
            continue
            
        # Simulate note processing
        notes = clip.get("notes", [])
        segment_duration = 0
        
        for note in notes:
            start = note.get("start", 0)
            duration = note.get("duration", 0.5)
            end = start + duration
            segment_duration = max(segment_duration, end)
            
            # Simulate some computational work
            _ = 440.0 * (2 ** ((note.get("pitch", 60) - 69) / 12.0))
        
        # Simulate track processing
        if track_id not in track_segments:
            track_segments[track_id] = []
        
        track_segments[track_id].append({
            "duration": segment_duration,
            "gain": track.get("volume", 1.0),
            "pan": track.get("pan", 0.0),
        })
        
        max_duration = max(max_duration, segment_duration)
        
        # Simulate progress callback
        if clip_index % 10 == 0:
            progress = (clip_index + 1) / len(clips)
            print(f"Progress: {progress:.1%}")
    
    # Simulate mixing
    mixed_duration = max_duration
    mixed_channels = 2  # stereo
    
    # Simulate audio processing time
    total_samples = int(mixed_duration * 44100 * mixed_channels)
    
    end_time = time.time()
    render_time = end_time - start_time
    
    return {
        "clips_processed": len(clips),
        "tracks_processed": len(tracks),
        "render_time_seconds": render_time,
        "total_samples": total_samples,
        "effective_sample_rate": 44100,
        "max_duration_seconds": mixed_duration,
        "throughput_clips_per_second": len(clips) / render_time if render_time > 0 else 0,
    }

def test_batch_performance(clips: List[Dict], tracks: List[Dict], batch_size: int = 3) -> Dict[str, Any]:
    """Test performance when processing multiple renders in sequence"""
    
    print(f"Testing batch performance with {batch_size} sequential renders...")
    
    start_time = time.time()
    results = []
    
    for i in range(batch_size):
        print(f"Processing batch item {i + 1}/{batch_size}")
        result = simple_render_performance_test(clips, tracks)
        results.append(result)
        
        # Simulate some cleanup time
        time.sleep(0.1)
    
    total_time = time.time() - start_time
    avg_time = total_time / batch_size
    
    return {
        "batch_size": batch_size,
        "total_time_seconds": total_time,
        "avg_time_seconds": avg_time,
        "throughput_renders_per_second": batch_size / total_time,
        "individual_results": results,
    }

def analyze_performance_results(results: Dict[str, Any]) -> List[str]:
    """Analyze performance results and generate recommendations"""
    
    recommendations = []
    
    # Time-based analysis
    render_time = results.get("render_time_seconds", 0)
    throughput = results.get("throughput_clips_per_second", 0)
    
    if render_time > 2.0:
        recommendations.append("Render time is above target (2s). Consider optimizing note processing.")
    
    if throughput < 5.0:
        recommendations.append("Low throughput (< 5 clips/sec). Consider parallel processing.")
    
    # Size-based analysis
    clips = results.get("clips_processed", 0)
    if clips > 50:
        recommendations.append("Large arrangement detected. Consider implementing streaming output.")
    
    if clips > 100:
        recommendations.append("Very large arrangement. Consider stem output optimization.")
    
    return recommendations

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Simple performance test for Beehive Studio renderer")
    parser.add_argument("--size", choices=["small", "medium", "large"], default="medium",
                       help="Size of test arrangement")
    parser.add_argument("--batch-size", type=int, default=3,
                       help="Number of sequential renders for batch testing")
    parser.add_argument("--iterations", type=int, default=1,
                       help="Number of test iterations")
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("Beehive Studio Python Render Performance Test")
    print("=" * 60)
    
    # Create test data
    clips = create_test_clips(args.size)
    tracks = create_test_tracks(len(set(c.get("channel", "0") for c in clips)))
    
    print(f"Test configuration: {args.size} size, {len(clips)} clips, {len(tracks)} tracks")
    
    # Run performance test
    print("\n1. Single Render Performance")
    print("-" * 40)
    single_results = simple_render_performance_test(clips, tracks)
    
    print(f"\nResults:")
    for key, value in single_results.items():
        if isinstance(value, float):
            print(f"  {key}: {value:.3f}")
        else:
            print(f"  {key}: {value}")
    
    # Run batch test
    print(f"\n2. Batch Performance ({args.batch_size} renders)")
    print("-" * 40)
    batch_results = test_batch_performance(clips, tracks, args.batch_size)
    
    print(f"\nBatch Results:")
    print(f"  Total time: {batch_results['total_time_seconds']:.3f}s")
    print(f"  Average time: {batch_results['avg_time_seconds']:.3f}s")
    print(f"  Throughput: {batch_results['throughput_renders_per_second']:.2f} renders/sec")
    
    # Generate recommendations
    recommendations = analyze_performance_results(single_results)
    
    print(f"\n3. Optimization Recommendations")
    print("-" * 40)
    if recommendations:
        for i, rec in enumerate(recommendations, 1):
            print(f"  {i}. {rec}")
    else:
        print("  Performance is within acceptable parameters")
    
    # Performance score
    performance_score = min(100, 100 - (single_results['render_time_seconds'] * 10))
    print(f"\nPerformance Score: {performance_score}/100")
    
    if performance_score >= 80:
        print("✓ Excellent performance")
    elif performance_score >= 60:
        print("✓ Good performance")
    else:
        print("✗ Performance optimization needed")

if __name__ == "__main__":
    main()