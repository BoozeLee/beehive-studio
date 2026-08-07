"use client";

import React, { useEffect, useRef, useState } from "react";

type BlockCategory = "rhythm" | "harmony" | "melody" | "texture" | "arrangement" | "mix";

interface Block {
  id: string;
  category: BlockCategory;
  type: string;
  x: number;
  y: number;
  props: Record<string, string>;
}

interface Edge {
  id: string;
  from: string;
  to: string;
}

const CAT_COLORS: Record<BlockCategory, string> = {
  rhythm: "var(--bh-agent-worker)",
  harmony: "var(--bh-agent-queen)",
  melody: "var(--bh-honey)",
  texture: "var(--bh-agent-drone)",
  arrangement: "var(--bh-agent-arrange)",
  mix: "var(--bh-agent-forager)",
};

const PALETTES: Record<BlockCategory, string[]> = {
  rhythm: ["Set BPM", "Generate Beat", "Add Drum Pattern", "Swing", "Humanize"],
  harmony: ["Generate Chords", "Change Key", "Add Bass Line"],
  melody: ["Generate Melody", "Apply Scale", "Add Arpeggio"],
  texture: ["Generate Pad", "Add Riser", "Add Fx Sweep"],
  arrangement: ["Intro", "Build", "Drop", "Outro"],
  mix: ["Set Volume", "Add Reverb", "Add Delay", "Compress"],
};

function makeId() { return Math.random().toString(36).slice(2); }

const BLOCK_W = 140;
const BLOCK_H = 56;

interface HiveNoCodeCanvasProps {
  onGeneratedCode?: (code: string) => void;
}

export function HiveNoCodeCanvas({ onGeneratedCode }: HiveNoCodeCanvasProps = {}) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState("");
  const [generating, setGenerating] = useState(false);
  const [connectMode, setConnectMode] = useState(false);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; ox: number; oy: number } | null>(null);
  const [activeCategory, setActiveCategory] = useState<BlockCategory>("rhythm");

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem("beehive:canvas:v1:blocks", JSON.stringify(blocks));
        localStorage.setItem("beehive:canvas:v1:edges", JSON.stringify(edges));
      } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(t);
  }, [blocks, edges]);

  const clearCanvas = () => {
    setBlocks([]);
    setEdges([]);
    setSelectedId(null);
    setGeneratedCode("");
    localStorage.removeItem("beehive:canvas:v1:blocks");
    localStorage.removeItem("beehive:canvas:v1:edges");
  };

  const addBlock = (type: string) => {
    const block: Block = {
      id: makeId(),
      category: activeCategory,
      type,
      x: 40 + (blocks.length % 8) * (BLOCK_W + 20),
      y: 40 + Math.floor(blocks.length / 8) * (BLOCK_H + 20),
      props: {},
    };
    setBlocks((p) => [...p, block]);
  };

  const generateCode = () => {
    setGenerating(true);
    setTimeout(() => {
      const code = blocks.map((b) => `# ${b.category}: ${b.type}\nbeehive.${b.category}.${b.type.toLowerCase().replace(/\s+/g, "_")}()`).join("\n\n");
      setGeneratedCode(code);
      onGeneratedCode?.(code);
      setGenerating(false);
    }, 400);
  };

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--bh-bg)" }}>
      <div className="flex items-center gap-2 border-b px-2 py-1" style={{ borderColor: "var(--bh-border)" }}>
        {(["rhythm", "harmony", "melody", "texture", "arrangement", "mix"] as BlockCategory[]).map((c) => (
          <button key={c} type="button" onClick={() => setActiveCategory(c)}
            className={`bh-tab ${activeCategory === c ? "bh-tab-active" : ""}`}>
            {c}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={generateCode} disabled={generating || blocks.length === 0}
            className="bh-btn bh-btn-accent">
            {generating ? "Generating…" : "Generate Code"}
          </button>
          <button type="button" onClick={clearCanvas} className="bh-btn">Clear</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-44 overflow-y-auto bh-scrollable border-r p-2 space-y-1" style={{ borderColor: "var(--bh-border)" }}>
          {PALETTES[activeCategory].map((t) => (
            <button key={t} type="button" onClick={() => addBlock(t)}
              className="w-full text-left px-2 py-1.5 rounded text-xs border hover:bg-[var(--bh-panel-hover)]"
              style={{ borderColor: "var(--bh-border)", color: "var(--bh-text-muted)" }}>
              + {t}
            </button>
          ))}
        </div>

        <div className="flex-1 relative overflow-hidden" style={{ background: "var(--bh-bg)" }}>
          <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
            {edges.map((e) => {
              const from = blocks.find((b) => b.id === e.from);
              const to = blocks.find((b) => b.id === e.to);
              if (!from || !to) return null;
              return (
                <line key={e.id}
                  x1={from.x + BLOCK_W} y1={from.y + BLOCK_H / 2}
                  x2={to.x} y2={to.y + BLOCK_H / 2}
                  stroke="var(--bh-border)" strokeWidth="2" />
              );
            })}
          </svg>
          {blocks.map((b) => (
            <div key={b.id}
              className="absolute rounded border cursor-move"
              style={{
                left: b.x, top: b.y, width: BLOCK_W, height: BLOCK_H,
                borderColor: selectedId === b.id ? "var(--bh-accent)" : "var(--bh-border)",
                background: "var(--bh-panel)",
                boxShadow: selectedId === b.id ? "0 0 0 2px var(--bh-glow)" : "none",
              }}
              onMouseDown={(e) => {
                dragRef.current = { id: b.id, ox: e.clientX - b.x, oy: e.clientY - b.y };
                setSelectedId(b.id);
              }}
            >
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider border-b"
                style={{ borderColor: "var(--bh-border)", color: CAT_COLORS[b.category] }}>
                {b.category}
              </div>
              <div className="px-2 py-1 text-xs truncate" style={{ color: "var(--bh-text)" }}>{b.type}</div>
            </div>
          ))}
        </div>
      </div>

      {generatedCode && (
        <div className="border-t p-2 text-xs font-mono overflow-x-auto" style={{ borderColor: "var(--bh-border)", color: "var(--bh-text-muted)", background: "var(--bh-panel)" }}>
          <pre>{generatedCode}</pre>
        </div>
      )}
    </div>
  );
}
