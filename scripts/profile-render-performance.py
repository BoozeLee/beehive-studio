#!/usr/bin/env python3
"""
Performance profiler for Beehive Studio Python renderer
Measures execution time, memory usage, and identifies optimization opportunities
"""

import argparse
import asyncio
import json
import os
import time
import tracemalloc
import psutil
from pathlib import Path
from typing import Any, Dict, List
import tempfile

# Import the render system
import sys
sys.path.append(str(Path(__file__).parent / "services/agent-orchestrator"))
from api.main import RenderRequest, _render_request

def create_test_arrangement(size: str = "small") -> RenderRequest:
    """Create test arrangements of different sizes for profiling"""
    
    if size == "small":
        # Simple 2-bar arrangement
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
        tracks = [
            {
                "id": "track-1",
                "name": "Lead Synth",
                "volume": 0.8,
                "pan": 0,
                "muted": False,
                "solo": False,
                "effects": [],
                "automationLanes": [],
            },
            {
                "id": "track-2",
                "name": "Kick Drum",
                "volume": 0.9,
                "pan": 0,
                "muted": False,
                "solo": False,
                "effects": [],
                "automationLanes": [],
            },
        ]
        
    elif size == "medium":
        # 8-bar arrangement with multiple tracks
        clips = []
        tracks = []
        
        # Create 8 tracks
        for i in range(8):
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
            
            # Add 2 clips per track
            for j in range(2):
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
        # 32-bar arrangement with complex arrangements
        clips = []
        tracks = []
        
        # Create 16 tracks
        for i in range(16):
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
            
            # Add 8 clips per track with many notes
            for j in range(8):
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
    
    return RenderRequest(
        clips=clips,
        tracks=tracks,
        bpm=120,
        format="wav",
        preset="festival",
        output_mode="master"
    )

def profile_render_performance(render_req: RenderRequest, iterations: int = 1) -> Dict[str, Any]:
    """Profile the render performance"""
    
    print(f"Profiling render performance with {len(render_req.clips)} clips and {len(render_req.tracks)} tracks...")
    print(f"Running {iterations} iterations...")
    
    # Memory profiling setup
    tracemalloc.start()
    
    # Process monitoring
    process = psutil.Process()
    start_time = time.time()
    
    # Track memory before
    mem_before = process.memory_info().rss / 1024 / 1024  # MB
    
    # Run render
    times = []
    memory_samples = []
    
    for i in range(iterations):
        iter_start = time.time()
        
        # Run the render
        result = _render_request(render_req, None)
        
        iter_end = time.time()
        iter_time = iter_end - iter_start
        times.append(iter_time)
        
        # Sample memory during execution
        mem_current = process.memory_info().rss / 1024 / 1024  # MB
        memory_samples.append(mem_current)
        
        print(f"Iteration {i + 1}/{iterations}: {iter_time:.3f}s, Memory: {mem_current:.1f}MB")
    
    # Memory after
    mem_after = process.memory_info().rss / 1024 / 1024  # MB
    tracemalloc.stop()
    
    # Calculate statistics
    total_time = sum(times)
    avg_time = total_time / len(times)
    min_time = min(times)
    max_time = max(times)
    
    memory_stats = {
        "before_mb": mem_before,
        "peak_mb": max(memory_samples),
        "after_mb": mem_after,
        "growth_mb": mem_after - mem_before,
        "peak_growth_mb": max(memory_samples) - mem_before,
    }
    
    time_stats = {
        "total_seconds": total_time,
        "avg_seconds": avg_time,
        "min_seconds": min_time,
        "max_seconds": max_time,
        "iterations": iterations,
    }
    
    # Get memory snapshot if available
    current, peak = tracemalloc.get_traced_memory()
    memory_stats["traced_peak_mb"] = peak / 1024 / 1024
    
    profile_result = {
        "arrangement_size": len(render_req.clips),
        "track_count": len(render_req.tracks),
        "time_stats": time_stats,
        "memory_stats": memory_stats,
        "render_result": result,
        "performance_score": calculate_performance_score(time_stats, memory_stats),
    }
    
    return profile_result

def calculate_performance_score(time_stats: Dict, memory_stats: Dict) -> float:
    """Calculate a performance score (0-100, higher is better)"""
    
    # Time score (normalized to 50 points, faster is better)
    # Target: < 2s for small, < 10s for medium, < 30s for large
    target_times = {"small": 2.0, "medium": 10.0, "large": 30.0}
    time_score = max(0, 50 - (time_stats["avg_seconds"] / 2))
    
    # Memory score (normalized to 50 points, lower is better)
    # Target: < 100MB memory growth
    memory_growth = memory_stats["growth_mb"]
    memory_score = max(0, 50 - (memory_growth / 2))
    
    # Total score
    total_score = min(100, time_score + memory_score)
    
    return total_score

def generate_optimization_recommendations(profile_result: Dict[str, Any]) -> List[str]:
    """Generate optimization recommendations based on profiling results"""
    
    recommendations = []
    time_stats = profile_result["time_stats"]
    memory_stats = profile_result["memory_stats"]
    
    # Time-based recommendations
    if time_stats["avg_seconds"] > 5.0:
        recommendations.append("Consider implementing batch processing for note generation")
        recommendations.append("Optimize audio segment operations in pydub")
    
    if time_stats["avg_seconds"] > 10.0:
        recommendations.append("Implement parallel track processing")
        recommendations.append("Consider pre-generating waveforms for common frequencies")
    
    # Memory-based recommendations
    if memory_stats["growth_mb"] > 50:
        recommendations.append("Implement memory-efficient audio processing")
        recommendations.append("Add garbage collection for temporary audio segments")
    
    if memory_stats["peak_mb"] > 200:
        recommendations.append("Consider streaming output for large arrangements")
        recommendations.append("Implement stem output optimization")
    
    # General recommendations
    recommendations.append("Add progress callback for better user feedback")
    recommendations.append("Implement render caching for repeated operations")
    recommendations.append("Add batch processing for multiple render jobs")
    
    return recommendations

async def profile_batch_performance(render_req: RenderRequest, batch_size: int = 3) -> Dict[str, Any]:
    """Profile performance when processing multiple render jobs in sequence"""
    
    print(f"Profiling batch performance with {batch_size} sequential renders...")
    
    start_time = time.time()
    results = []
    
    for i in range(batch_size):
        print(f"Processing batch item {i + 1}/{batch_size}")
        result = await asyncio.to_thread(_render_request, render_req, None)
        results.append(result)
    
    total_time = time.time() - start_time
    avg_time = total_time / batch_size
    
    return {
        "batch_size": batch_size,
        "total_seconds": total_time,
        "avg_seconds": avg_time,
        "throughput": batch_size / total_time,  # renders per second
        "results": results,
    }

def main():
    parser = argparse.ArgumentParser(description="Profile Beehive Studio render performance")
    parser.add_argument("--size", choices=["small", "medium", "large"], default="medium",
                       help="Size of test arrangement")
    parser.add_argument("--iterations", type=int, default=3,
                       help="Number of render iterations")
    parser.add_argument("--batch-size", type=int, default=3,
                       help="Number of sequential renders for batch testing")
    parser.add_argument("--output", type=Path, default=Path("build/reports/render-performance.json"),
                       help="Output file for profile results")
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("Beehive Studio Python Render Performance Profiler")
    print("=" * 60)
    
    # Create test arrangement
    render_req = create_test_arrangement(args.size)
    
    # Profile single render performance
    print("\n1. Single Render Performance")
    print("-" * 40)
    single_profile = profile_render_performance(render_req, args.iterations)
    
    # Profile batch performance
    print("\n2. Batch Performance")
    print("-" * 40)
    batch_profile = asyncio.run(profile_batch_performance(render_req, args.batch_size))
    
    # Generate recommendations
    recommendations = generate_optimization_recommendations(single_profile)
    
    # Compile final results
    final_results = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "test_size": args.size,
        "single_render": single_profile,
        "batch_performance": batch_profile,
        "recommendations": recommendations,
        "summary": {
            "single_render_time": f"{single_profile['time_stats']['avg_seconds']:.3f}s",
            "batch_throughput": f"{batch_profile['throughput']:.2f} renders/sec",
            "performance_score": single_profile['performance_score'],
        },
    }
    
    # Save results
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, 'w') as f:
        json.dump(final_results, f, indent=2)
    
    print(f"\nProfile results saved to: {args.output}")
    print(f"\nSummary:")
    print(f"  Average render time: {single_profile['time_stats']['avg_seconds']:.3f}s")
    print(f"  Batch throughput: {batch_profile['throughput']:.2f} renders/sec")
    print(f"  Performance score: {single_profile['performance_score']}/100")
    
    print(f"\nTop optimization recommendations:")
    for i, rec in enumerate(recommendations[:5], 1):
        print(f"  {i}. {rec}")

if __name__ == "__main__":
    main()