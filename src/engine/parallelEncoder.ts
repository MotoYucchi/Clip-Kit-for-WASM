import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { AudioOverlayTrack, ClipSegment, EditConfig } from '../types/edit';
import type { MediaMetadata, MediaSourceItem } from '../types/media';
import { getExtension } from '../utils/formatters';
import { buildFullFFmpegCommand, type FFmpegCommandPlan } from './commandBuilder';
import { ffmpegClient } from './ffmpegClient';
import type { PerformanceTuning } from './performanceTuner';

const ST_CDN_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
const MT_CDN_BASE = 'https://unpkg.com/@ffmpeg/core-mt@0.12.10/dist/esm';

export interface ParallelChunkEligibility {
  eligible: boolean;
  chunkCount: number;
}

/**
 * 並列チャンクエンコード（複数 FFmpeg Worker で時間分割して同時エンコード → 無劣化 concat）が
 * 安全かつ効果的に使える条件を判定する。
 */
export function evaluateParallelChunkEligibility(
  metadata: MediaMetadata,
  config: EditConfig,
  clips: ClipSegment[],
  audioTracks: AudioOverlayTrack[],
  tuning: PerformanceTuning
): ParallelChunkEligibility {
  if (tuning.parallelWorkers <= 1) {
    return { eligible: false, chunkCount: 1 };
  }
  if (config.taskType !== 'video' || metadata.isAudioOnly || !metadata.hasVideo) {
    return { eligible: false, chunkCount: 1 };
  }
  if (config.container === 'gif' || config.container === 'webp') {
    return { eligible: false, chunkCount: 1 };
  }
  if (clips.length !== 1 || audioTracks.some((t) => !t.muted)) {
    return { eligible: false, chunkCount: 1 };
  }
  if (
    config.reverse ||
    config.enableTwoPass ||
    config.enableLoudnorm ||
    config.videoFadeInSec > 0 ||
    config.videoFadeOutSec > 0 ||
    config.muteMode === 'range' ||
    config.pip.enabled ||
    config.textOverlay.useTimeRange ||
    config.subtitleHandling === 'burnIn' ||
    config.subtitleHandling === 'embedExternal'
  ) {
    return { eligible: false, chunkCount: 1 };
  }

  const clip = clips[0];
  const startSec = config.trimEnabled ? Math.max(0, clip.startSec) : 0;
  const endSec = config.trimEnabled
    ? Math.min(metadata.durationSec, Math.max(startSec + 0.1, clip.endSec))
    : metadata.durationSec;
  const dur = Math.max(0, endSec - startSec);

  // Only parallelize clips >= 16s so worker startup overhead is easily amortized
  if (dur < 16) {
    return { eligible: false, chunkCount: 1 };
  }

  const maxChunksByDur = Math.max(1, Math.floor(dur / 8));
  const chunkCount = Math.min(tuning.parallelWorkers, maxChunksByDur);
  return { eligible: chunkCount >= 2, chunkCount };
}

async function createIsolatedWorker(preferMT: boolean): Promise<FFmpeg> {
  const ffmpeg = new FFmpeg();
  const baseDir = new URL('./', window.location.href).href;

  if (
    preferMT &&
    typeof window !== 'undefined' &&
    window.crossOriginIsolated &&
    typeof SharedArrayBuffer !== 'undefined'
  ) {
    try {
      const localMtBase = `${baseDir}vendor/ffmpeg-core-mt`;
      const check = await fetch(`${localMtBase}/ffmpeg-core.js`, { method: 'HEAD' });
      if (check.ok) {
        await ffmpeg.load({
          coreURL: `${localMtBase}/ffmpeg-core.js`,
          wasmURL: `${localMtBase}/ffmpeg-core.wasm`,
          workerURL: `${localMtBase}/ffmpeg-core.worker.js`,
        });
        return ffmpeg;
      }
    } catch {
      // Fallback to CDN MT or local ST
    }
    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(`${MT_CDN_BASE}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${MT_CDN_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
        workerURL: await toBlobURL(`${MT_CDN_BASE}/ffmpeg-core.worker.js`, 'text/javascript'),
      });
      return ffmpeg;
    } catch {
      // Fallback to ST
    }
  }

  try {
    const localStBase = `${baseDir}vendor/ffmpeg-core`;
    await ffmpeg.load({
      coreURL: `${localStBase}/ffmpeg-core.js`,
      wasmURL: `${localStBase}/ffmpeg-core.wasm`,
    });
    return ffmpeg;
  } catch {
    await ffmpeg.load({
      coreURL: await toBlobURL(`${ST_CDN_BASE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${ST_CDN_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    return ffmpeg;
  }
}

export interface ParallelEncodeOptions {
  source: MediaSourceItem;
  clip: ClipSegment;
  config: EditConfig;
  tuning: PerformanceTuning;
  chunkCount: number;
  watermarkFile?: File | null;
  telopPngFile?: File | null;
  onProgress?: (pct: number, elapsedMs: number, etaSec: number | null) => void;
  onLog?: (line: string) => void;
  signal?: AbortSignal;
}

/**
 * 動画を K 個のチャンクへ均等分割し、K 個の FFmpeg Web Worker で並列同時エンコード後、
 * 無劣化 concat demuxer (`-c copy`) で瞬時に1本のファイルへ結合する。
 */
export async function runParallelChunkEncode(
  opts: ParallelEncodeOptions
): Promise<{ blob: Blob; elapsedMs: number; fileName: string; mimeType: string; commandPreview: string }> {
  const {
    source,
    clip,
    config,
    tuning,
    chunkCount,
    watermarkFile,
    telopPngFile,
    onProgress,
    onLog,
    signal,
  } = opts;

  const startedAt = performance.now();
  const startSec = config.trimEnabled ? Math.max(0, clip.startSec) : 0;
  const endSec = config.trimEnabled
    ? Math.min(source.metadata.durationSec, Math.max(startSec + 0.1, clip.endSec))
    : source.metadata.durationSec;
  const totalDur = Math.max(1, endSec - startSec);
  const sliceDur = totalDur / chunkCount;

  const workers: FFmpeg[] = [];
  const workerProgress = new Array<number>(chunkCount).fill(0);

  const reportCombinedProgress = (stageWeight = 0.92) => {
    const avg = workerProgress.reduce((s, p) => s + p, 0) / chunkCount;
    const pct = Math.min(92, Math.round(avg * stageWeight));
    const elapsedMs = performance.now() - startedAt;
    const ratio = pct / 100;
    const etaSec =
      ratio > 0.04 ? Math.max(1, Math.round((elapsedMs / ratio - elapsedMs) / 1000)) : null;
    onProgress?.(pct, elapsedMs, etaSec);
  };

  const abortAll = () => {
    for (const w of workers) {
      try {
        w.terminate();
      } catch {
        // Ignore
      }
    }
  };
  signal?.addEventListener('abort', abortAll, { once: true });

  onLog?.(
    `[Parallel Pool] Launching ${chunkCount} concurrent FFmpeg workers (${tuning.x264Preset}, ${tuning.threadsPerParallelWorker}T/worker)...`
  );

  // Build reference plan for download name & mime
  const refPlan = buildFullFFmpegCommand({
    primarySource: source,
    sources: [source],
    clips: [clip],
    audioTracks: [],
    config,
    watermarkFile,
    telopPngFile,
    tuning,
  });

  const chunkTuning: PerformanceTuning = {
    ...tuning,
    ffmpegThreads: tuning.threadsPerParallelWorker,
  };

  let chunkFiles: File[] = [];

  try {
    chunkFiles = await Promise.all(
      Array.from({ length: chunkCount }, async (_, idx) => {
        if (signal?.aborted) throw new Error('CANCELLED');
        const cStart = Number((startSec + idx * sliceDur).toFixed(3));
        const cEnd =
          idx === chunkCount - 1
            ? Number(endSec.toFixed(3))
            : Number((startSec + (idx + 1) * sliceDur).toFixed(3));

        const worker = await createIsolatedWorker(tuning.threadsPerParallelWorker > 1);
        workers.push(worker);
        if (signal?.aborted) {
          worker.terminate();
          throw new Error('CANCELLED');
        }

        const chunkPlan = buildFullFFmpegCommand({
          primarySource: source,
          sources: [source],
          clips: [{ ...clip, startSec: cStart, endSec: cEnd }],
          audioTracks: [],
          config: { ...config, trimEnabled: true, cutMode: 'accurate' },
          watermarkFile,
          telopPngFile,
          tuning: chunkTuning,
        });

        const chunkDurUs = Math.max(100_000, chunkPlan.effectiveDurationSec * 1_000_000);
        worker.on('progress', ({ progress, time }) => {
          let r = Number.isFinite(progress) && progress > 0 && progress <= 1 ? progress : 0;
          if (Number.isFinite(time) && time > 0) {
            r = Math.max(r, Math.min(0.99, time / chunkDurUs));
          }
          workerProgress[idx] = Math.round(r * 100);
          reportCombinedProgress();
        });

        // Mount inputs via WORKERFS (collision-free per-worker dir)
        const pathMap = new Map<string, string>();
        for (let i = 0; i < chunkPlan.inputs.length; i++) {
          const inp = chunkPlan.inputs[i];
          const dir = `/in_${i}`;
          try {
            await worker.createDir(dir).catch(() => undefined);
            await worker.mount('WORKERFS' as never, { files: [inp.file] } as never, dir);
            pathMap.set(inp.placeholder, `${dir}/${inp.file.name}`);
          } catch {
            const ext = getExtension(inp.file.name) || 'bin';
            const mem = `src_${i}.${ext}`;
            await worker.writeFile(mem, await fetchFile(inp.file));
            pathMap.set(inp.placeholder, mem);
          }
        }

        const resolvedArgs = chunkPlan.args.map((a) => pathMap.get(a) ?? a);
        const code = await worker.exec(resolvedArgs);
        if (signal?.aborted) throw new Error('CANCELLED');
        if (code !== 0) {
          throw new Error(`Parallel worker #${idx + 1} failed with exit code ${code}`);
        }

        const raw = await worker.readFile(chunkPlan.outputVirtualName);
        if (typeof raw === 'string') {
          throw new Error(`Unexpected string output from worker #${idx + 1}`);
        }
        const bytes = new Uint8Array(raw);
        workerProgress[idx] = 100;
        reportCombinedProgress();

        // Terminate worker immediately to free WASM heap right away!
        worker.terminate();
        onLog?.(`[Parallel Pool] Worker #${idx + 1}/${chunkCount} finished (${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB)`);

        const ext = getExtension(chunkPlan.outputVirtualName) || 'mp4';
        return new File([bytes], `chunk_${idx}.${ext}`, { type: chunkPlan.mimeType });
      })
    );
  } finally {
    abortAll();
  }

  if (signal?.aborted) throw new Error('CANCELLED');

  // Stitch all encoded chunks losslessly with FFmpeg concat demuxer (-c copy)
  onLog?.(`[Parallel Pool] Concatenating ${chunkCount} chunks losslessly (-c copy)...`);
  const listLines = chunkFiles.map((_, idx) => `file '__IN_${idx}__'`).join('\n');
  const concatListFile = new File([listLines], 'chunks.txt', { type: 'text/plain' });

  const ext = getExtension(refPlan.outputVirtualName) || 'mp4';
  const stitchInputs = chunkFiles.map((file, idx) => ({
    placeholder: `__IN_${idx}__`,
    file,
  }));

  // Resolve concat list with actual mounted paths by passing chunk files as extraFiles in root dir
  const extraFiles = [
    ...chunkFiles.map((file, idx) => ({ virtualPath: `chunk_${idx}.${ext}`, file })),
    {
      virtualPath: 'chunks.txt',
      file: new File(
        [chunkFiles.map((_, idx) => `file 'chunk_${idx}.${ext}'`).join('\n')],
        'chunks.txt',
        { type: 'text/plain' }
      ),
    },
  ];
  void concatListFile;
  void stitchInputs;

  const stitchArgs = ['-f', 'concat', '-safe', '0', '-i', 'chunks.txt', '-c', 'copy'];
  if (ext === 'mp4' || ext === 'mov') {
    stitchArgs.push('-movflags', '+faststart');
  }
  stitchArgs.push('-y', `output.${ext}`);

  const stitchPlan: FFmpegCommandPlan = {
    inputs: [],
    extraFiles,
    pass1Args: null,
    args: stitchArgs,
    outputVirtualName: `output.${ext}`,
    downloadFileName: refPlan.downloadFileName,
    mimeType: refPlan.mimeType,
    commandPreview: `[Parallel ${chunkCount} Workers] -> ffmpeg ${stitchArgs.join(' ')}`,
    effectiveDurationSec: refPlan.effectiveDurationSec,
    usedStreamCopy: true,
    usedTwoPass: false,
    computedVideoBitrateKbps: refPlan.computedVideoBitrateKbps,
    compatWarnings: [],
  };

  const { blob } = await ffmpegClient.runCommand({
    plan: stitchPlan,
    onProgress: (p) => {
      const elapsedMs = performance.now() - startedAt;
      onProgress?.(92 + Math.round(p * 0.08), elapsedMs, 1);
    },
    onLog,
  });

  const elapsedMs = performance.now() - startedAt;
  onProgress?.(100, elapsedMs, 0);
  return {
    blob,
    elapsedMs,
    fileName: refPlan.downloadFileName,
    mimeType: refPlan.mimeType,
    commandPreview: `[Parallel ${chunkCount} Workers · ${tuning.x264Preset}] + lossless concat (-c copy)\n${refPlan.commandPreview}`,
  };
}
