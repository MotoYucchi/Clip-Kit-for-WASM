import { create } from 'zustand';
import type { ExportResult, WasmMode, WasmStatus } from '../types/job';

interface JobState {
  wasmStatus: WasmStatus;
  wasmMode: WasmMode;
  progress: number;
  etaSec: number | null;
  elapsedMs: number;
  wakeLockActive: boolean;
  logs: string[];
  errorMessage: string | null;
  latestResult: ExportResult | null;

  setWasmState: (status: WasmStatus, mode: WasmMode) => void;
  startJob: (wakeLockActive: boolean) => void;
  updateProgress: (progress: number, elapsedMs: number, etaSec: number | null) => void;
  appendLog: (line: string) => void;
  completeJob: (result: ExportResult) => void;
  failJob: (message: string) => void;
  resetJobError: () => void;
  clearResult: () => void;
}

export const useJobStore = create<JobState>((set, get) => ({
  wasmStatus: 'idle',
  wasmMode: 'st',
  progress: 0,
  etaSec: null,
  elapsedMs: 0,
  wakeLockActive: false,
  logs: [],
  errorMessage: null,
  latestResult: null,

  setWasmState: (wasmStatus, wasmMode) => set({ wasmStatus, wasmMode }),

  startJob: (wakeLockActive) =>
    set({
      progress: 0,
      etaSec: null,
      elapsedMs: 0,
      wakeLockActive,
      logs: [],
      errorMessage: null,
    }),

  updateProgress: (progress, elapsedMs, etaSec) => set({ progress, elapsedMs, etaSec }),

  appendLog: (line) =>
    set((state) => ({
      logs: state.logs.length > 180 ? [...state.logs.slice(-179), line] : [...state.logs, line],
    })),

  completeJob: (result) => {
    const prev = get().latestResult;
    if (prev && prev.objectUrl !== result.objectUrl) {
      URL.revokeObjectURL(prev.objectUrl);
    }
    set({
      latestResult: result,
      progress: 100,
      etaSec: 0,
      wakeLockActive: false,
      errorMessage: null,
    });
  },

  failJob: (errorMessage) =>
    set({
      errorMessage,
      wakeLockActive: false,
      etaSec: null,
    }),

  resetJobError: () => set({ errorMessage: null }),

  clearResult: () => {
    const prev = get().latestResult;
    if (prev) {
      URL.revokeObjectURL(prev.objectUrl);
    }
    set({ latestResult: null });
  },
}));
