import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { WasmMode, WasmStatus } from '../types/job';
import type { MediaMetadata } from '../types/media';
import { getExtension } from '../utils/formatters';
import type { CommandInputSpec, FFmpegCommandPlan } from './commandBuilder';
import { parseFFmpegProbeLog } from './probeParser';

export interface RunCommandOptions {
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
          // Local MT not bundled
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
   * 複数の入力ファイルを個別の WORKERFS ディレクトリ（/in_0, /in_1, ...）へマウントする。
   * 同名ファイル衝突を防ぎ、メモリ複製を回避。非対応環境のみ writeFile へフォールバック。
   */
  private async mountInputFiles(
    ffmpeg: FFmpeg,
    inputs: CommandInputSpec[]
  ): Promise<{ pathMap: Map<string, string>; cleanup: () => Promise<void> }> {
    const pathMap = new Map<string, string>();
    const cleanupFns: Array<() => Promise<void>> = [];

    for (let i = 0; i < inputs.length; i++) {
      const { placeholder, file } = inputs[i];
      const mountDir = `/in_${i}`;
      try {
        await ffmpeg.createDir(mountDir).catch(() => undefined);
        await ffmpeg.mount('WORKERFS' as never, { files: [file] } as never, mountDir);
        pathMap.set(placeholder, `${mountDir}/${file.name}`);
        cleanupFns.push(async () => {
          await ffmpeg.unmount(mountDir).catch(() => undefined);
          await ffmpeg.deleteDir(mountDir).catch(() => undefined);
        });
      } catch {
        const ext = getExtension(file.name) || 'bin';
        const memPath = `input_src_${i}.${ext}`;
        const bytes = await fetchFile(file);
        await ffmpeg.writeFile(memPath, bytes);
        pathMap.set(placeholder, memPath);
        cleanupFns.push(async () => {
          await ffmpeg.deleteFile(memPath).catch(() => undefined);
        });
      }
    }

    return {
      pathMap,
      cleanup: async () => {
        for (const fn of cleanupFns) {
          await fn();
        }
      },
    };
  }

  async probeFile(file: File, baseMeta: MediaMetadata): Promise<MediaMetadata> {
    const ffmpeg = await this.ensureLoaded();
    const { pathMap, cleanup } = await this.mountInputFiles(ffmpeg, [
      { placeholder: '__PROBE__', file },
    ]);
    const inputPath = pathMap.get('__PROBE__')!;
    this.activeLogs = [];

    try {
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
   * 単一パスまたは 2パス FFmpeg コマンドプランを実行する。
   */
  async runCommand(options: RunCommandOptions): Promise<RunCommandResult> {
    const { plan, onProgress, onLog } = options;
    this.cancelled = false;

    const ffmpeg = await this.ensureLoaded();
    this.emitStatus('running');

    const { pathMap, cleanup } = await this.mountInputFiles(ffmpeg, plan.inputs);
    const resolveArgs = (rawArgs: string[]) =>
      rawArgs.map((arg) => pathMap.get(arg) ?? arg);

    const startedAt = performance.now();
    this.activeLogs = [];
    this.activeLogListener = onLog ?? null;

    const targetDurationUs = Math.max(100_000, plan.effectiveDurationSec * 1_000_000);
    const hasTwoPass = Boolean(plan.pass1Args);

    const bindProgressRange = (rangeStartPct: number, rangeEndPct: number) => {
      this.activeProgressHandler = (progress, timeUs) => {
        const elapsedMs = performance.now() - startedAt;
        let localRatio = Number.isFinite(progress) && progress > 0 && progress <= 1 ? progress : 0;
        if (Number.isFinite(timeUs) && timeUs > 0) {
          const byTime = Math.min(0.99, timeUs / targetDurationUs);
          localRatio = Math.max(localRatio, byTime);
        }
        const totalPct = Math.round(
          rangeStartPct + localRatio * (rangeEndPct - rangeStartPct)
        );
        const totalRatio = totalPct / 100;
        const etaSec =
          totalRatio > 0.03
            ? Math.max(1, Math.round((elapsedMs / totalRatio - elapsedMs) / 1000))
            : null;
        onProgress?.(Math.min(99, Math.max(0, totalPct)), elapsedMs, etaSec);
      };
    };

    try {
      // Pass 1 (if 2-pass enabled)
      if (plan.pass1Args) {
        onLog?.('--- [Pass 1 / 2] Analyzing bitrate distribution ---');
        bindProgressRange(0, 45);
        const pass1Code = await ffmpeg.exec(resolveArgs(plan.pass1Args));
        if (this.cancelled) throw new Error('CANCELLED');
        if (pass1Code !== 0) {
          const tail = this.activeLogs.slice(-6).join('\n');
          throw new Error(`FFmpeg Pass 1 failed (code ${pass1Code})\n${tail}`);
        }
        onLog?.('--- [Pass 2 / 2] Final encoding ---');
        bindProgressRange(45, 99);
      } else {
        bindProgressRange(0, 99);
      }

      // Main / Pass 2
      const exitCode = await ffmpeg.exec(resolveArgs(plan.args));
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
        if (hasTwoPass) {
          await ffmpeg.deleteFile('ffmpeg2pass-0.log').catch(() => undefined);
          await ffmpeg.deleteFile('ffmpeg2pass-0.log.mbtree').catch(() => undefined);
        }
        await cleanup();
        this.emitStatus('ready');
      }
    }
  }

  cancelActiveJob(): void {
    this.cancelled = true;
    this.activeLogListener = null;
    this.activeProgressHandler = null;
    if (this.ffmpeg) {
      try {
        this.ffmpeg.terminate();
      } catch {
        // Ignore
      }
    }
    this.ffmpeg = null;
    this.loadPromise = null;
    this.emitStatus('idle');
  }
}

export const ffmpegClient = new FFmpegClient();
