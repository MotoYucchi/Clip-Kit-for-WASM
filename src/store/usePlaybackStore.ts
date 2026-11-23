import { create } from 'zustand';

export type PreviewMode = 'original' | 'output' | 'compare';

interface PlaybackState {
  currentTime: number;
  isPlaying: boolean;
  previewMode: PreviewMode;
  seekRequestSec: number | null;

  setCurrentTime: (sec: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setPreviewMode: (mode: PreviewMode) => void;
  requestSeek: (sec: number) => void;
  clearSeekRequest: () => void;
}

export const usePlaybackStore = create<PlaybackState>((set) => ({
  currentTime: 0,
  isPlaying: false,
  previewMode: 'original',
  seekRequestSec: null,

  setCurrentTime: (currentTime) => set({ currentTime }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setPreviewMode: (previewMode) => set({ previewMode }),
  requestSeek: (seekRequestSec) => set({ seekRequestSec, currentTime: seekRequestSec }),
  clearSeekRequest: () => set({ seekRequestSec: null }),
}));
