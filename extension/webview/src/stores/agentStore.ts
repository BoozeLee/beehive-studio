import { create } from "zustand";

export interface AdvisoryProposal {
  status?: string;
  degraded?: boolean;
  attribution?: {
    service?: string;
    model?: string;
    profile?: string;
    prompt_versions?: Record<string, string>;
    latency_ms?: number;
  };
  creative_plan?: {
    summary?: string;
    rationale?: string[];
    confidence?: Record<string, number>;
    alternatives?: Array<{ direction?: string; why?: string; delta_summary?: string }>;
    warnings?: string[];
    evidence?: string[];
  };
}

export interface ReasoningStep {
  type: "status" | "reasoning" | "tool_call" | "midi" | "arrangement" | "qa_warning" | "advisory" | "complete" | "error";
  text?: string;
  message?: string;
  name?: string;
  args?: Record<string, unknown>;
  data?: unknown;
  task_id?: string;
  proposal?: AdvisoryProposal;
  clip_preview?: { notes: Array<{ pitch: number; velocity: number; start: number; duration: number }> };
}

export interface HistoryEntry {
  timestamp: number;
  agentId: string;
  brief: string;
  steps: ReasoningStep[];
  accepted: boolean | null;
}

interface AgentState {
  activeAgent: string;
  reasoning: ReasoningStep[];
  status: string;
  isLoading: boolean;
  history: HistoryEntry[];
  agentMemory: string[];
  setActiveAgent: (id: string) => void;
  addStep: (step: ReasoningStep) => void;
  clearReasoning: () => void;
  setStatus: (status: string) => void;
  setLoading: (loading: boolean) => void;
  pushHistory: (entry: HistoryEntry) => void;
  pushMemory: (text: string) => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  activeAgent: "rhythm_groove",
  reasoning: [],
  status: "Ready",
  isLoading: false,
  history: [],
  agentMemory: [],
  setActiveAgent: (id) => set({ activeAgent: id }),
  addStep: (step) => set((s) => ({ reasoning: [...s.reasoning, step] })),
  clearReasoning: () => set({ reasoning: [] }),
  setStatus: (status) => set({ status }),
  setLoading: (loading) => set({ isLoading: loading }),
  pushHistory: (entry) => set((s) => ({ history: [...s.history, entry] })),
  pushMemory: (text) => set((s) => ({ agentMemory: [...s.agentMemory.slice(-9), text] })),
}));
