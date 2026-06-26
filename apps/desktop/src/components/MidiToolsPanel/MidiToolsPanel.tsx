import { useState } from "react";
import type { MidiNote } from "../../../../../packages/core-models/index";
import { commonStyles, BEEHIVE } from "../../lib/theme";
import {
  constrainToScale,
  generateChords,
  arpeggiate,
  applyGroove,
  quantizeNotes,
  KEY_ROOTS,
  SCALE_INTERVALS,
  type ArpStyle,
} from "../../lib/musicTheory";

interface MidiToolsPanelProps {
  notes: MidiNote[];
  // Apply a transform; routes through updateClipMidiNotes (undoable via M3).
  onChange: (notes: MidiNote[]) => void;
}

const KEYS = Object.keys(KEY_ROOTS).filter((k) => k.length === 1 || k.includes("#"));
const SCALES = Object.keys(SCALE_INTERVALS);

export function MidiToolsPanel({ notes, onChange }: MidiToolsPanelProps) {
  const [key, setKey] = useState("C");
  const [scale, setScale] = useState("minor");
  const [arpStyle, setArpStyle] = useState<ArpStyle>("up");
  const [swing, setSwing] = useState(0.5);
  const [grid, setGrid] = useState(0.25);

  const disabled = notes.length === 0;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 6,
        padding: 8,
        background: "var(--jb-toolbar-bg)",
        borderBottom: "1px solid var(--jb-border)",
        fontSize: 11,
      }}
    >
      <span style={{ color: BEEHIVE.textMuted, fontWeight: 600 }}>MIDI Tools</span>

      <select aria-label="Key" value={key} onChange={(e) => setKey(e.target.value)} style={selectStyle}>
        {KEYS.map((k) => (
          <option key={k} value={k}>{k}</option>
        ))}
      </select>
      <select aria-label="Scale" value={scale} onChange={(e) => setScale(e.target.value)} style={selectStyle}>
        {SCALES.map((s) => (
          <option key={s} value={s}>{s.replace("_", " ")}</option>
        ))}
      </select>
      <button className="jetbee-toolbtn" disabled={disabled} onClick={() => onChange(constrainToScale(notes, key, scale))}>
        Scale
      </button>
      <button className="jetbee-toolbtn" disabled={disabled} onClick={() => onChange(generateChords(notes, key, scale, "triad"))}>
        Chords
      </button>
      <button className="jetbee-toolbtn" disabled={disabled} onClick={() => onChange(generateChords(notes, key, scale, "seventh"))}>
        7ths
      </button>

      <div style={{ width: 1, height: 14, background: "var(--jb-border)" }} />

      <select aria-label="Arp style" value={arpStyle} onChange={(e) => setArpStyle(e.target.value as ArpStyle)} style={selectStyle}>
        <option value="up">up</option>
        <option value="down">down</option>
        <option value="updown">up/down</option>
        <option value="random">random</option>
      </select>
      <button className="jetbee-toolbtn" disabled={disabled} onClick={() => onChange(arpeggiate(notes, arpStyle, grid))}>
        Arp
      </button>

      <div style={{ width: 1, height: 14, background: "var(--jb-border)" }} />

      <select aria-label="Quantize grid" value={grid} onChange={(e) => setGrid(parseFloat(e.target.value))} style={selectStyle}>
        <option value={1}>1/4</option>
        <option value={0.5}>1/8</option>
        <option value={0.25}>1/16</option>
      </select>
      <button className="jetbee-toolbtn" disabled={disabled} onClick={() => onChange(quantizeNotes(notes, grid))}>
        Quantize
      </button>

      <div style={{ width: 1, height: 14, background: "var(--jb-border)" }} />

      <label style={{ color: BEEHIVE.textMuted, display: "flex", alignItems: "center", gap: 4 }}>
        Swing
        <input
          type="range"
          aria-label="Swing"
          min={0}
          max={1}
          step={0.05}
          value={swing}
          onChange={(e) => setSwing(parseFloat(e.target.value))}
          style={{ width: 50 }}
        />
      </label>
      <button className="jetbee-toolbtn" disabled={disabled} onClick={() => onChange(applyGroove(notes, { swing }))}>
        Groove
      </button>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  ...commonStyles.input,
  fontSize: 11,
  padding: "2px 4px",
  width: "auto",
};
