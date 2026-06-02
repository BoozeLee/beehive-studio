import { create } from "zustand";
import type { ID } from "../../../../packages/core-models/index";

export interface MixerState {
  // Map of trackId to mixer settings
  settings: Record<ID, {
    volume: number; // 0.0 to 2.0 (0 to 200%)
    pan: number;    // -1.0 (left) to 1.0 (right)
    muted: boolean;
    soloed: boolean;
  }>;
  // Master volume
  masterVolume: number;

  // Setters
  setTrackSettings: (trackId: ID, partial: Partial<{
    volume: number;
    pan: number;
    muted: boolean;
    soloed: boolean;
  }>) => void;
  removeTrackSettings: (trackId: ID) => void;
  setMasterVolume: (volume: number) => void;
}

export const useMixerStore = create<MixerState>((set) => ({
  settings: {},
  masterVolume: 1.0,

  setTrackSettings: (trackId, partial) => {
    set((state) => {
      const current = state.settings[trackId] ?? {
        volume: 1.0,
        pan: 0.0,
        muted: false,
        soloed: false,
      };
      const updated = { ...current, ...partial };
      return {
        ...state,
        settings: {
          ...state.settings,
          [trackId]: updated,
        },
      };
    });
  },

  removeTrackSettings: (trackId) => {
    set((state) => {
      const { [trackId]: removed, ...rest } = state.settings;
      return { ...state, settings: rest };
    });
  },

  setMasterVolume: (volume) => {
    set({ masterVolume: volume });
  },
}));