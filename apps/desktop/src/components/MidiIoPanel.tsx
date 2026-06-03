import { BEEHIVE } from "../lib/theme";
import React, { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface MidiNote {
  pitch: number;
  velocity: number;
  start: number;
  duration: number;
}

interface Props {
  onStatus: (msg: string) => void;
  onNote: (note: MidiNote) => void;
}

const COLORS = { ...BEEHIVE, accent: "#ff4d00" };

export const MidiIoPanel: React.FC<Props> = ({ onStatus, onNote }) => {
  const [ports, setPorts] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState<number>(-1);
  const [isOpen, setIsOpen] = useState(false);
  const [lastEvent, setLastEvent] = useState<string>("");

  const refreshPorts = useCallback(async () => {
    try {
      const list = await invoke<string[]>("list_midi_ports");
      setPorts(list);
      onStatus(`Found ${list.length} MIDI input ports`);
    } catch (err) {
      onStatus(`MIDI list error: ${String(err)}`);
    }
  }, [onStatus]);

  useEffect(() => {
    refreshPorts();
  }, [refreshPorts]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ bytes: number[] }>("midi-event", (event) => {
      const bytes = event.payload.bytes;
      if (bytes.length >= 3 && (bytes[0] & 0xf0) === 0x90 && bytes[2] > 0) {
        // Note on
        const note: MidiNote = {
          pitch: bytes[1],
          velocity: bytes[2],
          start: 0,
          duration: 0.5,
        };
        setLastEvent(`Note On: ${note.pitch} vel=${note.velocity}`);
        onNote(note);
      } else if (bytes.length >= 3 && (bytes[0] & 0xf0) === 0x80) {
        setLastEvent(`Note Off: ${bytes[1]}`);
      } else {
        setLastEvent(`MIDI: [${bytes.join(", ")}]`);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, [onNote]);

  const openPort = async () => {
    if (selectedPort < 0) return;
    try {
      await invoke("open_midi_input", { portIndex: selectedPort });
      setIsOpen(true);
      onStatus(`Opened MIDI port: ${ports[selectedPort]}`);
    } catch (err) {
      onStatus(`MIDI open error: ${String(err)}`);
    }
  };

  const closePort = async () => {
    try {
      await invoke("close_midi_input");
      setIsOpen(false);
      onStatus("Closed MIDI input");
    } catch (err) {
      onStatus(`MIDI close error: ${String(err)}`);
    }
  };

  return (
    <div
      style={{
        border: `1px solid ${COLORS.border}`,
        borderRadius: 6,
        padding: 12,
        background: COLORS.bg,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>
          🎹 MIDI Input
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={refreshPorts}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              background: "#2a2a30",
              color: COLORS.text,
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <select
          value={selectedPort}
          onChange={(e) => setSelectedPort(Number(e.target.value))}
          disabled={isOpen}
          style={{
            flex: 1,
            padding: "6px 10px",
            fontSize: 12,
            background: COLORS.bg,
            color: COLORS.text,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 4,
          }}
        >
          <option value={-1}>-- Select MIDI Input --</option>
          {ports.map((name, i) => (
            <option key={i} value={i}>
              {name}
            </option>
          ))}
        </select>
        {!isOpen ? (
          <button
            onClick={openPort}
            disabled={selectedPort < 0}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              background: selectedPort < 0 ? "#2a2a30" : COLORS.success,
              color: COLORS.text,
              border: "none",
              borderRadius: 4,
              cursor: selectedPort < 0 ? "not-allowed" : "pointer",
            }}
          >
            Open
          </button>
        ) : (
          <button
            onClick={closePort}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              background: "#5a2a2a",
              color: COLORS.text,
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        )}
      </div>

      {lastEvent && (
        <div style={{ fontSize: 11, color: COLORS.textMuted }}>
          Last: {lastEvent}
        </div>
      )}
    </div>
  );
};
