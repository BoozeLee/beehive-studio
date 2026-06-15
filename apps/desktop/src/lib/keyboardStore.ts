import { create } from "zustand";
import { useWorkbenchStore } from "./workbenchStore";

export interface Command {
  id: string;
  label: string;
  category: string;
  shortcut?: string; // e.g. "ctrl+shift+a", "alt+1", "space"
  action: () => void;
  when?: () => boolean; // context predicate
  icon?: string;
}

export interface KeymapEntry {
  commandId: string;
  shortcut: string;
}

interface KeyboardState {
  commands: Map<string, Command>;
  keymap: Map<string, string>; // shortcut -> commandId
  isPaletteOpen: boolean;
  paletteQuery: string;
  paletteSelectedIndex: number;
  filteredCommands: Command[];

  registerCommand: (cmd: Command) => void;
  unregisterCommand: (id: string) => void;
  bindShortcut: (commandId: string, shortcut: string) => void;
  unbindShortcut: (shortcut: string) => void;
  openPalette: () => void;
  closePalette: () => void;
  setPaletteQuery: (q: string) => void;
  paletteSelectNext: () => void;
  paletteSelectPrev: () => void;
  paletteExecuteSelected: () => void;
  getCommandByShortcut: (shortcut: string) => Command | undefined;
  getAvailableCommands: () => Command[];
}

function normalizeShortcut(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  if (e.metaKey) parts.push("meta");

  let key = e.key.toLowerCase();
  if (key === " ") key = "space";
  if (key.length === 1) {
    parts.push(key);
  } else if (
    !["control", "alt", "shift", "meta"].includes(key)
  ) {
    parts.push(key);
  }

  return parts.join("+");
}

function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toLowerCase().replace(/\s+/g, "");
  const t = target.toLowerCase().replace(/\s+/g, "");
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export const useKeyboardStore = create<KeyboardState>((set, get) => ({
  commands: new Map(),
  keymap: new Map(),
  isPaletteOpen: false,
  paletteQuery: "",
  paletteSelectedIndex: 0,
  filteredCommands: [],

  registerCommand: (cmd) => {
    set((state) => {
      const next = new Map(state.commands);
      next.set(cmd.id, cmd);
      const km = new Map(state.keymap);
      if (cmd.shortcut) {
        km.set(cmd.shortcut.toLowerCase(), cmd.id);
      }
      return { commands: next, keymap: km };
    });
  },

  unregisterCommand: (id) => {
    set((state) => {
      const next = new Map(state.commands);
      const cmd = next.get(id);
      next.delete(id);
      const km = new Map(state.keymap);
      if (cmd?.shortcut) {
        km.delete(cmd.shortcut.toLowerCase());
      }
      return { commands: next, keymap: km };
    });
  },

  bindShortcut: (commandId, shortcut) => {
    set((state) => {
      const km = new Map(state.keymap);
      // Remove any existing binding for this shortcut
      km.delete(shortcut.toLowerCase());
      // Also remove any existing shortcut for this command
      for (const [s, cid] of km) {
        if (cid === commandId) km.delete(s);
      }
      km.set(shortcut.toLowerCase(), commandId);
      return { keymap: km };
    });
  },

  unbindShortcut: (shortcut) => {
    set((state) => {
      const km = new Map(state.keymap);
      km.delete(shortcut.toLowerCase());
      return { keymap: km };
    });
  },

  openPalette: () => {
    const available = get().getAvailableCommands();
    set({
      isPaletteOpen: true,
      paletteQuery: "",
      paletteSelectedIndex: 0,
      filteredCommands: available.slice(0, 50),
    });
  },

  closePalette: () => {
    set({ isPaletteOpen: false });
  },

  setPaletteQuery: (q) => {
    const available = get().getAvailableCommands();
    const filtered = q.trim()
      ? available.filter(
          (c) =>
            fuzzyMatch(q, c.label) ||
            fuzzyMatch(q, c.category) ||
            fuzzyMatch(q, c.id)
        )
      : available.slice(0, 50);
    set({
      paletteQuery: q,
      filteredCommands: filtered,
      paletteSelectedIndex: 0,
    });
  },

  paletteSelectNext: () => {
    set((state) => ({
      paletteSelectedIndex:
        (state.paletteSelectedIndex + 1) % state.filteredCommands.length,
    }));
  },

  paletteSelectPrev: () => {
    set((state) => ({
      paletteSelectedIndex:
        state.filteredCommands.length === 0
          ? 0
          : (state.paletteSelectedIndex - 1 + state.filteredCommands.length) %
            state.filteredCommands.length,
    }));
  },

  paletteExecuteSelected: () => {
    const { filteredCommands, paletteSelectedIndex } = get();
    const cmd = filteredCommands[paletteSelectedIndex];
    if (cmd) {
      get().closePalette();
      cmd.action();
    }
  },

  getCommandByShortcut: (shortcut) => {
    const id = get().keymap.get(shortcut.toLowerCase());
    if (!id) return undefined;
    return get().commands.get(id);
  },

  getAvailableCommands: () => {
    return Array.from(get().commands.values()).filter((c) =>
      c.when ? c.when() : true
    );
  },
}));

useKeyboardStore.getState().registerCommand({
  id: "panel.toggleLeft",
  label: "Toggle Left Panel",
  category: "View",
  action: () => useWorkbenchStore.getState().togglePanel("left"),
});
useKeyboardStore.getState().registerCommand({
  id: "panel.toggleRight",
  label: "Toggle Right Panel",
  category: "View",
  action: () => useWorkbenchStore.getState().togglePanel("right"),
});
useKeyboardStore.getState().registerCommand({
  id: "panel.toggleBottom",
  label: "Toggle Bottom Panel",
  category: "View",
  action: () => useWorkbenchStore.getState().togglePanel("bottom"),
});
useKeyboardStore.getState().registerCommand({
  id: "panel.focusChat",
  label: "Focus Agent Chat",
  category: "Agent",
  action: () => {
    useWorkbenchStore.getState().openPanel("bottom", "agent");
    document.querySelector<HTMLElement>(".jetbee-chat-composer textarea")?.focus();
  },
});
useKeyboardStore.getState().registerCommand({
  id: "editor.openMixer",
  label: "Open Mixer",
  category: "Editor",
  action: () => useWorkbenchStore.getState().openCenterTab("mixer"),
});
useKeyboardStore.getState().registerCommand({
  id: "editor.openArrangement",
  label: "Open Arrangement",
  category: "Editor",
  action: () => useWorkbenchStore.getState().openCenterTab("arrangement"),
});

/**
 * Global keyboard event handler. Attach this to window in your root component.
 * Respects input/textarea/contenteditable focus for typing shortcuts.
 */
export function handleGlobalKeydown(e: KeyboardEvent): boolean {
  const store = useKeyboardStore.getState();

  // Command palette navigation
  if (store.isPaletteOpen) {
    if (e.key === "Escape") {
      e.preventDefault();
      store.closePalette();
      return true;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      store.paletteSelectNext();
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      store.paletteSelectPrev();
      return true;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      store.paletteExecuteSelected();
      return true;
    }
    // Let typing go through to palette input
    return false;
  }

  // Universal search — double shift
  // (Handled separately via keyup tracking)

  const shortcut = normalizeShortcut(e);
  const cmd = store.getCommandByShortcut(shortcut);
  if (cmd) {
    // Don't intercept typing in inputs unless the command explicitly wants it
    const target = e.target as HTMLElement;
    const isTyping =
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable;
    if (isTyping && !shortcut.includes("ctrl") && !shortcut.includes("alt") && !shortcut.includes("meta")) {
      return false;
    }
    e.preventDefault();
    cmd.action();
    return true;
  }

  return false;
}

/**
 * Track double-shift for universal search.
 * Returns true if double-shift was detected.
 */
let lastShiftTime = 0;
export function trackDoubleShift(e: KeyboardEvent): boolean {
  if (e.key !== "Shift") return false;
  const now = Date.now();
  if (now - lastShiftTime < 400) {
    lastShiftTime = 0;
    useKeyboardStore.getState().openPalette();
    return true;
  }
  lastShiftTime = now;
  return false;
}

/**
 * Default JetBee keymap — IntelliJ-inspired.
 */
export const DEFAULT_KEYMAP: KeymapEntry[] = [
  { commandId: "palette.open", shortcut: "ctrl+shift+a" },
  { commandId: "palette.open", shortcut: "shift+shift" },
  { commandId: "generate.build", shortcut: "ctrl+shift+g" },
  { commandId: "project.focusExplorer", shortcut: "alt+1" },
  { commandId: "project.focusInspector", shortcut: "alt+2" },
  { commandId: "project.focusConsole", shortcut: "alt+0" },
  { commandId: "panel.toggleLeft", shortcut: "alt+1" },
  { commandId: "panel.toggleRight", shortcut: "alt+2" },
  { commandId: "panel.toggleBottom", shortcut: "alt+0" },
  { commandId: "panel.focusChat", shortcut: "ctrl+shift+l" },
  { commandId: "editor.openMixer", shortcut: "ctrl+shift+m" },
  { commandId: "editor.openArrangement", shortcut: "alt+9" },
  { commandId: "editor.intention", shortcut: "alt+enter" },
  { commandId: "transport.playPause", shortcut: "space" },
  { commandId: "transport.stop", shortcut: "ctrl+space" },
  { commandId: "file.save", shortcut: "ctrl+s" },
  { commandId: "file.export", shortcut: "ctrl+shift+e" },
  { commandId: "edit.undo", shortcut: "ctrl+z" },
  { commandId: "edit.redo", shortcut: "ctrl+shift+z" },
  { commandId: "view.fullscreen", shortcut: "f11" },
  { commandId: "agent.sendBrief", shortcut: "ctrl+return" },
  { commandId: "agent.critic", shortcut: "ctrl+shift+c" },
  { commandId: "git.commit", shortcut: "ctrl+k" },
  { commandId: "git.branch", shortcut: "ctrl+shift+`" },
  { commandId: "window.reload", shortcut: "ctrl+shift+f5" },
];
