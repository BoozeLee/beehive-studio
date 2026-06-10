import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";

interface MidiNote {
  pitch: number;
  velocity: number;
  start: number;
  duration: number;
  id?: string;
}

interface MidiClipData {
  notes: MidiNote[];
  controlChanges?: Array<{ time: number; controller: number; value: number }>;
}

const COLORS = {
  bg: "#0f0f12",
  panel: "#18181c",
  border: "#2a2a30",
  accent: "#ff8c42",
  text: "#e0e0e0",
  textMuted: "#888",
  note: "#4ade80",
  noteSelected: "#fbbf24",
  noteHover: "#60a5fa",
  grid: "rgba(255,255,255,0.06)",
  playhead: "#ff8c42",
  keyboard: "rgba(255,255,255,0.03)",
  keyboardActive: "rgba(255,255,255,0.1)",
};

interface PianoRollEditorProps {
  midiData: MidiClipData | undefined;
  onMidiChange: (midiData: MidiClipData) => void;
  currentBeat: number;
}

interface PianoRollEditorState {
  notes: MidiNote[]; // Working copy
  selectedNoteIds: Set<string>;
  hoveredNoteId: string | null;
  isDrawing: boolean;
  drawStart: { x: number; y: number } | null;
  resizeMode: "none" | "start" | "end" | "whole";
  resizeNoteId: string | null;
  scrollX: number;
  zoomX: number;   // horizontal zoom (beats per pixel)
  zoomY: number;   // vertical zoom (pixels per note)
}

const DEFAULT_STATE: PianoRollEditorState = {
  notes: [],
  selectedNoteIds: new Set(),
  hoveredNoteId: null,
  isDrawing: false,
  drawStart: null,
  resizeMode: "none",
  resizeNoteId: null,
  scrollX: 0,
  zoomX: 100,   // 100 pixels per beat
  zoomY: 20,    // 20 pixels per note
};

export const PianoRollEditor: React.FC<PianoRollEditorProps> = ({
  midiData,
  onMidiChange,
  currentBeat,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const keyboardRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  
  const [state, setState] = useState<PianoRollEditorState>(DEFAULT_STATE);
  
  // Initialize notes from props
  useEffect(() => {
    if (midiData) {
      setState(prev => ({
        ...prev,
        notes: [...midiData.notes],
      }));
    }
  }, [midiData]);
  
  // Send changes back to parent
  useEffect(() => {
    if (midiData) {
      onMidiChange({
        ...midiData,
        notes: [...state.notes],
      });
    }
  }, [state.notes, midiData, onMidiChange]);
  
  // Calculate visible range
  const visibleStart = useMemo(() => {
    return state.scrollX / state.zoomX;
  }, [state.scrollX, state.zoomX]);
  
  const visibleEnd = useMemo(() => {
    if (!containerRef.current) return visibleStart + 10;
    return visibleStart + (containerRef.current.clientWidth / state.zoomX);
  }, [visibleStart, state.zoomX, containerRef]);
  
  // Handle keyboard events for shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Cancel drawing
        setState(prev => ({ ...prev, isDrawing: false, drawStart: null }));
      } else if (e.key === "Delete" || e.key === "Backspace") {
        // Delete selected notes
        if (state.selectedNoteIds.size > 0) {
          setState(prev => {
            const newNotes = prev.notes.filter(
              note => !prev.selectedNoteIds.has(note.start.toString() + "-" + note.pitch.toString() + "-" + note.velocity.toString())
            );
            return { ...prev, notes: newNotes, selectedNoteIds: new Set() };
          });
        }
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.selectedNoteIds]);
  
  // Constants
  const NOTE_MIN_HEIGHT = 8; // minimum pixel height for a note
  
  // Convert beat/pixel to MIDI note
  const getNoteAtPosition = useCallback((x: number, y: number): MidiNote | null => {
    if (!notesRef.current) return null;
    
    const notesRect = notesRef.current.getBoundingClientRect();
    
    // Adjust for scroll
    const adjustedX = x - notesRect.left + state.scrollX;
    const adjustedY = y - notesRect.top;
    
    // Convert to beats and MIDI note
    const beat = adjustedX / state.zoomX;
    const midiNote = 127 - Math.floor(adjustedY / state.zoomY);
    
    // Find note at this position (with some tolerance)
    const tolerance = 0.5; // beats
    const noteTolerance = 0.5; // semitones
    
    for (const note of state.notes) {
      const noteStart = note.start;
      const notePitch = note.pitch;
      
      if (
        Math.abs(beat - noteStart) < tolerance &&
        Math.abs(midiNote - notePitch) < noteTolerance
      ) {
        return note;
      }
    }
    
    return null;
  }, [state.notes, state.zoomX, state.zoomY, state.scrollX]);
  
  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    const note = getNoteAtPosition(e.clientX, e.clientY);
    if (note) {
      // Check if clicking on edges for resize
      // For simplicity, we'll just select for now
      setState(prev => {
        const noteId = `${note.start}-${note.pitch}-${note.velocity}`;
        if (e.shiftKey) {
          const newSet = new Set(prev.selectedNoteIds);
          if (newSet.has(noteId)) {
            newSet.delete(noteId);
          } else {
            newSet.add(noteId);
          }
          return { ...prev, selectedNoteIds: newSet };
        } else {
          const noteId = `${note.start}-${note.pitch}-${note.velocity}`;
          if (!prev.selectedNoteIds.has(noteId)) {
            return { ...prev, selectedNoteIds: new Set([noteId]), hoveredNoteId: note.id ?? null };
          }
          return { ...prev, hoveredNoteId: note.id ?? null };
        }
      });
    } else {
      // Start drawing a new note
      setState(prev => {
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (!containerRect) return prev;
        
        const x = e.clientX - containerRect.left + state.scrollX;
        const y = e.clientY - containerRect.top;
        
        const beat = Math.round((x / state.zoomX) * 4) / 4; // snap to 16th notes
        const midiNote = 127 - Math.floor((y / state.zoomY) / 12) * 12; // snap to octave
        
        return {
          ...prev,
          isDrawing: true,
          drawStart: { x: beat, y: midiNote },
          selectedNoteIds: new Set(), // clear selection when drawing
        };
      });
    }
  }, [getNoteAtPosition, state.scrollX, state.zoomX, state.zoomY]);
  
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (!state.isDrawing || !state.drawStart) return;
    
    // Update preview note while drawing
    // For now, we'll just update on mouse up
    
    // Update hovered note
    const note = getNoteAtPosition(e.clientX, e.clientY);
    setState(prev => ({
      ...prev,
      hoveredNoteId: note ? `${note.start}-${note.pitch}-${note.velocity}` : null,
    }));
  }, [state.isDrawing, state.drawStart, getNoteAtPosition]);
  
  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (state.isDrawing && state.drawStart) {
      // Finish drawing the note
      setState(prev => {
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (!containerRect) return prev;
        
        const x = e.clientX - containerRect.left + state.scrollX;
        
        const endBeat = Math.round((x / state.zoomX) * 4) / 4; // snap to 16th notes
        
        // Ensure minimum duration
        const startBeat = Math.max(0, state.drawStart!.x);
        const duration = Math.max(0.25, Math.abs(endBeat - startBeat)); // min 16th note
        const midiNote = Math.min(127, Math.max(0, Math.round(state.drawStart!.y)));
        const velocity = 100; // default velocity
        
        const newNote: MidiNote = {
          pitch: midiNote,
          velocity,
          start: startBeat,
          duration,
        };
        
        return {
          ...prev,
          notes: [...prev.notes, newNote],
          isDrawing: false,
          drawStart: null,
          selectedNoteIds: new Set([
            `${newNote.start}-${newNote.pitch}-${newNote.velocity}`
          ]),
        };
      });
    }
  }, [state.isDrawing, state.drawStart]);
  
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    // Horizontal scroll with shift, vertical zoom with ctrl, horizontal zoom with alt
    if (e.ctrlKey) {
      // Vertical zoom
      e.preventDefault();
      const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
      setState(prev => ({
        ...prev,
        zoomY: Math.max(5, Math.min(50, prev.zoomY * zoomDelta)),
      }));
    } else if (e.altKey) {
      // Horizontal zoom
      e.preventDefault();
      const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
      setState(prev => ({
        ...prev,
        zoomX: Math.max(10, Math.min(500, prev.zoomX * zoomDelta)),
      }));
    } else if (e.shiftKey) {
      // Horizontal scroll
      e.preventDefault();
      setState(prev => ({
        ...prev,
        scrollX: Math.max(0, prev.scrollX + e.deltaY),
      }));
    } else {
      // Vertical scroll (default)
      setState(prev => ({
        ...prev,
        scrollX: Math.max(0, prev.scrollX + e.deltaY),
      }));
    }
  }, []);
  
  // Render helpers
  const renderKeyboard = useCallback(() => {
    interface PianoKey { midiNote: number; isBlack: boolean; x: number; width: number; key: string; }
    const keys: PianoKey[] = [];
    const whiteKeys = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
    const blackKeys = [1, 3, 6, 8, 10];       // C# D# F# G# A#
    
    // Show 10 octaves (C-1 to B9)
    for (let octave = -1; octave <= 9; octave++) {
      // White keys
      whiteKeys.forEach(note => {
        const midiNote = octave * 12 + note;
        const isBlack = false;
        keys.push({
          midiNote,
          isBlack,
          x: (midiNote % 12) * 20 + (whiteKeys.indexOf(note) * 2),
          width: 20,
          key: `w-${midiNote}`,
        });
      });
      
      // Black keys
      blackKeys.forEach(note => {
        const midiNote = octave * 12 + note;
        keys.push({
          midiNote,
          isBlack: true,
          x: ((octave * 12 + note) % 12) * 20 + (whiteKeys.length * 2) - 10,
          width: 14,
          key: `b-${midiNote}`,
        });
      });
    }
    
    return keys.map(key => {
      const yPos = (127 - key.midiNote) * state.zoomY;
      return (
        <div
          key={key.key}
          style={{
            position: "absolute",
            left: `${key.x}px`,
            top: `${yPos}px`,
            width: `${key.width}px`,
            height: `${state.zoomY * 12}px`,
            background: key.isBlack
              ? COLORS.keyboardActive
              : COLORS.keyboard,
            pointerEvents: "none",
          }}
        />
      );
    });
  }, [state.zoomY]);
  
  // Render notes
  const renderNotes = useMemo(() => {
    return state.notes.map((note, index) => {
      const isSelected = state.selectedNoteIds.has(
        `${note.start}-${note.pitch}-${note.velocity}`
      );
      const isHovered = state.hoveredNoteId === `${note.start}-${note.pitch}-${note.velocity}`;
      
      const x = note.start * state.zoomX - state.scrollX;
      const y = (127 - note.pitch) * state.zoomY;
      const width = Math.max(1, note.duration * state.zoomX);
      const height = Math.max(NOTE_MIN_HEIGHT, state.zoomY * 0.8);
      
      // Color based on velocity
      const velocityIntensity = note.velocity / 127;
      const noteColor = `hsl(120, 70%, ${40 + velocityIntensity * 30}%)`; // green to light green
      
      return (
        <div
          key={`note-${index}`}
          className={`note ${isSelected ? "selected" : ""} ${isHovered ? "hovered" : ""}`}
          style={{
            position: "absolute",
            left: `${Math.round(x)}px`,
            top: `${Math.round(y)}px`,
            width: `${Math.round(width)}px`,
            height: `${Math.round(height)}px`,
            background: noteColor,
            borderRadius: 2,
            cursor: "pointer",
            boxShadow: isSelected
              ? `0 0 0 2px ${COLORS.noteSelected}`
              : "none",
          }}
        />
      );
    });
  }, [state.notes, state.selectedNoteIds, state.hoveredNoteId, state.zoomX, state.zoomY, state.scrollX, NOTE_MIN_HEIGHT]);
  
  // Render grid
  const renderGrid = useMemo(() => {
    if (!containerRef.current) return [];
    
    const startBeat = Math.floor(visibleStart);
    const endBeat = Math.ceil(visibleEnd);
    
    const gridLines = [];
    
    // Vertical lines (beats)
    for (let beat = startBeat; beat <= endBeat; beat += 0.25) {
      const x = beat * state.zoomX - state.scrollX;
      const isMajor = beat % 1 === 0; // downbeat
      gridLines.push(
        <div
          key={`v-${beat}`}
          style={{
            position: "absolute",
            left: `${Math.round(x)}px`,
            top: "0",
            width: "1px",
            height: "100%",
            background: isMajor
              ? "rgba(255,255,255,0.15)"
              : COLORS.grid,
            pointerEvents: "none",
          }}
        />
      );
    }
    
    // Horizontal lines (notes)
    const startNote = Math.floor((127 - (containerRef.current?.clientHeight ?? 0) / state.zoomY) / 12) * 12;
    const endNote = Math.ceil((127 - 0) / state.zoomY) * 12;
    
    for (let note = startNote; note <= endNote; note += 12) { // octaves
      const y = (127 - note) * state.zoomY;
      const isOctave = note % 12 === 0; // C note
      gridLines.push(
        <div
          key={`h-${note}`}
          style={{
            position: "absolute",
            left: "0",
            top: `${Math.round(y)}px`,
            width: "100%",
            height: "1px",
            background: isOctave
              ? "rgba(255,255,255,0.1)"
              : COLORS.grid,
            pointerEvents: "none",
          }}
        />
      );
    }
    
    return gridLines;
  }, [visibleStart, visibleEnd, state.zoomX, state.zoomY, state.scrollX, containerRef]);
  
  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: COLORS.bg,
        overflow: "hidden",
        touchAction: "none",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()} // prevent right-click menu
    >
      {/* Grid */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
        {renderGrid}
      </div>
      
      {/* Keyboard */}
      <div ref={keyboardRef} style={{ position: "absolute", left: 0, top: 0, width: 60, height: "100%", pointerEvents: "none" }}>
        {renderKeyboard()}
      </div>
      
      {/* Notes */}
      <div ref={notesRef} style={{ position: "absolute", left: 60, top: 0, right: 0, bottom: 0, overflow: "hidden" }}>
        {renderNotes}
        
        {/* Playhead */}
        <div
          ref={playheadRef}
          style={{
            position: "absolute",
            left: `${Math.round(currentBeat * state.zoomX - state.scrollX)}px`,
            top: 0,
            width: "2px",
            height: "100%",
            background: COLORS.playhead,
            pointerEvents: "none",
            zIndex: 10,
          }}
        />
      </div>
      
      {/* Controls overlay */}
      <div style={{
        position: "absolute",
        top: 10,
        left: 10,
        display: "flex",
        gap: 8,
        background: "rgba(0,0,0,0.5)",
        padding: "6px 10px",
        borderRadius: 4,
        zIndex: 20,
      }}>
        <button
          onClick={() => {
            // Quantize selected notes to 16th grid
            setState(prev => {
              const newNotes = prev.notes.map(note => {
                if (prev.selectedNoteIds.has(`${note.start}-${note.pitch}-${note.velocity}`)) {
                  return {
                    ...note,
                    start: Math.round(note.start * 4) / 4,
                  };
                }
                return note;
              });
              return { ...prev, notes: newNotes };
            });
          }}
          style={{
            padding: "4px 8px",
            background: COLORS.panel,
            border: `1px solid ${COLORS.border}`,
            color: COLORS.text,
            fontSize: 12,
            borderRadius: 2,
            cursor: "pointer",
          }}
        >
          Q
        </button>
        
        <button
          onClick={() => {
            // Invert selection
            setState(prev => {
              const selected = new Set(prev.selectedNoteIds);
              const all = new Set(prev.notes.map(n => `${n.start}-${n.pitch}-${n.velocity}`));
              const inverted = new Set(
                [...all].filter(id => !selected.has(id))
              );
              return { ...prev, selectedNoteIds: inverted };
            });
          }}
          style={{
            padding: "4px 8px",
            background: COLORS.panel,
            border: `1px solid ${COLORS.border}`,
            color: COLORS.text,
            fontSize: 12,
            borderRadius: 2,
            cursor: "pointer",
          }}
        >
          Inv
        </button>
      </div>
      
      {/* Info overlay */}
      <div style={{
        position: "absolute",
        bottom: 10,
        left: 10,
        display: "flex",
        gap: 12,
        background: "rgba(0,0,0,0.5)",
        padding: "6px 10px",
        borderRadius: 4,
        zIndex: 20,
        fontSize: 12,
        color: COLORS.textMuted,
      }}>
        <div>Beat: {visibleStart.toFixed(2)} → {visibleEnd.toFixed(2)}</div>
        <div>Zoom: {state.zoomX.toFixed(0)} px/beat</div>
        <div>Notes: {state.notes.length}</div>
        <div>Selected: {state.selectedNoteIds.size}</div>
      </div>
    </div>
  );
};