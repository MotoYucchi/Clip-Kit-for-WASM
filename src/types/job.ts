export type WasmStatus = 'idle' | 'loading' | 'ready' | 'running' | 'error';
export type WasmMode = 'mt' | 'st';

export interface ExportResult {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  blob: Blob;
  objectUrl: string;
  createdAt: number;
  elapsedMs: number;
  commandPreview: string;
  taskType: 'video' | 'audio-extract' | 'snapshot';
}

export interface JobStateSnapshot {
  wasmStatus: WasmStatus;
  wasmMode: WasmMode;
  progress: number; // 0..100
  stageLabel: string;
  startedAt: number | null;
  etaSec: number | null;
  logs: string[];
  errorMessage: string | null;
  latestResult: ExportResult | null;
}
