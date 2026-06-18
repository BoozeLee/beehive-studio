import { useState, useRef } from "react";
import { Editor, type OnMount, type Monaco } from "@monaco-editor/react";

interface LuaEditorProps {
  initialValue?: string;
  sessionId?: string;
}

export function LuaEditor({ initialValue = "-- MixHive Lua Script\n\nprint(\"Hello from Beehive Studio!\")\n\n-- Access the DAW API:\n-- play()\n-- set_bpm(140)\n-- note_on(36, 127) -- Kick on beat 1", sessionId = "default" }: LuaEditorProps) {
  const [code, setCode] = useState(initialValue);
  const [output, setOutput] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const editorRef = useRef<Monaco["editor"]["IStandaloneCodeEditor"] | null>(null);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  const runScript = async () => {
    setIsRunning(true);
    setOutput((prev) => [...prev, "> Running script..."]);
    try {
      const response = await fetch("http://127.0.0.1:9876/lua/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: code,
          session_id: sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const result = await response.json();
      if (result.error) {
        setOutput((prev) => [...prev, `❌ Error: ${result.error}`]);
      } else {
        if (result.stdout) {
          setOutput((prev) => [...prev, result.stdout]);
        }
        setOutput((prev) => [...prev, "✅ Completed successfully."]);
      }
    } catch (err) {
      setOutput((prev) => [...prev, `❌ Failed to connect to backend: ${err}`]);
    } finally {
      setIsRunning(false);
    }
  };

  const clearOutput = () => setOutput([]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Toolbar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 8px",
        background: "var(--jb-toolbar-bg)",
        borderBottom: "1px solid var(--jb-border)",
        flexShrink: 0
      }}>
        <button
          className="jetbee-toolbtn"
          onClick={runScript}
          disabled={isRunning}
          style={{
            background: isRunning ? "transparent" : "var(--jb-comb)",
            color: isRunning ? "var(--jb-text-muted)" : "var(--jb-text-inverse)",
            fontWeight: 600
          }}
        >
          {isRunning ? "Running..." : "▶ Run"}
        </button>
        <button className="jetbee-toolbtn" onClick={clearOutput}>Clear Console</button>
        <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--jb-text-muted)" }}>
          Target: http://127.0.0.1:9876/lua/run
        </div>
      </div>

      {/* Main Content (Split view) */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Editor Area */}
        <div style={{ flex: 2, minHeight: 0, borderBottom: "1px solid var(--jb-border)" }}>
          <Editor
            height="100%"
            language="lua"
            theme="vs-dark"
            value={code}
            onChange={(v) => setCode(v ?? "")}
            onMount={handleMount}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "var(--jb-font-mono)",
              automaticLayout: true,
              scrollBeyondLastLine: false,
              padding: { top: 8, bottom: 8 }
            }}
          />
        </div>

        {/* Console Area */}
        <div style={{
          flex: 1,
          minHeight: 100,
          background: "var(--jb-bg)",
          color: "var(--jb-text)",
          fontFamily: "var(--jb-font-mono)",
          fontSize: 12,
          padding: 8,
          overflowY: "auto",
          whiteSpace: "pre-wrap"
        }}>
          <div style={{ color: "var(--jb-text-muted)", marginBottom: 4, fontSize: 10, textTransform: "uppercase" }}>Console Output</div>
          {output.length === 0 && <div style={{ color: "var(--jb-text-muted)", opacity: 0.5 }}>Output will appear here...</div>}
          {output.map((line, i) => (
            <div key={i} style={{ marginBottom: 2 }}>{line}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
