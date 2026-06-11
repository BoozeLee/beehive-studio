import { useEffect, useRef, useCallback } from "react";
import { useKeyboardStore } from "../../lib/keyboardStore";

export function CommandPalette() {
  const {
    isPaletteOpen,
    paletteQuery,
    filteredCommands,
    paletteSelectedIndex,
    setPaletteQuery,
    closePalette,
    paletteExecuteSelected,
  } = useKeyboardStore();

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isPaletteOpen) {
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isPaletteOpen]);

  useEffect(() => {
    const el = listRef.current?.children[paletteSelectedIndex] as HTMLElement | undefined;
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [paletteSelectedIndex]);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPaletteQuery(e.target.value);
    },
    [setPaletteQuery]
  );

  const handleClick = useCallback(
    (index: number) => {
      useKeyboardStore.setState({ paletteSelectedIndex: index });
      paletteExecuteSelected();
    },
    [paletteExecuteSelected]
  );

  if (!isPaletteOpen) return null;

  return (
    <div className="jetbee-cp-overlay" onClick={closePalette}>
      <div className="jetbee-cp-dialog" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="jetbee-cp-input"
          type="text"
          placeholder="Type a command…"
          value={paletteQuery}
          onChange={handleInput}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              closePalette();
            }
          }}
        />
        <div ref={listRef} className="jetbee-cp-list">
          {filteredCommands.length === 0 && (
            <div style={{ padding: 16, color: "var(--jb-text-muted)", fontSize: 13, textAlign: "center" }}>
              No commands match "{paletteQuery}"
            </div>
          )}
          {filteredCommands.map((cmd, i) => (
            <div
              key={cmd.id}
              className="jetbee-cp-item"
              data-selected={i === paletteSelectedIndex}
              onClick={() => handleClick(i)}
              onMouseEnter={() =>
                useKeyboardStore.setState({ paletteSelectedIndex: i })
              }
            >
              <span className="jetbee-cp-item-label">
                <span style={{ opacity: 0.6 }}>{cmd.icon || "◆"}</span>
                <span>{cmd.label}</span>
                <span style={{ color: "var(--jb-text-faint)", fontSize: 11, marginLeft: 4 }}>
                  {cmd.category}
                </span>
              </span>
              {cmd.shortcut && (
                <span className="jetbee-cp-item-kbd">
                  {cmd.shortcut}
                </span>
              )}
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "6px 12px",
            fontSize: 11,
            color: "var(--jb-text-faint)",
            borderTop: "1px solid var(--jb-border)",
            fontFamily: "var(--jb-font-mono)",
          }}
        >
          <span>{filteredCommands.length} commands</span>
          <span>↑↓ navigate · ↵ execute · esc close</span>
        </div>
      </div>
    </div>
  );
}
