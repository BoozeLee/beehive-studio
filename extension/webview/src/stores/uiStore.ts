import { create } from "zustand";

interface UIState {
  sidebarCollapsed: boolean;
  bottomPanelOpen: boolean;
  activeRoute: string;
  toggleSidebar: () => void;
  toggleBottomPanel: () => void;
  setActiveRoute: (route: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  bottomPanelOpen: false,
  activeRoute: "/",
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleBottomPanel: () => set((s) => ({ bottomPanelOpen: !s.bottomPanelOpen })),
  setActiveRoute: (route) => set({ activeRoute: route }),
}));
