/**
 * Beehive Studio — AudioWorklet Processor for Sample-Accurate Scheduling.
 *
 * Runs on the audio thread. Receives note on/off events from the main thread
 * via MessagePort and renders oscillators directly into the output buffer,
 * achieving <5ms latency.
 */

class BeehiveProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.activeVoices = [];
    this.phase = 0;

    this.port.onmessage = (event) => {
      const msg = event.data;
      switch (msg.type) {
        case "noteOn":
          this.activeVoices.push({
            frequency: msg.frequency,
            velocity: msg.velocity,
            startTime: currentTime,
            duration: msg.duration,
            phase: 0,
          });
          break;
        case "noteOff":
          // Mark voice for release
          for (const voice of this.activeVoices) {
            if (Math.abs(voice.frequency - msg.frequency) < 0.1) {
              voice.releaseTime = currentTime;
              voice.releaseDuration = 0.08;
            }
          }
          break;
        case "clearAll":
          this.activeVoices = [];
          break;
        case "setParam":
          // Future: parameter automation
          break;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const numChannels = output.length;
    const sampleRate = sampleRate || 44100;

    // Clean up released voices
    this.activeVoices = this.activeVoices.filter((voice) => {
      if (voice.releaseTime) {
        const elapsed = currentTime - voice.releaseTime;
        return elapsed < voice.releaseDuration;
      }
      if (voice.duration) {
        const elapsed = currentTime - voice.startTime;
        return elapsed < voice.duration + 0.1;
      }
      return true;
    });

    // Render each channel
    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = output[ch];
      if (!channelData) continue;

      for (let sample = 0; sample < channelData.length; sample++) {
        let sampleValue = 0;

        for (const voice of this.activeVoices) {
          const voiceAge = currentTime - voice.startTime + sample / sampleRate;
          let amplitude = voice.velocity;

          // ADSR envelope
          const attackTime = 0.005;
          const decayTime = 0.08;
          const sustainLevel = 0.7;

          if (voiceAge < attackTime) {
            amplitude *= voiceAge / attackTime;
          } else if (voiceAge < attackTime + decayTime) {
            amplitude *= 1 - (1 - sustainLevel) * ((voiceAge - attackTime) / decayTime);
          } else if (voice.releaseTime) {
            const releaseAge = voiceAge - (voice.releaseTime - voice.startTime);
            if (releaseAge > 0) {
              amplitude *= Math.max(0, 1 - releaseAge / voice.releaseDuration);
            }
          } else if (voice.duration && voiceAge > voice.duration) {
            amplitude *= Math.max(0, 1 - (voiceAge - voice.duration) / 0.1);
          }

          const voicePhase = (voice.phase + voice.frequency * voiceAge * 2 * Math.PI) % (2 * Math.PI);
          sampleValue += Math.sin(voicePhase) * amplitude;
        }

        channelData[sample] = Math.max(-1, Math.min(1, sampleValue));
      }
    }

    return true; // Keep processor alive
  }
}

registerProcessor("beehive-processor", BeehiveProcessor);
