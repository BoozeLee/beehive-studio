/**
 * Performance monitoring and latency measurement utilities for Beehive Studio mixer routing
 */

export interface LatencyMeasurement {
  operation: string;
  startTime: number;
  endTime: number;
  latency: number;
  timestamp: number;
}

export interface PerformanceStats {
  avg: number;
  max: number;
  min: number;
  count: number;
  percentile95: number;
}

export interface AudioContextLatency {
  input: number;
  output: number;
  total: number;
  sampleRate: number;
  bufferSize: number;
}

/**
 * AudioLatencyProfiler - Measures operation latencies with high precision
 */
export class AudioLatencyProfiler {
  private measurements: Map<string, LatencyMeasurement[]> = new Map();
  private activeOperations: Map<string, number> = new Map();
  private maxMeasurementsPerOperation = 1000;

  /**
   * Start measuring an operation
   */
  startMeasurement(operation: string): void {
    this.activeOperations.set(operation, performance.now());
  }

  /**
   * End measurement and record latency
   */
  endMeasurement(operation: string): number {
    const startTime = this.activeOperations.get(operation);
    if (startTime === undefined) {
      console.warn(`No active measurement found for operation: ${operation}`);
      return 0;
    }

    const endTime = performance.now();
    const latency = endTime - startTime;
    
    const measurement: LatencyMeasurement = {
      operation,
      startTime,
      endTime,
      latency,
      timestamp: Date.now(),
    };

    // Store measurement
    if (!this.measurements.has(operation)) {
      this.measurements.set(operation, []);
    }
    
    const operationMeasurements = this.measurements.get(operation)!;
    operationMeasurements.push(measurement);
    
    // Keep only recent measurements to prevent memory bloat
    if (operationMeasurements.length > this.maxMeasurementsPerOperation) {
      operationMeasurements.shift();
    }

    // Clean up active operation
    this.activeOperations.delete(operation);

    return latency;
  }

  /**
   * Measure an operation in a single call
   */
  measureLatency(operation: string, callback: () => void): number {
    this.startMeasurement(operation);
    try {
      callback();
    } finally {
      return this.endMeasurement(operation);
    }
  }

  /**
   * Get statistics for a specific operation
   */
  getStats(operation: string): PerformanceStats | null {
    const measurements = this.measurements.get(operation);
    if (!measurements || measurements.length === 0) {
      return null;
    }

    const latencies = measurements.map(m => m.latency).sort((a, b) => a - b);
    const count = latencies.length;
    
    return {
      avg: latencies.reduce((sum, lat) => sum + lat, 0) / count,
      max: latencies[count - 1],
      min: latencies[0],
      count,
      percentile95: latencies[Math.floor(count * 0.95)],
    };
  }

  /**
   * Get all operations with their stats
   */
  getAllStats(): Map<string, PerformanceStats> {
    const stats = new Map<string, PerformanceStats>();
    
    for (const [operation] of this.measurements) {
      const operationStats = this.getStats(operation);
      if (operationStats) {
        stats.set(operation, operationStats);
      }
    }
    
    return stats;
  }

  /**
   * Check if an operation meets sub-50ms target
   */
  meetsSub50msTarget(operation: string, tolerance = 5): boolean {
    const stats = this.getStats(operation);
    if (!stats) return false;
    
    // Allow 5ms tolerance for sub-50ms target
    return stats.percentile95 <= (50 + tolerance);
  }

  /**
   * Get recent measurements (last N)
   */
  getRecentMeasurements(operation: string, count = 10): LatencyMeasurement[] {
    const measurements = this.measurements.get(operation);
    if (!measurements) return [];
    
    return measurements.slice(-count);
  }

  /**
   * Clear measurements for an operation
   */
  clearMeasurements(operation: string): void {
    this.measurements.delete(operation);
    this.activeOperations.delete(operation);
  }

  /**
   * Clear all measurements
   */
  clearAllMeasurements(): void {
    this.measurements.clear();
    this.activeOperations.clear();
  }

  /**
   * Export performance data for analysis
   */
  exportPerformanceData(): {
    timestamp: number;
    measurements: Record<string, LatencyMeasurement[]>;
    stats: Record<string, PerformanceStats>;
  } {
    const stats: Record<string, PerformanceStats> = {};
    
    for (const [operation] of this.measurements) {
      const operationStats = this.getStats(operation);
      if (operationStats) {
        stats[operation] = operationStats;
      }
    }

    return {
      timestamp: Date.now(),
      measurements: Object.fromEntries(this.measurements),
      stats,
    };
  }
}

/**
 * Real-time performance monitor for UI rendering and audio processing
 */
export class PerformanceMonitor {
  private frameTimeBuffer: number[] = [];
  private lastFrameTime: number = performance.now();
  private updateCallbacks: Set<(fps: number, frameTime: number) => void> = new Set();
  private lastUpdateTime: number = 0;
  private updateInterval: number = 1000; // 1 second update interval
  
  private isRunning: boolean = false;

  /**
   * Start monitoring performance
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastUpdateTime = performance.now();
    this.update();
  }

  /**
   * Stop monitoring performance
   */
  stop(): void {
    this.isRunning = false;
  }

  /**
   * Register callback for performance updates
   */
  onUpdate(callback: (fps: number, frameTime: number) => void): void {
    this.updateCallbacks.add(callback);
  }

  /**
   * Remove callback
   */
  removeUpdateCallback(callback: (fps: number, frameTime: number) => void): void {
    this.updateCallbacks.delete(callback);
  }

  private update(): void {
    if (!this.isRunning) return;

    const now = performance.now();
    const frameTime = now - this.lastFrameTime;
    this.lastFrameTime = now;

    this.frameTimeBuffer.push(frameTime);
    if (this.frameTimeBuffer.length > 60) {
      this.frameTimeBuffer.shift();
    }

    // Update at specified interval
    if (now - this.lastUpdateTime >= this.updateInterval) {
      const avgFrameTime = this.frameTimeBuffer.reduce((a, b) => a + b, 0) / this.frameTimeBuffer.length;
      const fps = 1000 / avgFrameTime;
      
      // Notify all callbacks
      this.updateCallbacks.forEach(callback => {
        try {
          callback(fps, avgFrameTime);
        } catch (error) {
          console.error('Performance monitor callback error:', error);
        }
      });

      this.lastUpdateTime = now;
    }

    // Schedule next update
    requestAnimationFrame(() => this.update());
  }

  /**
   * Get current average FPS
   */
  getAverageFPS(): number {
    if (this.frameTimeBuffer.length === 0) return 0;
    const avgFrameTime = this.frameTimeBuffer.reduce((a, b) => a + b, 0) / this.frameTimeBuffer.length;
    return 1000 / avgFrameTime;
  }

  /**
   * Get current frame time
   */
  getCurrentFrameTime(): number {
    if (this.frameTimeBuffer.length === 0) return 0;
    return this.frameTimeBuffer[this.frameTimeBuffer.length - 1];
  }

  /**
   * Check if performance is degraded
   */
  isPerformanceDegraded(thresholdFPS = 30): boolean {
    return this.getAverageFPS() < thresholdFPS;
  }
}

/**
 * Audio context latency measurement utilities
 */
export class AudioLatencyMeasurement {
  private audioCtx: AudioContext | null = null;
  private measurementBuffer: AudioBuffer | null = null;
  private measurementNode: ScriptProcessorNode | null = null;

  constructor(audioCtx: AudioContext) {
    this.audioCtx = audioCtx;
  }

  /**
   * Measure audio context input and output latency
   */
  measureAudioContextLatency(): AudioContextLatency | null {
    if (!this.audioCtx) return null;

    // Basic latency measurement using Web Audio API properties
    const inputLatency = this.audioCtx.baseLatency || 0;
    const outputLatency = this.audioCtx.outputLatency || 0;
    const totalLatency = inputLatency + outputLatency;

    return {
      input: inputLatency,
      output: outputLatency,
      total: totalLatency,
      sampleRate: this.audioCtx.sampleRate,
      bufferSize: this.audioCtx.bufferSize || 0,
    };
  }

  /**
   * Perform advanced latency measurement using impulse response
   */
  async measureAdvancedLatency(): Promise<{
    inputLatency: number;
    outputLatency: number;
    totalLatency: number;
    confidence: number;
  } | null> {
    if (!this.audioCtx) return null;

    try {
      // Create measurement buffer
      const duration = 0.1; // 100ms measurement window
      const buffer = this.audioCtx.createBuffer(1, this.audioCtx.sampleRate * duration, this.audioCtx.sampleRate);
      const channelData = buffer.getChannelData(0);
      
      // Generate impulse
      channelData[0] = 1;
      for (let i = 1; i < channelData.length; i++) {
        channelData[i] = 0;
      }

      // Create measurement nodes
      const source = this.audioCtx.createBufferSource();
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      
      source.buffer = buffer;
      source.connect(analyser);
      analyser.connect(this.audioCtx.destination);

      // Start measurement
      const startTime = performance.now();
      source.start();
      
      // Wait for playback
      await new Promise<void>((resolve) => {
        const checkComplete = () => {
          if (analyser.getByteTimeDomainData(new Uint8Array(analyser.frequencyBinCount))) {
            const endTime = performance.now();
            const measuredLatency = endTime - startTime;
            resolve();
          } else {
            setTimeout(checkComplete, 1);
          }
        };
        checkComplete();
      });

      // Calculate latency based on impulse detection
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(data);
      
      // Find impulse response
      let impulseIndex = -1;
      for (let i = 0; i < data.length; i++) {
        if (data[i] > 128) {
          impulseIndex = i;
          break;
        }
      }

      const sampleLatency = impulseIndex / analyser.sampleRate;
      const confidence = impulseIndex > 0 ? 1.0 : 0.5; // Higher confidence if impulse detected

      return {
        inputLatency: sampleLatency,
        outputLatency: 0, // Simplified for basic measurement
        totalLatency: sampleLatency,
        confidence,
      };
    } catch (error) {
      console.warn('Advanced latency measurement failed:', error);
      return null;
    }
  }

  /**
   * Get recommended buffer size based on target latency
   */
  getRecommendedBufferSize(targetLatencyMs: number = 50): number {
    if (!this.audioCtx) return 1024;
    
    const targetSamples = Math.floor((targetLatencyMs / 1000) * this.audioCtx.sampleRate);
    const bufferSize = Math.pow(2, Math.ceil(Math.log2(targetSamples)));
    
    // Ensure it's within reasonable bounds
    return Math.max(128, Math.min(8192, bufferSize));
  }
}

// Global instances
export const audioLatencyProfiler = new AudioLatencyProfiler();
export const performanceMonitor = new PerformanceMonitor();

// Auto-start performance monitoring
if (typeof window !== 'undefined') {
  performanceMonitor.start();
}