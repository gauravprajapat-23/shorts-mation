import { create } from "zustand";

type EditorPlaybackState = {
  playheadMs: number;
  playing: boolean;
  timelineZoom: number;
  setPlayheadMs: (ms: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlaying: () => void;
  setTimelineZoom: (zoom: number) => void;
  resetPlayback: () => void;
};

export const useEditorPlaybackStore = create<EditorPlaybackState>((set) => ({
  playheadMs: 0,
  playing: false,
  timelineZoom: 1,
  setPlayheadMs: (playheadMs) => set({ playheadMs: Math.max(0, playheadMs) }),
  setPlaying: (playing) => set({ playing }),
  togglePlaying: () => set((state) => ({ playing: !state.playing })),
  setTimelineZoom: (timelineZoom) => set({ timelineZoom: Math.max(0.5, Math.min(4, timelineZoom)) }),
  resetPlayback: () => set({ playheadMs: 0, playing: false }),
}));
