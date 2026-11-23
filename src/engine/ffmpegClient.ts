import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { WasmMode, WasmStatus } from '../types/job';
import type { MediaMetadata } from '../types/media';
import { getExtension } from '../utils/formatters';
import type { FFmpegCommandPlan } from './commandBuilder';
import { parseFFmpegProbeLog } from './probeParser';

export interface RunCommandOptions {
  file: File;
  plan: FFmpegCommandPlan;
  onProgress?: (pct: number, elapsedMs: number, etaSec: number | null) => void;
  onLog?: (line: string) => void;
}

export interface RunCommandResult {
  blob: Blob;
  elapsedMs: number;
}

const ST_CDN_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
const MT_CDN_BASE = 'https://unpkg.com/@ffmpeg/core-mt@0.12.10/dist/esm';

class FFmpegClient {
  private ffmpeg: FFmpeg | null = null;
  private loadPromise: Promise<FFmpeg> | null = null;
  private wasmMode: WasmMode = 'st';
  private activeLogs: string[] = [];
  private activeLogListener: ((line: string) => void) | null = null;
  private activeProgressHandler: ((progress: number, timeUs: number) => void) | null = null;
  private cancelled = false;
  private statusListeners = new Set<(status: WasmStatus, mode: WasmMode) => void>();

  onStatusChange(listener: (status: WasmStatus, mode: WasmMode) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private emitStatus(status: WasmStatus) {
    for (const listener of this.statusListeners) {
      listener(status, this.wasmMode);
    }
  }

  getMode(): WasmMode {
    return this.wasmMode;
  }

  isLoaded(): boolean {
    return Boolean(this.ffmpeg && this.ffmpeg.loaded);
  }

  async ensureLoaded(): Promise<FFmpeg> {
    if (this.ffmpeg && this.ffmpeg.loaded) {
      return this.ffmpeg;
    }
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      this.emitStatus('loading');
      const ffmpeg = new FFmpeg();

      ffmpeg.on('log', ({ message }) => {
        if (!message) return;
        this.activeLogs.push(message);
        if (this.activeLogs.length > 400) {
          this.activeLogs.shift();
        }
        this.activeLogListener?.(message);
      });

      ffmpeg.on('progress', ({ progress, time }) => {
        this.activeProgressHandler?.(progress, time);
      });

      const canUseMT =
        typeof window !== 'undefined' &&
        window.crossOriginIsolated === true &&
        typeof SharedArrayBuffer !== 'undefined';

      const baseDir = new URL('./', window.location.href).href;

      let loaded = false;

      // 1. Try Multi-Threaded core when COOP/COEP + SharedArrayBuffer are available
      if (canUseMT) {
        try {
          const localMtBase = `${baseDir}vendor/ffmpeg-core-mt`;
          const checkRes = await fetch(`${localMtBase}/ffmpeg-core.js`, { method: 'HEAD' });
          if (checkRes.ok) {
            await ffmpeg.load({
              coreURL: `${localMtBase}/ffmpeg-core.js`,
              wasmURL: `${localMtBase}/ffmpeg-core.wasm`,
              workerURL: `${localMtBase}/ffmpeg-core.worker.js`,
            });
            this.wasmMode = 'mt';
            loaded = true;
          }
        } catch {
          // Local MT not bundled; try CDN MT next
        }

        if (!loaded) {
          try {
            await ffmpeg.load({
              coreURL: await toBlobURL(`${MT_CDN_BASE}/ffmpeg-core.js`, 'text/javascript'),
              wasmURL: await toBlobURL(`${MT_CDN_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
              workerURL: await toBlobURL(`${MT_CDN_BASE}/ffmpeg-core.worker.js`, 'text/javascript'),
            });
            this.wasmMode = 'mt';
            loaded = true;
          } catch (mtErr) {
            console.warn('[ClipKit] MT FFmpeg core unavailable, falling back to ST:', mtErr);
          }
        }
      }

      // 2. Single-Threaded local bundle (works on standard GitHub Pages & offline PWA)
      if (!loaded) {
        const localStBase = `${baseDir}vendor/ffmpeg-core`;
        try {
          await ffmpeg.load({
            coreURL: `${localStBase}/ffmpeg-core.js`,
            wasmURL: `${localStBase}/ffmpeg-core.wasm`,
          });
          this.wasmMode = 'st';
          loaded = true;
        } catch (localStErr) {
          console.warn('[ClipKit] Local ST FFmpeg core load failed, trying CDN:', localStErr);
        }
      }

      // 3. Single-Threaded CDN fallback
      if (!loaded) {
        await ffmpeg.load({
          coreURL: await toBlobURL(`${ST_CDN_BASE}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${ST_CDN_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        this.wasmMode = 'st';
      }

      this.ffmpeg = ffmpeg;
      this.emitStatus('ready');
      return ffmpeg;
    })().catch((err) => {
      this.loadPromise = null;
      this.ffmpeg = null;
      this.emitStatus('error');
      throw err;
    });

    return this.loadPromise;
  }

  /**
   * 入力ファイルを WORKERFS でマウント（メモリ複製を回避）。非対応時のみ writeFile へフォールバック。
   */
  private async mountInputFile(
    ffmpeg: FFmpeg,
    file: File
  ): Promise<{ inputPath: string; cleanup: () => Promise<void> }> {
    const ext = getExtension(file.name) || 'bin';
    const mountDir = '/input_mount';

    try {
      await ffmpeg.createDir(mountDir).catch(() => undefined);
      // @ffmpeg/ffmpeg supports WORKERFS via mount('WORKERFS', { files: [file] }, dir)
      await ffmpeg.mount('WORKERFS' as never, { files: [file] } as never, mountDir);
      const mountedPath = `${mountDir}/${file.name}`;
      return {
        inputPath: mountedPath,
        cleanup: async () => {
          await ffmpeg.unmount(mountDir).catch(() => undefined);
          await ffmpeg.deleteDir(mountDir).catch(() => undefined);
        },
      };
    } catch {
      const memPath = `input_src.${ext}`;
      const bytes = await fetchFile(file);
      await ffmpeg.writeFile(memPath, bytes);
      return {
        inputPath: memPath,
        cleanup: async () => {
          await ffmpeg.deleteFile(memPath).catch(() => undefined);
        },
      };
    }
  }

  /**
   * FFmpeg を用いて正確なメタデータ（回転・HDR・VFR・複数音声トラック等）を解析する。
   */
  async probeFile(file: File, baseMeta: MediaMetadata): Promise<MediaMetadata> {
    const ffmpeg = await this.ensureLoaded();
    const { inputPath, cleanup } = await this.mountInputFile(ffmpeg, file);
    this.activeLogs = [];

    try {
      // `ffmpeg -i <file>` exits with code 1 because no output is specified; stderr contains stream info
      await ffmpeg.exec(['-hide_banner', '-i', inputPath]).catch(() => undefined);
      const parsed = parseFFmpegProbeLog(this.activeLogs, baseMeta);
      return {
        ...parsed,
        durationSec: parsed.durationSec > 0 ? parsed.durationSec : baseMeta.durationSec,
        canBrowserPlay: baseMeta.canBrowserPlay,
      };
    } finally {
      await cleanup();
    }
  }

  /**
   * FFmpeg コマンドプランを実行し、進捗・残り時間通知と確実なメモリ解放を行う。
   */
  async runCommand(options: RunCommandOptions): Promise<RunCommandResult> {
    const { file, plan, onProgress, onLog } = options;
    this.cancelled = false;

    const ffmpeg = await this.ensureLoaded();
    this.emitStatus('running');

    const { inputPath, cleanup } = await this.mountInputFile(ffmpeg, file);
    const args = plan.args.map((arg) => (arg === '__INPUT__' ? inputPath : arg));

    const startedAt = performance.now();
    this.activeLogs = [];
    this.activeLogListener = onLog ?? null;

    const targetDurationUs = Math.max(100_000, plan.effectiveDurationSec * 1_000_000);
    this.activeProgressHandler = (progress, timeUs) => {
      const elapsedMs = performance.now() - startedAt;
      let ratio = Number.isFinite(progress) && progress > 0 && progress <= 1 ? progress : 0;
      if (Number.isFinite(timeUs) && timeUs > 0) {
        const byTime = Math.min(0.99, timeUs / targetDurationUs);
        ratio = Math.max(ratio, byTime);
      }
      const pct = Math.max(0, Math.min(99, Math.round(ratio * 100)));
      const etaSec =
        ratio > 0.03 ? Math.max(1, Math.round(((elapsedMs / ratio) - elapsedMs) / 1000)) : null;
      onProgress?.(pct, elapsedMs, etaSec);
    };

    try {
      const exitCode = await ffmpeg.exec(args);
      if (this.cancelled) {
        throw new Error('CANCELLED');
      }
      if (exitCode !== 0) {
        const tail = this.activeLogs.slice(-6).join('\n');
        throw new Error(`FFmpeg exited with code ${exitCode}\n${tail}`);
      }

      const rawData = await ffmpeg.readFile(plan.outputVirtualName);
      if (typeof rawData === 'string') {
        throw new Error('Unexpected string output from FFmpeg');
      }
      const uint8 = new Uint8Array(rawData);
      const blob = new Blob([uint8], { type: plan.mimeType });
      const elapsedMs = performance.now() - startedAt;
      onProgress?.(100, elapsedMs, 0);

      return { blob, elapsedMs };
    } finally {
      this.activeLogListener = null;
      this.activeProgressHandler = null;
      if (!this.cancelled && this.ffmpeg?.loaded) {
        await ffmpeg.deleteFile(plan.outputVirtualName).catch(() => undefined);
        await cleanup();
        this.emitStatus('ready');
      }
    }
  }

  /**
   * 実行中の FFmpeg Worker を強制終了し、メモリを即解放する。
   */
  cancelActiveJob(): void {
    this.cancelled = true;
    this.activeLogListener = null;
    this.activeProgressHandler = null;
    if (this.ffmpeg) {
      try {
        this.ffmpeg.terminate();
      } catch {
        // Ignore termination errors
      }
    }
    this.ffmpeg = null;
    this.loadPromise = null;
    this.emitStatus('idle');
  }
}

export const ffmpegClient = new FFmpegClient();
