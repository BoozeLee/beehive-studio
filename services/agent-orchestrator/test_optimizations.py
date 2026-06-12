#!/usr/bin/env python3
"""
Test script to verify that all the Python render optimizations are working correctly
"""

import sys
import os
import time
import tempfile
from collections import OrderedDict

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_render_job_cache():
    """Test the render job cache system"""
    print("Testing RenderJobCache...")
    
    # Import the cache class
    from api.main import RenderJobCache
    
    cache = RenderJobCache(max_size=5)
    
    # Test basic operations
    cache.put("test1", {"data": "value1"})
    cache.put("test2", {"data": "value2"})
    
    assert cache.get("test1") == {"data": "value1"}
    assert cache.get("test2") == {"data": "value2"}
    assert cache.get("nonexistent") is None
    
    # Test LRU behavior
    cache.put("test3", {"data": "value3"})
    cache.put("test4", {"data": "value4"})
    cache.put("test5", {"data": "value5"})
    cache.put("test6", {"data": "value6"})  # This should evict test1
    
    assert cache.get("test1") is None  # Should be evicted
    assert cache.get("test2") is not None
    
    print("✅ RenderJobCache test passed")
    return True

def test_audio_file_cache():
    """Test the audio file cache system"""
    print("Testing AudioFileCache...")
    
    from api.main import AudioFileCache
    
    cache = AudioFileCache(max_size=5)
    
    # Test basic operations
    cache.put("audio1", ("segment1", 1024))
    cache.put("audio2", ("segment2", 2048))
    
    assert cache.get("audio1") == ("segment1", 1024)
    assert cache.get("audio2") == ("segment2", 2048)
    assert cache.get("nonexistent") is None
    
    # Test hit rate calculation
    cache.cache_hits = 10
    cache.cache_misses = 5
    assert cache.hit_rate() == 0.6666666666666666
    
    print("✅ AudioFileCache test passed")
    return True

def test_performance_monitor():
    """Test the performance monitoring system"""
    print("Testing PerformanceMonitor...")
    
    from api.main import PerformanceMonitor
    
    monitor = PerformanceMonitor()
    
    # Test timing
    monitor.start_timing()
    time.sleep(0.1)  # Small delay
    metric = monitor.end_timing("test_job", None, {"cached": False})
    
    assert "duration_seconds" in metric
    assert metric["duration_seconds"] > 0.05  # Should be at least 50ms
    assert len(monitor.metrics) == 1
    
    print("✅ PerformanceMonitor test passed")
    return True

def test_throttle_callback():
    """Test the progress callback throttling"""
    print("Testing _throttle_progress_callback...")
    
    from api.main import _throttle_progress_callback
    
    call_count = 0
    
    def test_callback(value, stage):
        nonlocal call_count
        call_count += 1
    
    throttled = _throttle_progress_callback(test_callback, min_interval=0.1)
    
    # Multiple rapid calls should be throttled
    start_time = time.time()
    for i in range(10):
        throttled(i * 0.1, f"stage {i}")
        time.sleep(0.01)  # 10ms delay between calls
    
    end_time = time.time()
    elapsed = end_time - start_time
    
    # Should have made fewer than 10 calls due to throttling
    assert call_count < 10
    assert elapsed >= 0.1  # Should take at least 100ms due to throttling
    
    print("✅ _throttle_progress_callback test passed")
    return True

def test_frequency_cache():
    """Test the MIDI frequency cache"""
    print("Testing MIDI frequency cache...")
    
    from api.main import _get_midi_frequency
    
    # Test frequency calculation
    freq1 = _get_midi_frequency(60)  # Middle C
    freq2 = _get_midi_frequency(60)  # Same note again
    
    assert freq1 == freq2  # Should be the same
    assert isinstance(freq1, float)
    assert freq1 > 0
    
    # Test cache is working
    assert len(_midi_frequency_cache) > 0
    
    print("✅ MIDI frequency cache test passed")
    return True

def main():
    """Run all optimization tests"""
    print("🚀 Testing Python Render Optimizations")
    print("=" * 50)
    
    tests = [
        test_render_job_cache,
        test_audio_file_cache,
        test_performance_monitor,
        test_throttle_callback,
        test_frequency_cache,
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            if test():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"❌ {test.__name__} failed: {e}")
            failed += 1
    
    print("\n" + "=" * 50)
    print(f"📊 Test Results: {passed} passed, {failed} failed")
    
    if failed == 0:
        print("🎉 All optimization tests passed!")
        return 0
    else:
        print("⚠️  Some tests failed. Check the implementation.")
        return 1

if __name__ == "__main__":
    sys.exit(main())