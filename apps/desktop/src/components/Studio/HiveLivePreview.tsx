"use client";

import React, { useRef, useState } from "react";

function HiveTerminal() {
  const [lines, setLines] = useState<string[]>(["BeeHive terminal — type a command"]);
  const [cmd, setCmd] = useState("");
  const [running, setRunning] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const run = async () => {
    const c = cmd.trim();
    if (!c) return;
    setLines((p) => [...p, `$ ${c}`]);
    setCmd("");
    setRunning(true);
    try {
      const res = await fetch("/tools/exec", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: c }),
      });
      const j = await res.json();
      const out = (j.stdout || "") + (j.stderr || "") || "(no output)";
      setLines((p) => [...p, ...out.split("\n")]);
    } catch {
      setLines((p) => [...p, "(exec failed)"] );
    } finally {
      setRunning(false);
      setTimeout(() => bottomRef.current?.scrollIntoView(), 50);
    }
  };

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--bh-bg)", fontFamily: "var(--bh-font-mono)" }}>
      <div className="flex-1 overflow-y-auto bh-scrollable p-2 space-y-0.5 text-xs" style={{ color: "var(--bh-success)" }}>
        {lines.map((l, i) => <div key={i} className="whitespace-pre-wrap">{l}</div>)}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-1 border-t p-1" style={{ borderColor: "var(--bh-border)" }}>
        <span style={{ color: "var(--bh-accent)" }}>$</span>
        <input
          className="bh-input flex-1"
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") run(); }}
          disabled={running}
          placeholder="command…"
          autoFocus
        />
      </div>
    </div>
  );
}

export function HiveLivePreview() {
  const [mode, setMode] = useState<"iframe" | "terminal">("terminal");

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--bh-panel)", borderLeft: "1px solid var(--bh-border)" }}>
      <div className="flex items-center gap-2 border-b px-2 py-1 text-xs" style={{ borderColor: "var(--bh-border)" }}>
        {(["iframe", "terminal"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`bh-tab ${mode === m ? "bh-tab-active" : ""}`}>
            {m === "iframe" ? "Live Preview" : "Terminal"}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {mode === "iframe"
          ? <iframe title="Preview" src="http://127.0.0.1:8787/preview"
              className="h-full w-full border-0" style={{ background: "var(--bh-bg)" }} />
          : <HiveTerminal />}
      </div>
    </div>
  );
}
