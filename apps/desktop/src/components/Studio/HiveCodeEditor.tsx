"use client";

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import Editor, { OnMount } from "@monaco-editor/react";

const EXT_LANG: Record<string, string> = {
  ts: "typescript", tsx: "typescript",
  js: "javascript", jsx: "javascript",
  rs: "rust", toml: "toml", json: "json",
  md: "markdown", sh: "shell", bash: "shell",
  css: "css", html: "html", yaml: "yaml", yml: "yaml",
  py: "python", lua: "lua", mid: "plaintext", midi: "plaintext",
};

function langFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANG[ext] ?? "plaintext";
}

interface Tab {
  id: string;
  path: string;
  content: string;
  dirty: boolean;
}

export interface HiveCodeEditorHandle {
  openTab: (path: string, content: string) => void;
}

interface HiveCodeEditorProps {
  onActiveFileChange?: (path: string | null) => void;
}

export const HiveCodeEditor = forwardRef<HiveCodeEditorHandle, HiveCodeEditorProps>(({ onActiveFileChange }, ref) => {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const editorRef = useRef<any>(null);

  const activeTab = tabs.find((t) => t.id === activeId) ?? null;

  const saveRef = useRef<() => Promise<void>>(async () => {});

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  useEffect(() => {
    return () => { editorRef.current?.getModel()?.dispose(); };
  }, []);

  useEffect(() => {
    onActiveFileChange?.(activeTab?.path ?? null);
  }, [activeId]);

  useEffect(() => {
    if (!editorRef.current || !activeTab) return;
    const editor = editorRef.current;

    const listener = editor.onDidChangeModelContent(() => {
      setTabs((prev) =>
        prev.map((t) => t.id === activeTab.id ? { ...t, dirty: true, content: editor.getValue() } : t),
      );
    });

    return () => { listener.dispose(); };
  }, [activeId, activeTab?.id]);

  const openTab = (path: string, content: string) => {
    setTabs((prev) => prev.some((t) => t.id === path) ? prev : [...prev, { id: path, path, content, dirty: false }]);
    setActiveId(path);
  };

  useImperativeHandle(ref, () => ({ openTab }));

  const closeTab = (id: string) => {
    setTabs((prev) => prev.filter((t) => t.id !== id));
    if (activeId === id) {
      const remaining = tabs.filter((t) => t.id !== id);
      setActiveId(remaining[0]?.id ?? null);
    }
  };

  const save = async () => {
    if (!activeTab) return;
    await fetch("/tools/write", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: activeTab.path, content: activeTab.content }),
    });
    setTabs((prev) => prev.map((t) => t.id === activeTab.id ? { ...t, dirty: false } : t));
  };

  useEffect(() => { saveRef.current = save; });

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--bh-bg)" }}>
      <div className="flex items-center gap-1 border-b overflow-x-auto" style={{ borderColor: "var(--bh-tab-border)", padding: "0 8px" }}>
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setActiveId(t.id)}
            className={`bh-tab ${t.id === activeId ? "bh-tab-active" : ""}`}>
            <span>{t.path.split("/").pop()}</span>
            {t.dirty && <span className="ml-1" style={{ color: "var(--bh-accent)" }}>●</span>}
            <span className="ml-1 cursor-pointer hover:text-white"
              onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}>×</span>
          </button>
        ))}
        <div className="ml-auto flex gap-2 text-xs pl-2">
          <button type="button" onClick={save} className="bh-btn" style={{ borderColor: "var(--bh-accent)", color: "var(--bh-accent)" }}>
            Save
          </button>
        </div>
      </div>
      <div className="flex-1 relative">
        <Editor
          height="100%"
          theme="vs-dark"
          language={activeTab ? langFromPath(activeTab.path) : "plaintext"}
          value={activeTab?.content ?? "// No file open"}
          onMount={onMount}
          options={{
            fontFamily: "var(--bh-font-mono)",
            fontSize: 13,
            minimap: { enabled: false },
            wordWrap: "on",
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
});

HiveCodeEditor.displayName = "HiveCodeEditor";
