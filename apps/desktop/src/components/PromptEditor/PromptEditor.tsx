import { useRef, useState, useCallback, useEffect } from "react";
import { Editor, type BeforeMount, type OnMount, type Monaco } from "@monaco-editor/react";
import { validateJetBeeDsl } from "../../lib/dslDiagnostics";

export interface PromptEditorProps {
  value: string;
  onChange: (v: string) => void;
  onGenerate?: () => void;
  onSendToCritic?: () => void;
  onTag?: (tagName: string) => void;
  readOnly?: boolean;
}

/* ─────────────────────────────────────────────────────────────
   JetBee Prompt DSL — Monarch tokenizer definition
   ───────────────────────────────────────────────────────────── */
const JETBEE_LANGUAGE_ID = "jetbee-prompt";

const JETBEE_TOKEN_PROVIDER = {
  defaultToken: "",
  tokenPostfix: ".jetbee",

  keywords: [
    "generate",
    "remix",
    "branch",
    "freeze",
    "critic",
    "master",
    "export",
  ],

  sections: [
    "style",
    "bpm",
    "key",
    "duration",
    "mood",
    "instruments",
  ],

  brackets: [
    { open: "{", close: "}", token: "delimiter.curly" },
    { open: "[", close: "]", token: "delimiter.square" },
    { open: "(", close: ")", token: "delimiter.parenthesis" },
  ],

  tokenizer: {
    root: [
      { include: "@whitespace" },
      { include: "@comment" },
      { include: "@string" },
      { include: "@number" },

      // Section headers like `style:`, `bpm:`
      [
        new RegExp(
          "^(\s*)(?:" +
            ["style", "bpm", "key", "duration", "mood", "instruments"].join("|") +
            ")(\s*:)",
          "i"
        ),
        ["white", "keyword.section", "delimiter"],
      ],

      // Keywords
      [
        new RegExp(
          "\b(?:" +
            ["generate", "remix", "branch", "freeze", "critic", "master", "export"].join("|") +
            ")\b",
          "i"
        ),
        "keyword",
      ],

      // Identifiers
      [/\b[a-zA-Z_]\w*\b/, "identifier"],

      // Delimiters / operators
      [/[{}[\]()]/, "@brackets"],
      [/[;,.]/, "delimiter"],
      [/[=+\-*/<>!&|]+/, "operator"],
    ],

    whitespace: [
      [/[ \t\r\n]+/, "white"],
    ],

    comment: [
      [/#.*$/, "comment"],
    ],

    string: [
      [/"/, "string", "@string_double"],
      [/'/, "string", "@string_single"],
    ],

    string_double: [
      [/[^"\\]+/, "string"],
      [/\\./, "string.escape"],
      [/"/, "string", "@pop"],
    ],

    string_single: [
      [/[^'\\]+/, "string"],
      [/\\./, "string.escape"],
      [/'/, "string", "@pop"],
    ],

    number: [
      [/\b\d+\b/, "number"],
      [/\b\d+\.\d+\b/, "number.float"],
    ],
  },
} as const;

/* ─────────────────────────────────────────────────────────────
   JetBee Dark — Monaco editor theme aligned with CSS vars
   ───────────────────────────────────────────────────────────── */
const JETBEE_THEME_ID = "jetbee-dark";

type ThemeData = Monaco["editor"]["IStandaloneThemeData"];

const JETBEE_THEME_DATA: ThemeData = {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "keyword", foreground: "FF8C42", fontStyle: "bold" },
    { token: "keyword.section", foreground: "F5C542", fontStyle: "bold" },
    { token: "identifier", foreground: "E8DCC8" },
    { token: "string", foreground: "4ADE80" },
    { token: "string.escape", foreground: "22c55e" },
    { token: "comment", foreground: "5A5048", fontStyle: "italic" },
    { token: "number", foreground: "60A5FA" },
    { token: "number.float", foreground: "60A5FA" },
    { token: "delimiter", foreground: "8A7E72" },
    { token: "operator", foreground: "BF6F00" },
    { token: "white", foreground: "E8DCC8" },
  ],
  colors: {
    "editor.background": "#1A1410",
    "editor.foreground": "#E8DCC8",
    "editorCursor.foreground": "#FF8C42",
    "editor.lineHighlightBackground": "#251E18",
    "editor.selectionBackground": "#3D2E22",
    "editor.inactiveSelectionBackground": "#2A1F18",
    "editor.selectionHighlightBackground": "#3D2E2255",
    "editor.wordHighlightBackground": "#3D2E2244",
    "editor.wordHighlightStrongBackground": "#3D2E2266",
    "editorLineNumber.foreground": "#5A5048",
    "editorLineNumber.activeForeground": "#FF8C42",
    "editorGutter.background": "#120E0A",
    "editorGutter.addedBackground": "#4ADE80",
    "editorGutter.modifiedBackground": "#F5C542",
    "editorGutter.deletedBackground": "#EF4444",
    "editorBracketMatch.background": "#3D2E2266",
    "editorBracketMatch.border": "#FF8C42",
    "editorIndentGuide.background": "#2A1F18",
    "editorIndentGuide.activeBackground": "#3D2E22",
    "editorWhitespace.foreground": "#2A1F18",
    "editorOverviewRuler.border": "#1A1410",
    "editorRuler.foreground": "#2A1F18",
    "editorSuggestWidget.background": "#1A1410",
    "editorSuggestWidget.border": "#2A1F18",
    "editorSuggestWidget.foreground": "#E8DCC8",
    "editorSuggestWidget.highlightForeground": "#FF8C42",
    "editorSuggestWidget.selectedBackground": "#3D2E22",
    "editorHoverWidget.background": "#1A1410",
    "editorHoverWidget.border": "#2A1F18",
    "editorHoverWidget.foreground": "#E8DCC8",
    "editorMarkerNavigation.background": "#1A1410",
    "peekView.border": "#FF8C42",
    "peekViewEditor.background": "#120E0A",
    "peekViewResult.background": "#120E0A",
    "peekViewTitle.background": "#120E0A",
    "editorWidget.background": "#1A1410",
    "editorWidget.border": "#2A1F18",
    "quickInput.background": "#1A1410",
    "quickInput.foreground": "#E8DCC8",
    "quickInputTitle.background": "#120E0A",
    "list.focusBackground": "#3D2E22",
    "list.focusForeground": "#E8DCC8",
    "list.hoverBackground": "#251E18",
    "list.hoverForeground": "#E8DCC8",
    "list.highlightForeground": "#FF8C42",
  },
};

/* ─────────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────────── */
export function PromptEditor({
  value,
  onChange,
  onGenerate,
  onSendToCritic,
  onTag,
  readOnly = false,
}: PromptEditorProps) {
  const editorRef = useRef<Monaco["editor"]["IStandaloneCodeEditor"] | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const [position, setPosition] = useState({ line: 1, column: 1 });

  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    // Register language
    if (
      !monaco.languages
        .getLanguages()
        .some((lang: { id: string }) => lang.id === JETBEE_LANGUAGE_ID)
    ) {
      monaco.languages.register({ id: JETBEE_LANGUAGE_ID });
      monaco.languages.setMonarchTokensProvider(
        JETBEE_LANGUAGE_ID,
        JETBEE_TOKEN_PROVIDER as unknown as Monaco["languages"]["IMonarchLanguage"]
      );
      monaco.languages.registerCompletionItemProvider(JETBEE_LANGUAGE_ID, {
        provideCompletionItems: () => ({
          suggestions: ["style", "bpm", "key", "duration", "mood", "instruments"].map((label) => ({
            label,
            kind: monaco.languages.CompletionItemKind.Property,
            insertText: `${label}: `,
            range: undefined as never,
          })),
        }),
      });
    }

    // Register theme
    monaco.editor.defineTheme(JETBEE_THEME_ID, JETBEE_THEME_DATA);
  }, []);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Track cursor for status bar
      editor.onDidChangeCursorPosition((e) => {
        setPosition({
          line: e.position.lineNumber,
          column: e.position.column,
        });
      });

      // ── Editor actions ──
      editor.addAction({
        id: "jetbee-generate",
        label: "Generate",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyG],
        contextMenuGroupId: "jetbee",
        contextMenuOrder: 1,
        run: () => onGenerate?.(),
      });

      editor.addAction({
        id: "jetbee-send-to-critic",
        label: "Send to Critic",
        contextMenuGroupId: "jetbee",
        contextMenuOrder: 2,
        run: () => onSendToCritic?.(),
      });

      editor.addAction({
        id: "jetbee-extract-motif",
        label: "Extract Motif",
        contextMenuGroupId: "jetbee",
        contextMenuOrder: 3,
        run: () => {
          const selection = editor.getSelection();
          if (selection && !selection.isEmpty()) {
            const selected = editor.getModel()?.getValueInRange(selection) ?? "";
            // Placeholder — in a full implementation this would dispatch to a motif extractor
            console.log("[JetBee] Extract motif:", selected);
          }
        },
      });
      editor.addAction({
        id: "jetbee-tag",
        label: "Tag Current State",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyT],
        contextMenuGroupId: "jetbee",
        contextMenuOrder: 4,
        run: () => {
          const tagName = prompt("Enter tag name for this state:");
          if (tagName) onTag?.(tagName);
        },
      });
    },
    [onGenerate, onSendToCritic, onTag]
  );

  useEffect(() => {
    const model = editorRef.current?.getModel();
    const monaco = monacoRef.current;
    if (!model || !monaco) return;
    const diagnostics = validateJetBeeDsl(value);
    monaco.editor.setModelMarkers(
      model,
      JETBEE_LANGUAGE_ID,
      diagnostics.map((item) => ({
        startLineNumber: item.line,
        endLineNumber: item.line,
        startColumn: item.startColumn,
        endColumn: item.endColumn,
        message: item.message,
        severity: item.severity === "error"
          ? monaco.MarkerSeverity.Error
          : monaco.MarkerSeverity.Warning,
      })),
    );
  }, [value]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        background: "var(--jb-panel, #1A1410)",
        border: "1px solid var(--jb-border, #2A1F18)",
        borderRadius: "var(--jb-border-radius, 6px)",
      }}
    >
      <div style={{ flex: 1, minHeight: 0 }}>
        <Editor
          height="100%"
          language={JETBEE_LANGUAGE_ID}
          theme={JETBEE_THEME_ID}
          value={value}
          onChange={(v) => onChange(v ?? "")}
          beforeMount={handleBeforeMount}
          onMount={handleMount}
          options={{
            readOnly,
            fontFamily: "var(--jb-font-mono, 'JetBrains Mono', monospace)",
            fontSize: 13,
            lineHeight: 22,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            wrappingStrategy: "advanced",
            automaticLayout: true,
            tabSize: 2,
            insertSpaces: true,
            quickSuggestions: true,
            suggestOnTriggerCharacters: true,
            folding: true,
            renderLineHighlight: "line",
            renderWhitespace: "selection",
            bracketPairColorization: { enabled: true },
            guides: {
              bracketPairs: true,
              indentation: true,
            },
            padding: { top: 8, bottom: 8 },
            scrollbar: {
              useShadows: false,
              verticalHasArrows: false,
              horizontalHasArrows: false,
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
            },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            overviewRulerBorder: false,
          }}
        />
      </div>

      {/* ── Status bar ── */}
      <div
        className="jetbee-statusbar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
          height: "var(--jb-statusbar-height, 24px)",
          fontSize: 11,
          fontFamily: "var(--jb-font-mono, 'JetBrains Mono', monospace)",
          color: "var(--jb-text-muted, #8A7E72)",
          background: "var(--jb-statusbar-bg, #120E0A)",
          borderTop: "1px solid var(--jb-border, #2A1F18)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: "var(--jb-comb, #FF8C42)", fontWeight: 600 }}>Ln</span>
            {position.line}
            <span style={{ color: "var(--jb-comb, #FF8C42)", fontWeight: 600, marginLeft: 4 }}>Col</span>
            {position.column}
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "1px 6px",
              borderRadius: 3,
              fontSize: 10,
              background: "var(--jb-panel, #1A1410)",
            }}
          >
            {JETBEE_LANGUAGE_ID}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {onTag && (
            <button
              className="jetbee-toolbtn"
              onClick={() => {
                const tagName = prompt("Enter tag name for this state:");
                if (tagName) onTag(tagName);
              }}
              title="Tag State (Ctrl+T)"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                padding: "2px 8px",
                fontSize: 10,
                fontWeight: 500,
                color: "var(--jb-text-muted, #8A7E72)",
                background: "transparent",
                border: "1px solid var(--jb-border, #2A1F18)",
                borderRadius: "var(--jb-border-radius-sm, 4px)",
                cursor: "pointer",
                transition: "all 0.15s ease",
                fontFamily: "var(--jb-font-sans, system-ui, sans-serif)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--jb-text, #E8DCC8)";
                e.currentTarget.style.background = "var(--jb-panel-hover, #221A14)";
                e.currentTarget.style.borderColor = "var(--jb-border-active, #3D2E22)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--jb-text-muted, #8A7E72)";
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "var(--jb-border, #2A1F18)";
              }}
            >
              🏷️ Tag
            </button>
          )}
          {onSendToCritic && (
            <button
              className="jetbee-toolbtn"
              onClick={onSendToCritic}
              title="Send to Critic"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                padding: "2px 8px",
                fontSize: 10,
                fontWeight: 500,
                color: "var(--jb-text-muted, #8A7E72)",
                background: "transparent",
                border: "1px solid var(--jb-border, #2A1F18)",
                borderRadius: "var(--jb-border-radius-sm, 4px)",
                cursor: "pointer",
                transition: "all 0.15s ease",
                fontFamily: "var(--jb-font-sans, system-ui, sans-serif)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--jb-text, #E8DCC8)";
                e.currentTarget.style.background = "var(--jb-panel-hover, #221A14)";
                e.currentTarget.style.borderColor = "var(--jb-border-active, #3D2E22)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--jb-text-muted, #8A7E72)";
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "var(--jb-border, #2A1F18)";
              }}
            >
              🧪 Critic
            </button>
          )}
          {onGenerate && (
            <button
              className="jetbee-toolbtn"
              onClick={onGenerate}
              title="Generate (Ctrl+Shift+G)"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                padding: "2px 10px",
                fontSize: 10,
                fontWeight: 600,
                color: "var(--jb-text-inverse, #0F0A08)",
                background: "var(--jb-comb, #FF8C42)",
                border: "1px solid var(--jb-comb, #FF8C42)",
                borderRadius: "var(--jb-border-radius-sm, 4px)",
                cursor: "pointer",
                transition: "all 0.15s ease",
                fontFamily: "var(--jb-font-sans, system-ui, sans-serif)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = "brightness(1.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = "none";
              }}
            >
              ▶ Generate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
