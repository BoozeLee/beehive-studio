import { create } from "zustand";
import type {
  AgentInfo,
  AgentSession,
  GatewayHealth,
  OrchestratorHealth,
} from "../../../src/services/types";

export interface Toast {
  id: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}

export type Route =
  | "/dashboard"
  | "/project"
  | "/timeline"
  | "/pattern"
  | "/mixer"
  | "/session"
  | "/agent"
  | "/taste"
  | "/settings";

interface AppState {
  activeRoute: Route;
  gatewayHealth: GatewayHealth | null;
  orchestratorHealth: OrchestratorHealth | null;
  agents: AgentInfo[];
  sessions: AgentSession[];
  notifications: Toast[];
  isLoading: boolean;

  setRoute: (route: Route) => void;
  setGatewayHealth: (health: GatewayHealth | null) => void;
  setOrchestratorHealth: (health: OrchestratorHealth | null) => void;
  setAgents: (agents: AgentInfo[]) => void;
  addSession: (session: AgentSession) => void;
  updateSession: (session: AgentSession) => void;
  setSessions: (sessions: AgentSession[]) => void;
  addNotification: (message: string, type?: Toast["type"]) => void;
  removeNotification: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeRoute: "/dashboard",
  gatewayHealth: null,
  orchestratorHealth: null,
  agents: [],
  sessions: [],
  notifications: [],
  isLoading: false,

  setRoute: (route) => set({ activeRoute: route }),

  setGatewayHealth: (health) => set({ gatewayHealth: health }),

  setOrchestratorHealth: (health) => set({ orchestratorHealth: health }),

  setAgents: (agents) => set({ agents }),

  addSession: (session) =>
    set((state) => ({
      sessions: [session, ...state.sessions],
    })),

  updateSession: (session) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === session.id ? session : s)),
    })),

  setSessions: (sessions) => set({ sessions }),

  addNotification: (message, type = "info") =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        { id: `${Date.now()}-${Math.random()}`, message, type },
      ],
    })),

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  setLoading: (loading) => set({ isLoading: loading }),
}));
