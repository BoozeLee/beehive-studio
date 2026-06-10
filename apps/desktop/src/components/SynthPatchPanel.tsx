import { BEEHIVE } from "../lib/theme";
import React, { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ReasoningTrace, type ReasoningStep } from "./ReasoningTrace";

const COLORS = { ...BEEHIVE, accentDim: "rgba(255,140,66,0.2)" };

interface OscillatorParams {
  type: string;
  count?: number;
  detune?: number;
  gain?: number;
  spread?: number;
}

interface FilterParams {
  type: string;
  frequency: number;
  rolloff?: number;
  Q?: number;
  resonance?: number;
  envelope?: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
    amount: number;
  };
}

interface EnvelopeParams {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  attackCurve?: string;
  decayCurve?: string;
  releaseCurve?: string;
}

interface LfoParams {
  type: string;
  frequency: number;
  depth: number;
  target: string;
}

interface EffectParams {
  type: string;
  [key: string]: unknown;
}

interface PatchData {
  name: string;
  category: string;
  synth_type: string;
  oscillators: OscillatorParams[];
  filter: FilterParams;
  envelope: EnvelopeParams;
  lfos: LfoParams[];
  effects: EffectParams[];
}

interface AgentResult {
  id: string;
  status: string;
  reasoning: string[];
  patch: PatchData;
  web_audio_config: Record<string, unknown>;
  _synth_type: string;
  _category: string;
}

interface SavedPatch {
  id: string;
  name: string;
  category: string;
  patch: PatchData;
  savedAt: string;
}

const STORAGE_KEY = "beehive_saved_patches";

function loadSavedPatches(): SavedPatch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePatchesToStorage(patches: SavedPatch[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patches));
  } catch {
    /* storage full or unavailable */
  }
}

const CATEGORY_COLORS: Record<string, string> = {
  bass: "#ff6b6b",
  lead: "#ffd93d",
  pad: "#6bcbff",
  pluck: "#6bff6b",
  fx: "#ff6bff",
  arp: "#ff9f43",
  keys: "#ffd93d",
  atmosphere: "#a29bfe",
};

export const SynthPatchPanel: React.FC = () => {
  const [brief, setBrief] = useState("");
  const [patch, setPatch] = useState<PatchData | null>(null);
  const [reasoning, setReasoning] = useState<ReasoningStep[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [previewNote, setPreviewNote] = useState(60);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [savedPatches, setSavedPatches] = useState<SavedPatch[]>(loadSavedPatches);
  const [showSaved, setShowSaved] = useState(false);
  const synthRef = useRef<{ nodes: AudioNode[]; stop: () => void } | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      if (synthRef.current) {
        synthRef.current.stop();
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close();
      }
    };
  }, []);

  const generatePatch = useCallback(async () => {
    if (!brief.trim()) return;
    setIsLoading(true);
    setPatch(null);
    const reasoningStep: ReasoningStep[] = [
      { type: "status", text: "Generating synth patch..." },
    ];
    setReasoning(reasoningStep);

    try {
      const data = await invoke<AgentResult>("run_sound_design_agent", {
        brief: brief.trim(),
        sessionContext: {},
      });

      setPatch(data.patch);
      setReasoning([
        ...reasoningStep,
        ...data.reasoning.map((r) => ({ type: "reasoning" as const, text: r })),
        { type: "complete" as const, text: `Patch: ${data.patch.name}` },
      ]);
    } catch (err) {
      setReasoning([
        ...reasoningStep,
        { type: "error" as const, text: `Failed: ${String(err)}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [brief]);

  const previewPatch = useCallback(async () => {
    if (!patch || previewPlaying) return;

    try {
      setPreviewPlaying(true);

      if (synthRef.current) {
        synthRef.current.stop();
      }

      const ctx = audioCtxRef.current || new AudioContext();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      const env = patch.envelope;
      const oscType = patch.oscillators[0]?.type || "sawtooth";
      const freq = 440 * Math.pow(2, (previewNote - 69) / 12);
      const velocity = 0.7;
      const attackTime = env.attack || 0.01;
      const sustainLevel = env.sustain || 0.5;
      const releaseTime = env.release || 0.5;
      const noteDuration = 2;
      const startTime = ctx.currentTime;
      const endTime = startTime + noteDuration;
      const releaseStart = endTime - releaseTime;
      const nodes: AudioNode[] = [];

      if (patch.synth_type === "FMSynth" || patch.synth_type === "AMSynth") {
        // FM/AM: carrier + modulator oscillators
        const carrier = ctx.createOscillator();
        carrier.type = oscType as OscillatorType;
        const modulator = ctx.createOscillator();
        modulator.type = "sine";
        modulator.frequency.value = freq * 2; // harmonicity=2

        const modGain = ctx.createGain();
        modGain.gain.value = 3; // modulation index
        const envGain = ctx.createGain();

        modulator.connect(modGain);
        modGain.connect(carrier.frequency);

        carrier.connect(envGain);
        envGain.connect(ctx.destination);

        envGain.gain.setValueAtTime(0, startTime);
        envGain.gain.linearRampToValueAtTime(velocity, startTime + attackTime);
        envGain.gain.setValueAtTime(velocity * sustainLevel, releaseStart);
        envGain.gain.linearRampToValueAtTime(0, endTime);

        carrier.start(startTime);
        modulator.start(startTime);
        carrier.stop(endTime + 0.1);
        modulator.stop(endTime + 0.1);

        nodes.push(carrier, modulator, modGain, envGain);
      } else if (patch.synth_type === "PluckSynth") {
        // Pluck: noise burst through bandpass
        const bufferSize = ctx.sampleRate * 0.05;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
        }

        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = freq;
        filter.Q.value = 0.7;

        const envGain = ctx.createGain();
        envGain.gain.setValueAtTime(velocity, startTime);
        envGain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.5);

        noiseSource.connect(filter);
        filter.connect(envGain);
        envGain.connect(ctx.destination);

        noiseSource.start(startTime);
        nodes.push(noiseSource, filter, envGain);
      } else {
        // Basic synth: oscillator + filter + envelope
        const osc = ctx.createOscillator();
        osc.type = oscType as OscillatorType;
        osc.frequency.setValueAtTime(freq, startTime);

        let filterNode: BiquadFilterNode | null = null;
        if (patch.filter && patch.filter.type) {
          filterNode = ctx.createBiquadFilter();
          filterNode.type = patch.filter.type as BiquadFilterType;
          filterNode.frequency.value = patch.filter.frequency || 8000;
          filterNode.Q.value = patch.filter.Q || 1;
        }

        const envGain = ctx.createGain();
        envGain.gain.setValueAtTime(0, startTime);
        envGain.gain.linearRampToValueAtTime(velocity, startTime + attackTime);
        envGain.gain.setValueAtTime(velocity * sustainLevel, releaseStart);
        envGain.gain.linearRampToValueAtTime(0, endTime);

        osc.connect(filterNode || envGain);
        if (filterNode) filterNode.connect(envGain);
        envGain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(endTime + 0.1);

        nodes.push(osc);
        if (filterNode) nodes.push(filterNode);
        nodes.push(envGain);
      }

      synthRef.current = {
        nodes,
        stop: () => {
          const now = ctx.currentTime;
          for (const node of nodes) {
            if (node instanceof AudioScheduledSourceNode) {
              try { node.stop(now); } catch {}
            }
            try { node.disconnect(); } catch {}
          }
        },
      };
    } catch {
      setPreviewPlaying(false);
    }
  }, [patch, previewNote, previewPlaying]);

  const stopPreview = useCallback(() => {
    if (synthRef.current) {
      synthRef.current.stop();
    }
    setPreviewPlaying(false);
  }, []);

  const saveCurrentPatch = useCallback(() => {
    if (!patch) return;
    const saved: SavedPatch = {
      id: crypto.randomUUID(),
      name: patch.name,
      category: patch.category,
      patch,
      savedAt: new Date().toISOString(),
    };
    const updated = [saved, ...savedPatches.filter((p) => p.id !== saved.id)];
    setSavedPatches(updated);
    savePatchesToStorage(updated);
  }, [patch, savedPatches]);

  const loadPatch = useCallback((saved: SavedPatch) => {
    setPatch(saved.patch);
    setReasoning([
      { type: "status", text: `Loaded: ${saved.name}` },
      { type: "reasoning", text: `Category: ${saved.category}` },
      { type: "complete", text: `Loaded from presets (${new Date(saved.savedAt).toLocaleString()})` },
    ]);
    setShowSaved(false);
  }, []);

  const deleteSavedPatch = useCallback(
    (id: string) => {
      const updated = savedPatches.filter((p) => p.id !== id);
      setSavedPatches(updated);
      savePatchesToStorage(updated);
    },
    [savedPatches],
  );

  const previewMidiNote = 69 + (previewNote - 69) * 2;

  return (
    <div
      style={{
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        padding: 12,
        marginTop: 8,
      }}
    >
      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.accent }}>
          🎛 Synth Patch Designer
        </span>
        <span style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: 8 }}>
          Generate synth patches from text descriptions
        </span>
      </div>

      {/* Input & Generate */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input
          type="text"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && generatePatch()}
          placeholder="Describe a sound (e.g. 'dark rolling sub bass')"
          style={{
            flex: 1,
            padding: "6px 10px",
            fontSize: 12,
            background: COLORS.bg,
            color: COLORS.text,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 4,
          }}
        />
        <button
          onClick={generatePatch}
          disabled={isLoading || !brief.trim()}
          style={{
            padding: "6px 14px",
            fontSize: 11,
            fontWeight: 600,
            border: "none",
            borderRadius: 4,
            background: isLoading || !brief.trim() ? "#333" : COLORS.accent,
            color: isLoading || !brief.trim() ? "#666" : "#000",
            cursor: isLoading || !brief.trim() ? "not-allowed" : "pointer",
          }}
        >
          {isLoading ? "Generating..." : "Generate"}
        </button>
      </div>

      {/* Reasoning Trace */}
      {reasoning.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <ReasoningTrace steps={reasoning} title="Sound Design" maxHeight={100} />
        </div>
      )}

      {/* Patch Display */}
      {patch && (
        <div
          style={{
            border: `1px solid ${COLORS.border}`,
            borderRadius: 4,
            padding: 10,
            marginBottom: 8,
          }}
        >
          {/* Patch Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: CATEGORY_COLORS[patch.category] || COLORS.text,
                }}
              >
                {patch.name}
              </span>
              <span
                style={{
                  fontSize: 10,
                  padding: "2px 6px",
                  borderRadius: 3,
                  background: CATEGORY_COLORS[patch.category]
                    ? `${CATEGORY_COLORS[patch.category]}22`
                    : COLORS.accentDim,
                  color: CATEGORY_COLORS[patch.category] || COLORS.accent,
                  textTransform: "uppercase",
                }}
              >
                {patch.category}
              </span>
              <span style={{ fontSize: 10, color: COLORS.textMuted }}>
                {patch.synth_type}
              </span>
            </div>

            {/* Preview Controls */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="range"
                min={24}
                max={96}
                value={previewNote}
                onChange={(e) => setPreviewNote(Number(e.target.value))}
                style={{ width: 80, accentColor: COLORS.accent }}
                title={`Preview note: ${previewMidiNote} (MIDI ${previewNote})`}
              />
              <button
                onClick={previewPlaying ? stopPreview : previewPatch}
                style={{
                  padding: "4px 10px",
                  fontSize: 10,
                  fontWeight: 600,
                  border: "none",
                  borderRadius: 4,
                  background: previewPlaying ? COLORS.error : COLORS.success,
                  color: "#000",
                  cursor: "pointer",
                  minWidth: 50,
                }}
              >
                {previewPlaying ? "Stop" : "Play"}
              </button>
              <button
                onClick={saveCurrentPatch}
                style={{
                  padding: "4px 8px",
                  fontSize: 10,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 4,
                  background: "transparent",
                  color: COLORS.text,
                  cursor: "pointer",
                }}
                title="Save patch to presets"
              >
                💾
              </button>
            </div>
          </div>

          {/* Oscillators */}
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 600 }}>
              Oscillators
            </span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              {patch.oscillators.map((osc, i) => (
                <span
                  key={i}
                  style={{
                    padding: "2px 6px",
                    fontSize: 10,
                    background: COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 3,
                    color: COLORS.text,
                  }}
                >
                  {osc.type}
                  {osc.detune ? ` (${osc.detune}¢)` : ""}
                  {osc.spread ? ` spread:${osc.spread}` : ""}
                </span>
              ))}
            </div>
          </div>

          {/* Filter */}
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 600 }}>
              Filter
            </span>
            <div style={{ marginTop: 4, fontSize: 10, color: COLORS.text }}>
              {patch.filter.type} @ {patch.filter.frequency}Hz
              {patch.filter.Q ? ` (Q: ${patch.filter.Q})` : ""}
              {patch.filter.resonance ? ` (res: ${patch.filter.resonance})` : ""}
            </div>
          </div>

          {/* ADSR Envelope */}
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 600 }}>
              Envelope (ADSR)
            </span>
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 4,
              }}
            >
              {[
                { label: "A", value: patch.envelope.attack },
                { label: "D", value: patch.envelope.decay },
                { label: "S", value: patch.envelope.sustain },
                { label: "R", value: patch.envelope.release },
              ].map((p) => (
                <div
                  key={p.label}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    padding: "3px 0",
                    background: COLORS.bg,
                    borderRadius: 3,
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <span style={{ fontSize: 9, color: COLORS.textMuted, display: "block" }}>
                    {p.label}
                  </span>
                  <span style={{ fontSize: 11, color: COLORS.text, fontWeight: 600 }}>
                    {p.value.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* LFOs */}
          {patch.lfos.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 600 }}>
                LFOs ({patch.lfos.length})
              </span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                {patch.lfos.map((lfo, i) => (
                  <span
                    key={i}
                    style={{
                      padding: "2px 6px",
                      fontSize: 10,
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 3,
                      color: COLORS.text,
                    }}
                  >
                    {lfo.type} → {lfo.target} ({lfo.frequency}Hz, depth:{lfo.depth})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Effects */}
          {patch.effects.length > 0 && (
            <div>
              <span style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: 600 }}>
                Effects ({patch.effects.length})
              </span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                {patch.effects.map((fx, i) => (
                  <span
                    key={i}
                    style={{
                      padding: "2px 6px",
                      fontSize: 10,
                      background: COLORS.bg,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 3,
                      color: COLORS.text,
                    }}
                  >
                    {fx.type}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Saved Patches Toggle */}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={() => setShowSaved(!showSaved)}
          style={{
            padding: "4px 10px",
            fontSize: 10,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 4,
            background: showSaved ? COLORS.accentDim : "transparent",
            color: COLORS.text,
            cursor: "pointer",
          }}
        >
          {showSaved ? "Hide" : "Show"} Presets ({savedPatches.length})
        </button>
      </div>

      {/* Saved Patches List */}
      {showSaved && (
        <div
          style={{
            marginTop: 8,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 4,
            padding: 8,
            maxHeight: 200,
            overflowY: "auto",
          }}
        >
          {savedPatches.length === 0 ? (
            <span style={{ fontSize: 10, color: COLORS.textMuted }}>
              No saved patches yet. Generate a patch and click 💾 to save.
            </span>
          ) : (
            savedPatches.map((saved) => (
              <div
                key={saved.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "4px 6px",
                  marginBottom: 4,
                  background: COLORS.bg,
                  borderRadius: 3,
                  cursor: "pointer",
                }}
                onClick={() => loadPatch(saved)}
              >
                <div>
                  <span
                    style={{
                      fontSize: 11,
                      color: CATEGORY_COLORS[saved.category] || COLORS.text,
                      fontWeight: 600,
                    }}
                  >
                    {saved.name}
                  </span>
                  <span style={{ fontSize: 9, color: COLORS.textMuted, marginLeft: 6 }}>
                    {saved.category}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSavedPatch(saved.id);
                  }}
                  style={{
                    padding: "2px 6px",
                    fontSize: 9,
                    border: "none",
                    borderRadius: 3,
                    background: COLORS.error,
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
