import React, { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { BEEHIVE, commonStyles } from "../../../lib/theme";

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

const KEY_ORDER = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
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

    ctx.fillStyle = BEEHIVE.bg;
    ctx.fillRect(0, 0, w, h);

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

      if (pitch % 12 === 0) {
        ctx.fillStyle = BEEHIVE.comb;
        ctx.font = "9px system-ui";
        ctx.fillText(`C${Math.floor(pitch / 12) - 1}`, 4, y + KEY_H - 4);
      }
    }

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

    for (const note of notes) {
      const { x, y, w: nw, h: nh } = noteToRect(note);
      if (x + nw < 0 || x > w) continue;
      if (y + nh < 0 || y > h) continue;

      const isSelected = note.id === selectedNoteId;
      const vel = note.velocity / 127;

      const grad = ctx.createLinearGradient(x, y, x + nw, y);
      grad.addColorStop(0, isSelected ? BEEHIVE.honey : BEEHIVE.comb);
      grad.addColorStop(1, isSelected ? BEEHIVE.comb : BEEHIVE.amber);
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.6 + vel * 0.4;
      ctx.beginPath();
      (ctx as any).roundRect(x, y, nw, nh, 3);
      ctx.fill();

      ctx.fillStyle = BEEHIVE.pollen;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(x, y + nh - 3, nw * vel, 3);
      ctx.globalAlpha = 1;

      if (isSelected) {
        ctx.strokeStyle = BEEHIVE.honey;
        ctx.lineWidth = 2;
        ctx.beginPath();
        (ctx as any).roundRect(x, y, nw, nh, 3);
        ctx.stroke();
      }

      if (nw > 30) {
        ctx.fillStyle = "#000";
        ctx.font = "9px system-ui";
        ctx.globalAlpha = 0.7;
        const nn = NOTE_NAMES[note.pitch % 12] + Math.floor(note.pitch / 12 - 1);
        ctx.fillText(nn, x + 4, y + KEY_H / 2 + 3);
        ctx.globalAlpha = 1;
      }
    }

    ctx.fillStyle = BEEHIVE.panel;
    ctx.fillRect(0, 0, w, headerH);
    ctx.strokeStyle = BEEHIVE.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, headerH);
    ctx.lineTo(w, headerH);
    ctx.stroke();

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
          setSelectedNoteId(hit.note.id);
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
          const start = beatFromX(mx);
          const pitch = pitchFromY(my);
          const id = `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const newNote: MidiNote = {
            id,
            pitch,
            velocity: 100,
            start,
            duration: gridDivision,
          };
          onChange([...notes, newNote]);
          setSelectedNoteId(id);
          setDragState({ type: "resize", noteId: id, startX: mx, origDuration: gridDivision });
        }
      } else if (tool === "erase") {
        if (hit) {
          onChange(notes.filter((n) => n.id !== hit.note.id));
        }
        setSelectedNoteId(null);
      }
    },
    [tool, notes, findNote, beatFromX, pitchFromY, gridDivision, onChange, zoom, scrollX]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!dragState.type) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (dragState.type === "move" && dragState.noteId) {
        const dxBeats = (mx - (dragState.startX || 0)) / zoom;
        const dyRows = (my - (dragState.startY || 0)) / KEY_H;
        const newStart = Math.max(0, snap((dragState.origStart || 0) + dxBeats));
        const newPitch = Math.max(
          ROWS_START,
          Math.min(ROWS_END - 1, (dragState.origPitch || 0) - Math.round(dyRows))
        );
        onChange(
          notes.map((n) =>
            n.id === dragState.noteId ? { ...n, start: newStart, pitch: newPitch } : n
          )
        );
      } else if (dragState.type === "resize" && dragState.noteId) {
        const dxBeats = (mx - (dragState.startX || 0)) / zoom;
        const note = notes.find((n) => n.id === dragState.noteId);
        if (!note) return;
        const newDuration = Math.max(gridDivision, snap((dragState.origDuration || 0) + dxBeats));
        onChange(notes.map((n) => (n.id === dragState.noteId ? { ...n, duration: newDuration } : n)));
      } else if (dragState.type === "new") {
        const note = notes.find((n) => n.id === dragState.noteId);
        if (!note) return;
        const start = Math.min(note.start, beatFromX(mx));
        const duration = Math.max(gridDivision, snap(Math.abs(beatFromX(mx) - note.start)));
        onChange(notes.map((n) => (n.id === dragState.noteId ? { ...n, start, duration } : n)));
      }
    },
    [dragState, notes, onChange, zoom, snap, gridDivision, beatFromX]
  );

  const handleMouseUp = useCallback(() => {
    setDragState({ type: null });
  }, []);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.shiftKey) {
        setScrollX((prev) => Math.max(0, prev + e.deltaY));
      } else {
        setScrollY((prev) => Math.max(0, prev + e.deltaY));
      }
    };
    el.addEventListener("wheel", onWheel);
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      ref={gridRef}
      style={{
        border: `1px solid ${BEEHIVE.border}`,
        borderRadius: 8,
        background: BEEHIVE.bg,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderBottom: `1px solid ${BEEHIVE.border}`,
          background: BEEHIVE.panel,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, color: BEEHIVE.textMuted }}>Piano Roll</span>
        <div style={{ flex: 1 }} />
        {(["pencil", "select", "erase"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTool(t)}
            style={{
              ...commonStyles.toolBtn,
              background: tool === t ? BEEHIVE.comb : BEEHIVE.panel,
              color: tool === t ? "#000" : BEEHIVE.text,
            }}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
        <label style={{ fontSize: 11, color: BEEHIVE.textMuted, display: "flex", alignItems: "center", gap: 4 }}>
          Zoom
          <input
            type="range"
            min={40}
            max={160}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ width: 80 }}
          />
        </label>
      </div>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ flex: 1, width: "100%", cursor: tool === "erase" ? "not-allowed" : "crosshair" }}
      />
    </div>
  );
}
