import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { 
  audioLatencyProfiler, 
  performanceMonitor,
  AudioLatencyMeasurement 
} from "../lib/performanceMonitoring";
import { 
  updateChannel, 
  batchUpdateChannels,
  setChannelVolumeImmediate,
  setChannelPanImmediate,
  setMasterVolumeImmediate,
  createChannel,
  initMixer,
  disposeMixer,
} from "../lib/audioMixer";

// Mock Web Audio API
const { mockAudioContext } = vi.hoisted(() => {
  const audioParam = (value = 0) => ({
    value,
    linearRampToValueAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
  });
  const audioNode = () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
  });
  return {
    mockAudioContext: {
      sampleRate: 44100,
      baseLatency: 0.01,
      outputLatency: 0.01,
      currentTime: 0,
      createGain: () => ({ ...audioNode(), gain: audioParam(1) }),
      createStereoPanner: () => ({ ...audioNode(), pan: audioParam(0) }),
      createAnalyser: () => ({
        ...audioNode(),
        fftSize: 32,
        frequencyBinCount: 16,
        getByteTimeDomainData: vi.fn((data: Uint8Array) => data.fill(128)),
      }),
      createConvolver: () => ({ ...audioNode(), buffer: null }),
      createDelay: () => ({ ...audioNode(), delayTime: audioParam(0) }),
      createBuffer: (channels: number, length: number) => ({
        numberOfChannels: channels,
        getChannelData: () => new Float32Array(length),
      }),
      createScriptProcessor: () => ({ ...audioNode(), onaudioprocess: null }),
      destination: audioNode(),
    },
  };
});

vi.mock("tone", () => ({
  context: {
    rawContext: mockAudioContext,
  }
}));

// Mock performance.now for consistent testing
const mockPerformanceNow = vi.fn();
beforeEach(() => {
  let now = 0;
  mockPerformanceNow.mockImplementation(() => {
    now += 0.1;
    return now;
  });
  global.performance.now = mockPerformanceNow;
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  disposeMixer();
  vi.unstubAllGlobals();
});

describe("Mixer Performance Tests", () => {
  beforeEach(() => {
    // Clear all measurements before each test
    audioLatencyProfiler.clearAllMeasurements();
    performanceMonitor.stop();
    
    // Initialize mixer
    initMixer();
    
    // Create test channels
    createChannel("test-channel-1", "Test Channel 1");
    createChannel("test-channel-2", "Test Channel 2");
  });

  afterEach(() => {
    // Clean up
    performanceMonitor.stop();
  });

  describe("Volume Update Latency", () => {
    it("should measure volume update latency", () => {
      const latency = audioLatencyProfiler.measureLatency("volume-update", () => {
        updateChannel("test-channel-1", { volume: 0.5 });
      });
      
      expect(latency).toBeGreaterThan(0);
      expect(latency).toBeLessThan(10); // Should be very fast in test environment
      
      const stats = audioLatencyProfiler.getStats("volume-update");
      expect(stats).toBeTruthy();
      expect(stats!.count).toBe(1);
      expect(stats!.avg).toBe(latency);
    });

    it("should measure immediate volume update latency", () => {
      const latency = audioLatencyProfiler.measureLatency("immediate-volume-update", () => {
        updateChannel("test-channel-1", { volume: 0.8 }, true);
      });
      
      expect(latency).toBeGreaterThan(0);
      expect(latency).toBeLessThan(5); // Immediate updates should be faster
      
      const stats = audioLatencyProfiler.getStats("immediate-volume-update");
      expect(stats).toBeTruthy();
      expect(stats!.avg).toBeLessThan(1); // Should be sub-1ms
    });

    it("should meet sub-50ms target for volume updates", () => {
      // Simulate multiple volume updates
      for (let i = 0; i < 10; i++) {
        audioLatencyProfiler.startMeasurement("volume-update");
        updateChannel("test-channel-1", { volume: Math.random() });
        audioLatencyProfiler.endMeasurement("volume-update");
      }
      
      const meetsTarget = audioLatencyProfiler.meetsSub50msTarget("volume-update");
      expect(meetsTarget).toBe(true);
    });
  });

  describe("Pan Update Latency", () => {
    it("should measure pan update latency", () => {
      const latency = audioLatencyProfiler.measureLatency("pan-update", () => {
        updateChannel("test-channel-1", { pan: 0.3 });
      });
      
      expect(latency).toBeGreaterThan(0);
      expect(latency).toBeLessThan(10);
      
      const stats = audioLatencyProfiler.getStats("pan-update");
      expect(stats).toBeTruthy();
      expect(stats!.count).toBe(1);
    });

    it("should measure immediate pan update latency", () => {
      const latency = audioLatencyProfiler.measureLatency("immediate-pan-update", () => {
        setChannelPanImmediate("test-channel-1", -0.5);
      });
      
      expect(latency).toBeGreaterThan(0);
      expect(latency).toBeLessThan(2); // Should be very fast
      
      const stats = audioLatencyProfiler.getStats("immediate-pan-update");
      expect(stats).toBeTruthy();
      expect(stats!.avg).toBeLessThan(1);
    });
  });

  describe("Mute/Solo Update Latency", () => {
    it("should measure mute update latency", () => {
      const latency = audioLatencyProfiler.measureLatency("mute-update", () => {
        updateChannel("test-channel-1", { muted: true });
      });
      
      expect(latency).toBeGreaterThan(0);
      expect(latency).toBeLessThan(10);
      
      const stats = audioLatencyProfiler.getStats("mute-update");
      expect(stats).toBeTruthy();
      expect(stats!.count).toBe(1);
    });

    it("should measure solo update latency", () => {
      const latency = audioLatencyProfiler.measureLatency("solo-update", () => {
        updateChannel("test-channel-1", { solo: true });
      });
      
      expect(latency).toBeGreaterThan(0);
      expect(latency).toBeLessThan(10);
      
      const stats = audioLatencyProfiler.getStats("solo-update");
      expect(stats).toBeTruthy();
      expect(stats!.count).toBe(1);
    });
  });

  describe("Batch Update Performance", () => {
    it("should measure batch update performance", () => {
      const updates = [
        { id: "test-channel-1", update: { volume: 0.5 } },
        { id: "test-channel-2", update: { volume: 0.7 } },
        { id: "test-channel-1", update: { pan: 0.2 } },
        { id: "test-channel-2", update: { pan: -0.3 } },
      ];
      
      const latency = audioLatencyProfiler.measureLatency("batch-update", () => {
        batchUpdateChannels(updates);
      });
      
      expect(latency).toBeGreaterThan(0);
      expect(latency).toBeLessThan(5); // Should be very efficient
      
      const stats = audioLatencyProfiler.getStats("batch-update");
      expect(stats).toBeTruthy();
      expect(stats!.avg).toBeLessThan(2); // Sub-2ms for batch operations
    });

    it("should be more efficient than individual updates", () => {
      // Measure individual updates
      const individualLatency = audioLatencyProfiler.measureLatency("individual-updates", () => {
        updateChannel("test-channel-1", { volume: 0.5 });
        updateChannel("test-channel-2", { volume: 0.7 });
        updateChannel("test-channel-1", { pan: 0.2 });
        updateChannel("test-channel-2", { pan: -0.3 });
      });
      
      // Measure batch updates
      const updates = [
        { id: "test-channel-1", update: { volume: 0.5 } },
        { id: "test-channel-2", update: { volume: 0.7 } },
        { id: "test-channel-1", update: { pan: 0.2 } },
        { id: "test-channel-2", update: { pan: -0.3 } },
      ];
      
      const batchLatency = audioLatencyProfiler.measureLatency("batch-update-comparison", () => {
        batchUpdateChannels(updates);
      });
      
      // Batch should be faster or equal to individual
      expect(batchLatency).toBeLessThanOrEqual(individualLatency);
    });
  });

  describe("Master Volume Performance", () => {
    it("should measure master volume update latency", () => {
      const latency = audioLatencyProfiler.measureLatency("master-volume-update", () => {
        setMasterVolumeImmediate(0.8);
      });
      
      expect(latency).toBeGreaterThan(0);
      expect(latency).toBeLessThan(2); // Should be very fast
      
      const stats = audioLatencyProfiler.getStats("master-volume-update");
      expect(stats).toBeTruthy();
      expect(stats!.avg).toBeLessThan(1);
    });
  });

  describe("Performance Monitoring", () => {
    it("should start and stop performance monitoring without leaking frames", () => {
      const initialFrameRequests = vi.mocked(requestAnimationFrame).mock.calls.length;
      performanceMonitor.start();
      expect(requestAnimationFrame).toHaveBeenCalledTimes(initialFrameRequests + 1);
      performanceMonitor.stop();
    });

    it("should detect performance degradation", () => {
      // Start monitoring
      performanceMonitor.start();
      
      // Simulate degraded performance by setting low FPS
      const originalGetAverageFPS = performanceMonitor.getAverageFPS;
      performanceMonitor.getAverageFPS = () => 25; // Below 30 FPS threshold
      
      const isDegraded = performanceMonitor.isPerformanceDegraded();
      expect(isDegraded).toBe(true);
      
      // Restore original method
      performanceMonitor.getAverageFPS = originalGetAverageFPS;
    });
  });

  describe("Audio Context Latency", () => {
    it("should measure audio context latency", () => {
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

    it("should recommend appropriate buffer size for target latency", () => {
      const mockAudioContext = {
        sampleRate: 44100
      } as any;
      
      const latencyMeasurement = new AudioLatencyMeasurement(mockAudioContext);
      
      // Test 50ms target
      const bufferSize50ms = latencyMeasurement.getRecommendedBufferSize(50);
      expect(bufferSize50ms).toBeGreaterThan(0);
      
      // Test 10ms target (more aggressive)
      const bufferSize10ms = latencyMeasurement.getRecommendedBufferSize(10);
      expect(bufferSize10ms).toBeLessThan(bufferSize50ms);
    });
  });

  describe("Sub-50ms Target Validation", () => {
    it("should validate sub-50ms target for all critical operations", () => {
      const criticalOperations = [
        "volume-update",
        "immediate-volume-update", 
        "pan-update",
        "immediate-pan-update",
        "mute-update",
        "solo-update",
        "batch-update",
        "master-volume-update"
      ];
      
      // Measure every critical operation through the profiler contract.
      criticalOperations.forEach(op => {
        audioLatencyProfiler.startMeasurement(op);
        switch (op) {
          case "volume-update":
            updateChannel("test-channel-1", { volume: 0.5 });
            break;
          case "immediate-volume-update":
            updateChannel("test-channel-1", { volume: 0.8 }, true);
            break;
          case "pan-update":
            updateChannel("test-channel-1", { pan: 0.3 });
            break;
          case "immediate-pan-update":
            setChannelPanImmediate("test-channel-1", -0.5);
            break;
          case "mute-update":
            updateChannel("test-channel-1", { muted: true });
            break;
          case "solo-update":
            updateChannel("test-channel-1", { solo: true });
            break;
          case "batch-update":
            batchUpdateChannels([
              { id: "test-channel-1", update: { volume: 0.5 } },
              { id: "test-channel-2", update: { volume: 0.7 } }
            ]);
            break;
          case "master-volume-update":
            setMasterVolumeImmediate(0.8);
            break;
        }
        audioLatencyProfiler.endMeasurement(op);
      });
      
      // Validate all operations meet sub-50ms target
      const allMeetTarget = criticalOperations.every(op => 
        audioLatencyProfiler.meetsSub50msTarget(op, 5) // 5ms tolerance
      );
      
      expect(allMeetTarget).toBe(true);
    });

    it("should export performance data for analysis", () => {
      // Perform some operations
      updateChannel("test-channel-1", { volume: 0.5 });
      updateChannel("test-channel-2", { volume: 0.7 });
      
      const exportData = audioLatencyProfiler.exportPerformanceData();
      
      expect(exportData).toBeTruthy();
      expect(exportData.timestamp).toBeGreaterThan(0);
      expect(exportData.measurements).toBeTruthy();
      expect(exportData.stats).toBeTruthy();
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("should handle invalid channel IDs gracefully", () => {
      expect(() => {
        updateChannel("non-existent-channel", { volume: 0.5 });
      }).not.toThrow();
      
      expect(() => {
        setChannelVolumeImmediate("non-existent-channel", 0.5);
      }).not.toThrow();
    });

    it("should handle invalid parameter values", () => {
      expect(() => {
        updateChannel("test-channel-1", { volume: 2.0 }); // > 1.0
      }).not.toThrow();
      
      expect(() => {
        updateChannel("test-channel-1", { pan: 2.0 }); // > 1.0
      }).not.toThrow();
    });
  });
});
