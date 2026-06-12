import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { 
  audioLatencyProfiler, 
  performanceMonitor,
  AudioLatencyMeasurement 
} from "../lib/performanceMonitoring";

// Mock performance.now for consistent testing
const mockPerformanceNow = vi.fn();
beforeEach(() => {
  let now = 0;
  mockPerformanceNow.mockImplementation(() => {
    now += 1;
    return now;
  });
  global.performance.now = mockPerformanceNow;
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Mixer Performance Tests - Simple", () => {
  beforeEach(() => {
    // Clear all measurements before each test
    audioLatencyProfiler.clearAllMeasurements();
    performanceMonitor.stop();
  });

  afterEach(() => {
    // Clean up
    performanceMonitor.stop();
  });

  describe("Latency Profiler", () => {
    it("should measure operation latencies", () => {
      const latency = audioLatencyProfiler.measureLatency("test-operation", () => {
        // Simulate some work
        const start = performance.now();
        while (performance.now() - start < 5) {} // Simulate 5ms work
      });
      
      expect(latency).toBeGreaterThan(0);
      expect(latency).toBeLessThan(10);
      
      const stats = audioLatencyProfiler.getStats("test-operation");
      expect(stats).toBeTruthy();
      expect(stats!.count).toBe(1);
      expect(stats!.avg).toBe(latency);
    });

    it("should handle multiple measurements", () => {
      // Perform multiple operations
      for (let i = 0; i < 5; i++) {
        audioLatencyProfiler.measureLatency("multi-test", () => {
          const start = performance.now();
          while (performance.now() - start < 2) {} // Simulate 2ms work
        });
      }
      
      const stats = audioLatencyProfiler.getStats("multi-test");
      expect(stats).toBeTruthy();
      expect(stats!.count).toBe(5);
      expect(stats!.avg).toBeGreaterThan(0);
    });

    it("should check sub-50ms target", () => {
      // Perform fast operations that should meet sub-50ms target
      for (let i = 0; i < 10; i++) {
        audioLatencyProfiler.measureLatency("fast-operation", () => {
          const start = performance.now();
          while (performance.now() - start < 1) {} // Simulate 1ms work
        });
      }
      
      const meetsTarget = audioLatencyProfiler.meetsSub50msTarget("fast-operation", 5);
      expect(meetsTarget).toBe(true);
    });

    it("should detect slow operations that don't meet target", () => {
      // Perform slow operations that should exceed sub-50ms target
      for (let i = 0; i < 5; i++) {
        audioLatencyProfiler.startMeasurement("slow-operation");
        for (let tick = 0; tick < 60; tick++) performance.now();
        audioLatencyProfiler.endMeasurement("slow-operation");
      }
      
      const meetsTarget = audioLatencyProfiler.meetsSub50msTarget("slow-operation", 5);
      expect(meetsTarget).toBe(false);
    });

    it("should export performance data", () => {
      // Perform some operations
      audioLatencyProfiler.measureLatency("export-test-1", () => {});
      audioLatencyProfiler.measureLatency("export-test-2", () => {});
      
      const exportData = audioLatencyProfiler.exportPerformanceData();
      
      expect(exportData).toBeTruthy();
      expect(exportData.timestamp).toBeGreaterThan(0);
      expect(exportData.measurements).toBeTruthy();
      expect(exportData.stats).toBeTruthy();
    });
  });

  describe("Performance Monitor", () => {
    it("should start and stop monitoring", () => {
      const initialFrameRequests = vi.mocked(requestAnimationFrame).mock.calls.length;
      performanceMonitor.start();
      expect(requestAnimationFrame).toHaveBeenCalledTimes(initialFrameRequests + 1);
      
      performanceMonitor.stop();
    });

    it("should detect performance degradation", () => {
      // Start monitoring
      performanceMonitor.start();
      
      // Simulate degraded performance
      const originalGetAverageFPS = performanceMonitor.getAverageFPS;
      performanceMonitor.getAverageFPS = () => 25; // Below 30 FPS threshold
      
      const isDegraded = performanceMonitor.isPerformanceDegraded();
      expect(isDegraded).toBe(true);
      
      // Restore original method
      performanceMonitor.getAverageFPS = originalGetAverageFPS;
    });

    it("should register and remove update callbacks", () => {
      const callback = vi.fn();
      performanceMonitor.onUpdate(callback);
      performanceMonitor.removeUpdateCallback(callback);
      performanceMonitor.start();
      performanceMonitor.stop();
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("Audio Context Latency", () => {
    it("should calculate recommended buffer size", () => {
      const mockAudioContext = {
        sampleRate: 44100
      } as any;
      
      const latencyMeasurement = new AudioLatencyMeasurement(mockAudioContext);
      
      // Test 50ms target
      const bufferSize50ms = latencyMeasurement.getRecommendedBufferSize(50);
      expect(bufferSize50ms).toBeGreaterThan(0);
      expect(bufferSize50ms).toBeLessThan(8192);
      
      // Test 10ms target (more aggressive)
      const bufferSize10ms = latencyMeasurement.getRecommendedBufferSize(10);
      expect(bufferSize10ms).toBeGreaterThan(0);
      expect(bufferSize10ms).toBeLessThan(bufferSize50ms);
    });

    it("should handle audio context measurement", () => {
      const mockAudioContext = {
        sampleRate: 44100,
        baseLatency: 0.01,
        outputLatency: 0.01,
        bufferSize: 1024
      } as any;
      
      const latencyMeasurement = new AudioLatencyMeasurement(mockAudioContext);
      const latency = latencyMeasurement.measureAudioContextLatency();
      
      expect(latency).toBeTruthy();
      expect(latency!.input).toBe(0.01);
      expect(latency!.output).toBe(0.01);
      expect(latency!.total).toBe(0.02);
      expect(latency!.sampleRate).toBe(44100);
    });
  });

  describe("Edge Cases", () => {
    it("should handle invalid operation names", () => {
      const stats = audioLatencyProfiler.getStats("non-existent-operation");
      expect(stats).toBeNull();
    });

    it("should clear measurements properly", () => {
      // Perform some operations
      audioLatencyProfiler.measureLatency("clear-test-1", () => {});
      audioLatencyProfiler.measureLatency("clear-test-2", () => {});
      
      expect(audioLatencyProfiler.getStats("clear-test-1")).toBeTruthy();
      expect(audioLatencyProfiler.getStats("clear-test-2")).toBeTruthy();
      
      audioLatencyProfiler.clearAllMeasurements();
      
      expect(audioLatencyProfiler.getStats("clear-test-1")).toBeNull();
      expect(audioLatencyProfiler.getStats("clear-test-2")).toBeNull();
    });

    it("should handle recent measurements", () => {
      // Perform many operations
      for (let i = 0; i < 15; i++) {
        audioLatencyProfiler.measureLatency("recent-test", () => {});
      }
      
      const recent = audioLatencyProfiler.getRecentMeasurements("recent-test", 5);
      expect(recent.length).toBe(5);
      
      const allStats = audioLatencyProfiler.getAllStats();
      expect(allStats.has("recent-test")).toBe(true);
    });
  });
});
