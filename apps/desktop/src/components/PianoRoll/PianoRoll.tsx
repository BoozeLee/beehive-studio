import React, { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { BEEHIVE, commonStyles } from "../../lib/theme";

interface MidiNote {
  id: string;
  pitch: number;
  velocity: number;
  start: number;
  duration: number;
}

interface PianoRollProps {
  notes: MidiNote[];
  onChange: (notes: MidiNote[]) => void;
  isPlaying?: boolean;
  currentBeat?: number;
  snapToGrid?: boolean;
  gridDivision?: number;
}

type Tool = "pencil" | "select" | "erase";

const KEY_ORDER = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0]; // 0=white, 1=black
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const WHITE_KEY_W = 50;
const KEY_H = 16;
const PX_PER_BEAT = 80;
const ROWS_START = 24;
const ROWS_END = 84;
const NUM_KEYS = ROWS_END - ROWS_START;

export function PianoRoll({
  notes,
  onChange,
  isPlaying = false,
  currentBeat = 0,
  snapToGrid = true,
  gridDivision = 0.25,
}: PianoRollProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>("pencil");
  const [zoom, setZoom] = useState(PX_PER_BEAT);
  const [scrollY, setScrollY] = useState(0);
  const [scrollX, setScrollX] = useState(0);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{
    type: "new" | "move" | "resize" | "select" | null;
    noteId?: string;
    startX?: number;
    startY?: number;
    origStart?: number;
    origPitch?: number;
    origDuration?: number;
    origVelocity?: number;
  }>({ type: null });

  const headerH = 30;

  const snap = useCallback(
    (val: number) => {
      if (!snapToGrid) return val;
      return Math.round(val / gridDivision) * gridDivision;
    },
    [snapToGrid, gridDivision]
  );

  const pitchFromY = useCallback(
    (y: number) => {
      const row = Math.floor((y - headerH + scrollY) / KEY_H);
      return Math.max(ROWS_START, Math.min(ROWS_END - 1, ROWS_END - 1 - row));
    },
    [scrollY]
  );

  const beatFromX = useCallback(
    (x: number) => {
      const raw = (x + scrollX) / zoom;
      return Math.max(0, snap(raw));
    },
    [zoom, scrollX, snap]
  );

  const noteToRect = useCallback(
    (note: MidiNote) => {
      const row = ROWS_END - 1 - note.pitch;
      return {
        x: note.start * zoom - scrollX,
        y: row * KEY_H + headerH - scrollY,
        w: Math.max(note.duration * zoom, 4),
        h: KEY_H - 2,
      };
    },
    [zoom, scrollX, scrollY]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = BEEHIVE.bg;
    ctx.fillRect(0, 0, w, h);

    // Grid lines (vertical — beats)
    const firstBeat = Math.max(0, Math.floor(scrollX / zoom));
    const lastBeat = Math.ceil((scrollX + w) / zoom);
    for (let b = firstBeat; b <= lastBeat; b++) {
      const x = b * zoom - scrollX;
      ctx.strokeStyle = b % 4 === 0 ? "rgba(42,31,24,0.6)" : "rgba(42,31,24,0.25)";
      ctx.lineWidth = b % 4 === 0 ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Grid lines (horizontal — pitch rows)
    const firstRow = Math.max(0, Math.floor(scrollY / KEY_H));
    const lastRow = Math.min(NUM_KEYS, Math.ceil((scrollY + h) / KEY_H));
    for (let r = firstRow; r <= lastRow; r++) {
      const y = r * KEY_H + headerH - scrollY;
      const pitch = ROWS_END - 1 - r;
      const isWhite = KEY_ORDER[pitch % 12] === 0;
      ctx.fillStyle = isWhite
        ? (r % 2 === 0 ? "#14100E" : "#1A1410")
        : "#0F0A08";
      ctx.fillRect(0, y, w, KEY_H);
      ctx.strokeStyle = BEEHIVE.border;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y + KEY_H);
      ctx.lineTo(w, y + KEY_H);
      ctx.stroke();

      // C markers
      if (pitch % 12 === 0) {
        ctx.fillStyle = BEEHIVE.comb;
        ctx.font = "9px system-ui";
        ctx.fillText(`C${Math.floor(pitch / 12) - 1}`, 4, y + KEY_H - 4);
      }
    }

    // Playhead
    if (isPlaying) {
      const px = currentBeat * zoom - scrollX;
      ctx.strokeStyle = BEEHIVE.honey;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
      ctx.fillStyle = BEEHIVE.honey;
      ctx.beginPath();
      ctx.arc(px, headerH, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Notes
    for (const note of notes) {
      const { x, y, w: nw, h: nh } = noteToRect(note);
      if (x + nw < 0 || x > w) continue;
      if (y + nh < 0 || y > h) continue;

      const isSelected = note.id === selectedNoteId;
      const vel = note.velocity / 127;

      // Note body
      const grad = ctx.createLinearGradient(x, y, x + nw, y);
      grad.addColorStop(0, isSelected ? BEEHIVE.honey : BEEHIVE.comb);
      grad.addColorStop(1, isSelected ? BEEHIVE.comb : BEEHIVE.amber);
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.6 + vel * 0.4;
      ctx.beginPath();
      ctx.roundRect(x, y, nw, nh, 3);
      ctx.fill();

      // Velocity indicator
      ctx.fillStyle = BEEHIVE.pollen;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(x, y + nh - 3, nw * vel, 3);
      ctx.globalAlpha = 1;

      // Selection border
      if (isSelected) {
        ctx.strokeStyle = BEEHIVE.honey;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x, y, nw, nh, 3);
        ctx.stroke();
      }

      // Note name on long notes
      if (nw > 30) {
        ctx.fillStyle = "#000";
        ctx.font = "9px system-ui";
        ctx.globalAlpha = 0.7;
        const nn = NOTE_NAMES[note.pitch % 12] + Math.floor(note.pitch / 12 - 1);
        ctx.fillText(nn, x + 4, y + KEY_H / 2 + 3);
        ctx.globalAlpha = 1;
      }
    }

    // Header bar
    ctx.fillStyle = BEEHIVE.panel;
    ctx.fillRect(0, 0, w, headerH);
    ctx.strokeStyle = BEEHIVE.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, headerH);
    ctx.lineTo(w, headerH);
    ctx.stroke();

    // Beat numbers in header
    ctx.fillStyle = BEEHIVE.textMuted;
    ctx.font = "10px system-ui";
    for (let b = firstBeat; b <= lastBeat; b++) {
      if (b % 4 === 0) {
        const x = b * zoom - scrollX;
        ctx.fillText(`${b / 4 + 1}`, x + 4, headerH - 6);
      }
    }
  }, [notes, zoom, scrollX, scrollY, isPlaying, currentBeat, selectedNoteId, noteToRect]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Find note at position
  const findNote = useCallback(
    (x: number, y: number) => {
      for (let i = notes.length - 1; i >= 0; i--) {
        const { x: nx, y: ny, w, h } = noteToRect(notes[i]);
        if (x >= nx && x <= nx + w && y >= ny && y <= ny + h) {
          return { note: notes[i], index: i };
        }
      }
      return null;
    },
    [notes, noteToRect]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const hit = findNote(mx, my);

      if (tool === "select") {
        if (hit) {
          setSelectedNoteId(hit.note.id);
          setDragState({
            type: "move",
            noteId: hit.note.id,
            startX: mx,
            startY: my,
            origStart: hit.note.start,
            origPitch: hit.note.pitch,
          });
        } else {
          setSelectedNoteId(null);
          setDragState({ type: "select", startX: mx, startY: my });
        }
      } else if (tool === "pencil") {
        if (hit) {
          // Click on existing note in pencil mode -> select
          setSelectedNoteId(hit.note.id);
          // Check if near right edge for resize
          if (mx - hit.note.start * zoom + scrollX > hit.note.duration * zoom - 8) {
            setDragState({
              type: "resize",
              noteId: hit.note.id,
              startX: mx,
              origDuration: hit.note.duration,
            });
          } else {
            setDragState({
              type: "move",
              noteId: hit.note.id,
              startX: mx,
              startY: my,
              origStart: hit.note.start,
              origPitch: hit.note.pitch,
            });
          }
        } else {
          // Create new note
          const pitch = pitchFromY(my);
          const start = beatFromX(mx);
          const newNote: MidiNote = {
            id: crypto.randomUUID(),
            pitch,
            velocity: 100,
            start,
            duration: gridDivision,
          };
          onChange([...notes, newNote]);
          setSelectedNoteId(newNote.id);
          setDragState({
            type: "move",
            noteId: newNote.id,
            startX: mx,
            startY: my,
            origStart: start,
            origPitch: pitch,
          });
        }
      } else if (tool === "erase") {
        if (hit) {
          onChange(notes.filter((n) => n.id !== hit.note.id));
        }
      }
    },
    [tool, notes, onChange, findNote, pitchFromY, beatFromX, zoom, scrollX, gridDivision]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!dragState.type || !dragState.noteId) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (dragState.type === "move") {
        const dxBeats = (mx - (dragState.startX ?? 0)) / zoom;
        const dyPitch = Math.round((my - (dragState.startY ?? 0)) / KEY_H);
        const newNotes = notes.map((n) => {
          if (n.id === dragState.noteId) {
            const newStart = Math.max(0, snap((dragState.origStart ?? 0) + dxBeats));
            const newPitch = Math.max(0, Math.min(127, (dragState.origPitch ?? 60) - dyPitch));
            return { ...n, start: newStart, pitch: newPitch };
          }
          return n;
        });
        onChange(newNotes);
      } else if (dragState.type === "resize") {
        const dxBeats = (mx - (dragState.startX ?? 0)) / zoom;
        const newDuration = Math.max(gridDivision, snap((dragState.origDuration ?? 0.25) + dxBeats));
        const newNotes = notes.map((n) => {
          if (n.id === dragState.noteId) {
            return { ...n, duration: newDuration };
          }
          return n;
        });
        onChange(newNotes);
      }
    },
    [dragState, notes, onChange, zoom, snap, gridDivision]
  );

  const handleMouseUp = useCallback(() => {
    setDragState({ type: null });
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.shiftKey) {
      setScrollX((s) => Math.max(0, s + e.deltaY));
    } else {
      setScrollY((s) => Math.max(0, s + e.deltaY));
    }
  }, []);

  const noteMap = useMemo(() => {
    const map: Record<string, MidiNote> = {};
    for (const n of notes) map[n.id] = n;
    return map;
  }, [notes]);

  return (
    <div
      style={{
        border: `1px solid ${BEEHIVE.border}`,
        borderRadius: 8,
        overflow: "hidden",
        background: BEEHIVE.bg,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderBottom: `1px solid ${BEEHIVE.border}`,
          background: BEEHIVE.panel,
        }}
      >
        <span style={{ fontSize: 11, color: BEEHIVE.textMuted }}>
          Piano Roll
        </span>
        <div style={{ flex: 1 }} />
        {(["pencil", "select", "erase"] as Tool[]).map((t) => (
          <button
            key={t}
            onClick={() => setTool(t)}
            style={{
              ...commonStyles.toolBtn,
              background: tool === t ? BEEHIVE.comb : BEEHIVE.panel,
              color: tool === t ? "#000" : BEEHIVE.text,
              fontWeight: tool === t ? 700 : 400,
            }}
          >
            {t === "pencil" ? "✏️ Pencil" : t === "select" ? "⬆️ Select" : "🧹 Erase"}
          </button>
        ))}
        <div style={{ width: 1, height: 16, background: BEEHIVE.border }} />
        <button
          onClick={() => setZoom(zoom * 1.25)}
          style={commonStyles.toolBtn}
        >
          +
        </button>
        <span style={{ fontSize: 10, color: BEEHIVE.textMuted, minWidth: 40 }}>
          {zoom.toFixed(0)}px
        </span>
        <button
          onClick={() => setZoom(zoom / 1.25)}
          style={commonStyles.toolBtn}
        >
          −
        </button>
        {selectedNoteId && noteMap[selectedNoteId] && (() => {
          const n = noteMap[selectedNoteId];
          const nn = NOTE_NAMES[n.pitch % 12] + Math.floor(n.pitch / 12 - 1);
          return (
            <>
              <div style={{ width: 1, height: 16, background: BEEHIVE.border }} />
              <span style={{ fontSize: 10, color: BEEHIVE.comb, fontWeight: 700 }}>
                {nn}
              </span>
              <span style={{ fontSize: 10, color: BEEHIVE.textMuted }}>
                Vel: {n.velocity}
              </span>
              <input
                type="range"
                min={1}
                max={127}
                value={n.velocity}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  onChange(notes.map((x) => (x.id === n.id ? { ...x, velocity: v } : x)));
                }}
                style={{ width: 60 }}
              />
            </>
          );
        })()}
      </div>

      {/* Piano Roll Grid */}
      <div
        style={{
          display: "flex",
          flex: 1,
          overflow: "hidden",
          position: "relative",
          height: 300,
        }}
      >
        {/* Keyboard */}
        <div
          style={{
            width: WHITE_KEY_W,
            flexShrink: 0,
            borderRight: `1px solid ${BEEHIVE.border}`,
            overflow: "hidden",
            position: "relative",
            background: BEEHIVE.bg,
            zIndex: 2,
          }}
        >
          <div style={{ height: headerH, borderBottom: `1px solid ${BEEHIVE.border}`, background: BEEHIVE.panel }} />
          <div style={{ transform: `translateY(-${scrollY}px)` }}>
            {Array.from({ length: NUM_KEYS }, (_, i) => {
              const pitch = ROWS_END - 1 - i;
              const isWhite = KEY_ORDER[pitch % 12] === 0;
              const name = NOTE_NAMES[pitch % 12];
              const isC = name === "C";
              return (
                <div
                  key={pitch}
                  style={{
                    height: KEY_H,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: isWhite
                      ? (i % 2 === 0 ? "#1A1410" : "#14100E")
                      : "#0F0A08",
                    borderBottom: `0.5px solid ${BEEHIVE.border}`,
                    position: "relative",
                  }}
                >
                  {isC && (
                    <span style={{ fontSize: 8, color: BEEHIVE.textMuted, opacity: 0.5 }}>
                      {name}{Math.floor(pitch / 12) - 1}
                    </span>
                  )}
                  {!isWhite && (
                    <div
                      style={{
                        position: "absolute",
                        left: -6,
                        top: 0,
                        width: 8,
                        height: KEY_H,
                        background: BEEHIVE.smoke,
                        borderBottom: `0.5px solid ${BEEHIVE.border}`,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Canvas Grid */}
        <div
          ref={gridRef}
          style={{ flex: 1, overflow: "hidden", position: "relative" }}
          onWheel={handleWheel}
        >
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{
              width: "100%",
              height: "100%",
              cursor: tool === "pencil" ? "crosshair" : tool === "erase" ? "pointer" : "default",
            }}
          />
        </div>
      </div>
    </div>
  );
}
