import { create } from 'zustand';

export type PreviewMode = 'original' | 'output' | 'compare';

export interface PlaybackCommand {
  type: 'toggle' | 'pause' | 'seekDelta' | 'stepFrame';
  value?: number;
  nonce: number;
}

interface PlaybackState {
  currentTime: number;
  isPlaying: boolean;
  previewMode: PreviewMode;
  timelineZoom: number;
  seekRequestSec: number | null;
  command: PlaybackCommand | null;

  setCurrentTime: (sec: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setPreviewMode: (mode: PreviewMode) => void;
  setTimelineZoom: (zoom: number) => void;
  requestSeek: (sec: number) => void;
  clearSeekRequest: () => void;
  dispatchCommand: (type: PlaybackCommand['type'], value?: number) => void;
  clearCommand: () => void;
}

let cmdNonce = 0;

export const usePlaybackStore = create<PlaybackState>((set) => ({
  currentTime: 0,
  isPlaying: false,
  previewMode: 'original',
  timelineZoom: 1,
  seekRequestSec: null,
  command: null,

  setCurrentTime: (currentTime) => set({ currentTime }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setPreviewMode: (previewMode) => set({ previewMode }),
  setTimelineZoom: (timelineZoom) => set({ timelineZoom: Math.min(8, Math.max(1, timelineZoom)) }),
  requestSeek: (seekRequestSec) => set({ seekRequestSec, currentTime: seekRequestSec }),
  clearSeekRequest: () => set({ seekRequestSec: null }),
  dispatchCommand: (type, value) =>
    set({ command: { type, value, nonce: ++cmdNonce } }),
  clearCommand: () => set({ command: null }),
}));
