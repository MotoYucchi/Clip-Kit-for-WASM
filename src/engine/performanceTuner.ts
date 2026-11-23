import type { DeviceProfile } from '../types/device';
import type { SpeedProfile } from '../types/edit';
import type { WasmMode } from '../types/job';

export type X264SpeedPreset = 'ultrafast' | 'superfast' | 'veryfast' | 'fast';

export interface PerformanceTuning {
  /** FFmpeg -threads argument for single-worker MT runs */
  ffmpegThreads: number;
  /** x264 / x265 speed preset */
  x264Preset: X264SpeedPreset;
  /** Add -tune fastdecode and sliced-threads for low-latency WASM encoding */
  useFastDecodeTune: boolean;
  /** VP9 -cpu-used value (higher = faster) */
  vp9CpuUsed: number;
  /** Recommended parallel worker count for chunked encoding (1 = disabled) */
  parallelWorkers: number;
  /** Threads per worker when running parallel chunk workers */
  threadsPerParallelWorker: number;
  /** Short badge text for UI display */
  badgeLabel: string;
}

/**
 * 端末スペック（CPUコア数・RAM・端末区分）と実行環境（MT/ST）・速度プロファイルから、
 * FFmpeg.wasm のスレッド数・プリセット・並列チャンクワーカー数を自動最適化する。
 */
export function computePerformanceTuning(
  device: DeviceProfile,
  speedProfile: SpeedProfile,
  wasmMode: WasmMode,
  enableParallelChunks: boolean
): PerformanceTuning {
  const cores = Math.max(1, device.cpuCores || 4);
  const memGB = Math.max(1, device.deviceMemoryGB || 4);
  const isMT = wasmMode === 'mt' || device.supportsSharedArrayBuffer;

  // 1. Optimal FFmpeg -threads count (capped to avoid Emscripten pthread contention)
  let ffmpegThreads = 1;
  if (isMT) {
    if (device.tier === 'pc') {
      ffmpegThreads = Math.min(8, Math.max(2, cores >= 8 ? cores - 2 : cores));
    } else if (device.tier === 'tablet') {
      ffmpegThreads = Math.min(4, Math.max(2, Math.floor(cores * 0.75)));
    } else {
      ffmpegThreads = Math.min(4, Math.max(2, Math.floor(cores * 0.6)));
    }
  }

  // 2. Encoder speed preset (WASM has no AVX2/NEON asm, so ultrafast/superfast are 3x–6x faster)
  let x264Preset: X264SpeedPreset = 'superfast';
  let useFastDecodeTune = false;
  let vp9CpuUsed = 6;

  if (speedProfile === 'fastest') {
    x264Preset = 'ultrafast';
    useFastDecodeTune = true;
    vp9CpuUsed = 8;
  } else if (speedProfile === 'quality') {
    x264Preset = device.tier === 'mobile' ? 'veryfast' : 'fast';
    useFastDecodeTune = false;
    vp9CpuUsed = 4;
  } else if (speedProfile === 'balanced') {
    x264Preset = isMT && device.tier === 'pc' ? 'veryfast' : 'superfast';
    useFastDecodeTune = device.tier === 'mobile';
    vp9CpuUsed = 6;
  } else {
    // 'auto' — adapt aggressively to actual hardware
    if (device.tier === 'mobile' || !isMT) {
      x264Preset = 'ultrafast';
      useFastDecodeTune = true;
      vp9CpuUsed = 8;
    } else if (device.tier === 'tablet' || cores <= 4) {
      x264Preset = 'superfast';
      useFastDecodeTune = true;
      vp9CpuUsed = 7;
    } else {
      x264Preset = 'superfast';
      useFastDecodeTune = false;
      vp9CpuUsed = 6;
    }
  }

  // 3. Parallel Chunk Worker Pool count (gives true multi-core speedup even in ST mode!)
  // Guard RAM strictly: each worker loads ~31MB WASM + frame buffers (~120–180MB per worker).
  let parallelWorkers = 1;
  if (enableParallelChunks) {
    if (device.tier === 'pc' && cores >= 8 && memGB >= 8) {
      parallelWorkers = speedProfile === 'fastest' ? 4 : 3;
    } else if (device.tier === 'pc' && cores >= 4 && memGB >= 4) {
      parallelWorkers = 2;
    } else if (device.tier === 'tablet' && cores >= 6 && memGB >= 6 && !isMT) {
      parallelWorkers = 2;
    } else if (device.tier === 'mobile' && !isMT && cores >= 6 && memGB >= 4 && speedProfile === 'fastest') {
      parallelWorkers = 2;
    }
  }

  const threadsPerParallelWorker = isMT
    ? Math.max(1, Math.min(3, Math.floor(ffmpegThreads / Math.max(1, parallelWorkers))))
    : 1;

  const badgeLabel =
    parallelWorkers > 1
      ? `並列${parallelWorkers}x${isMT ? '·MT' : ''} · ${x264Preset}`
      : isMT
        ? `MT ${ffmpegThreads}T · ${x264Preset}`
        : `ST · ${x264Preset}`;

  return {
    ffmpegThreads,
    x264Preset,
    useFastDecodeTune,
    vp9CpuUsed,
    parallelWorkers,
    threadsPerParallelWorker,
    badgeLabel,
  };
}
