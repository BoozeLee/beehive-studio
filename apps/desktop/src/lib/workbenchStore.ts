import { create } from "zustand";

export type LeftTab = "project" | "patterns" | "samples" | "git" | "plugins";
export type RightTab = "inspector" | "agents" | "proposal" | "taste";
export type BottomTab = "agent" | "console" | "problems" | "build";

export interface AgentMessage {
  id: string;
  role: "user" | "agent" | "tool" | "system";
  agentId?: string;
  text?: string;
  createdAt: number;
  proposal?: unknown;
  clipPreview?: { notes: Array<{ pitch: number; velocity: number; start: number; duration: number }> };
  toolCall?: { name: string; args: Record<string, unknown> };
}

export interface ChatSession {
  id: string;
  title: string;
  agentId: string;
  messages: AgentMessage[];
  status: "idle" | "streaming" | "error";
}

export interface WorkbenchState {
  panels: {
    left: { open: boolean; activeTab: LeftTab };
    right: { open: boolean; activeTab: RightTab };
    bottom: { open: boolean; activeTab: BottomTab };
  };
  center: {
    tabs: string[];
    activeTab: string;
  };
  chat: {
    sessions: ChatSession[];
    activeSessionId: string;
  };
  togglePanel(side: "left" | "right" | "bottom"): void;
  openPanel(side: "left" | "right" | "bottom", tab?: string): void;
  setActiveCenterTab(id: string): void;
  openCenterTab(id: string): void;
  closeCenterTab(id: string): void;
  addMessage(sessionId: string, message: AgentMessage): void;
  updateSessionStatus(sessionId: string, status: ChatSession["status"]): void;
  setActiveSession(id: string): void;
  createSession(agentId: string, title?: string): string;
}

function makeSession(agentId: string, title?: string): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: title || `New ${agentId} chat`,
    agentId,
    messages: [],
    status: "idle",
  };
}

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  panels: {
    left: { open: true, activeTab: "project" },
    right: { open: true, activeTab: "agents" },
    bottom: { open: true, activeTab: "agent" },
  },
  center: {
    tabs: ["arrangement", "prompt", "lua", "waveform"],
    activeTab: "arrangement",
  },
  chat: {
    sessions: [makeSession("rhythm_groove", "Rhythm & Groove")],
    activeSessionId: "",
  },

  togglePanel(side) {
    set((state) => ({
      panels: {
        ...state.panels,
        [side]: { ...state.panels[side], open: !state.panels[side].open },
      },
    }));
  },

  openPanel(side, tab) {
    set((state) => ({
      panels: {
        ...state.panels,
        [side]: { open: true, activeTab: (tab ?? state.panels[side].activeTab) as WorkbenchState["panels"][typeof side]["activeTab"] },
      },
    }));
  },

  setActiveCenterTab(id) {
    set((state) => ({ center: { ...state.center, activeTab: id } }));
  },

  openCenterTab(id) {
    set((state) => {
      if (state.center.tabs.includes(id)) {
        return { center: { ...state.center, activeTab: id } };
      }
      return { center: { tabs: [...state.center.tabs, id], activeTab: id } };
    });
  },

  closeCenterTab(id) {
    set((state) => {
      const tabs = state.center.tabs.filter((t) => t !== id);
      const activeTab = state.center.activeTab === id ? tabs[tabs.length - 1] || "" : state.center.activeTab;
      return { center: { tabs, activeTab } };
    });
  },

  addMessage(sessionId, message) {
    set((state) => ({
      chat: {
        ...state.chat,
        sessions: state.chat.sessions.map((s) =>
          s.id === sessionId ? { ...s, messages: [...s.messages, message] } : s
        ),
      },
    }));
  },

  updateSessionStatus(sessionId, status) {
    set((state) => ({
      chat: {
        ...state.chat,
        sessions: state.chat.sessions.map((s) => (s.id === sessionId ? { ...s, status } : s)),
      },
    }));
  },

  setActiveSession(id) {
    set((state) => ({ chat: { ...state.chat, activeSessionId: id } }));
  },

  createSession(agentId, title) {
    const session = makeSession(agentId, title);
    set((state) => ({
      chat: {
        sessions: [...state.chat.sessions, session],
        activeSessionId: session.id,
      },
    }));
    return session.id;
  },
}));

const initial = useWorkbenchStore.getState();
if (!initial.chat.activeSessionId && initial.chat.sessions[0]) {
  useWorkbenchStore.setState({ chat: { ...initial.chat, activeSessionId: initial.chat.sessions[0].id } });
}
