import { COMPRESSION_PRESETS } from '../config/presets';
import { ffmpegClient } from '../engine/ffmpegClient';
import { computeOutputDimensions } from '../engine/filterGraphBuilder';
import type { AudioOverlayTrack, ClipSegment, EditConfig } from '../types/edit';
import type { MediaMetadata, MediaSourceItem } from '../types/media';
import { clamp, sanitizeFilename, stripExtension } from '../utils/formatters';

export interface WebCodecsEligibility {
  eligible: boolean;
  reasonKey?: string;
}

export interface WebCodecsProbeResult {
  supported: boolean;
  codec: string | null;
  hardwarePreferred: boolean;
}

/**
 * ブラウザの WebCodecs VideoEncoder（H.264 Annex-B ハードウェアエンコード）対応可否を検出する。
 */
export async function probeWebCodecsHardwareSupport(): Promise<WebCodecsProbeResult> {
  if (typeof window === 'undefined' || typeof VideoEncoder === 'undefined') {
    return { supported: false, codec: null, hardwarePreferred: false };
  }

  const candidates = ['avc1.640028', 'avc1.4d0028', 'avc1.42001f'];
  for (const codec of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width: 1280,
        height: 720,
        bitrate: 2_500_000,
        framerate: 30,
        hardwareAcceleration: 'prefer-hardware',
        avc: { format: 'annexb' },
      } as VideoEncoderConfig);
      if (support.supported) {
        return { supported: true, codec, hardwarePreferred: true };
      }
    } catch {
      // Try next profile
    }
  }
  return { supported: false, codec: null, hardwarePreferred: false };
}

/**
 * 現在の設定が WebCodecs ハイブリッド高速パス（GPUエンコード + FFmpeg無劣化リマックス）で実行可能か判定する。
 * 非対応フィルタ（ブラー背景・手ブレ補正・複数クリップ・多トラック等）が有効な場合は FFmpeg.wasm へ安全にフォールバックする。
 */
export function evaluateWebCodecsEligibility(
  metadata: MediaMetadata,
  config: EditConfig,
  clips: ClipSegment[],
  audioTracks: AudioOverlayTrack[],
  supportsWebCodecs: boolean
): WebCodecsEligibility {
  if (!supportsWebCodecs) {
    return { eligible: false, reasonKey: 'hw.reasonUnsupported' };
  }
  if (config.taskType !== 'video' || metadata.isAudioOnly || !metadata.hasVideo) {
    return { eligible: false, reasonKey: 'hw.reasonVideoOnly' };
  }
  if (!metadata.canBrowserPlay) {
    return { eligible: false, reasonKey: 'hw.reasonBrowserDecode' };
  }
  if (config.container !== 'mp4' && config.container !== 'mov') {
    return { eligible: false, reasonKey: 'hw.reasonMp4Only' };
  }
  if (config.videoCodec !== 'h264') {
    return { eligible: false, reasonKey: 'hw.reasonH264Only' };
  }
  if (clips.length > 1 || audioTracks.some((t) => !t.muted)) {
    return { eligible: false, reasonKey: 'hw.reasonComplexGraph' };
  }
  if (
    config.reverse ||
    config.aspectPreset !== 'original' ||
    config.stabilizeLevel !== 'none' ||
    config.deinterlace ||
    config.videoDenoise !== 'none' ||
    config.convertHdrToSdr ||
    config.enableTwoPass ||
    config.pip.enabled ||
    config.subtitleHandling === 'burnIn' ||
    config.videoFadeInSec > 0 ||
    config.videoFadeOutSec > 0
  ) {
    return { eligible: false, reasonKey: 'hw.reasonComplexGraph' };
  }
  return { eligible: true };
}

export interface WebCodecsHybridOptions {
  source: MediaSourceItem;
  clip: ClipSegment;
  config: EditConfig;
  watermarkFile?: File | null;
  telopPngFile?: File | null;
  onProgress?: (pct: number, elapsedMs: number, etaSec: number | null) => void;
  onLog?: (line: string) => void;
  signal?: AbortSignal;
}

/**
 * WebCodecs VideoEncoder（ハードウェア H.264 Annex-B エンコード）＋ FFmpeg.wasm 無劣化リマックスを実行する。
 */
export async function runWebCodecsHybridEncode(
  opts: WebCodecsHybridOptions
): Promise<{ blob: Blob; elapsedMs: number; fileName: string; mimeType: string; commandPreview: string }> {
  const { source, clip, config, watermarkFile, telopPngFile, onProgress, onLog, signal } = opts;
  const startedAt = performance.now();

  const probe = await probeWebCodecsHardwareSupport();
  if (!probe.supported || !probe.codec) {
    throw new Error('WebCodecs H.264 hardware encoder is not supported in this browser.');
  }

  const outDims = computeOutputDimensions(source.metadata, config);
  const outW = Math.max(2, outDims.width || source.metadata.width || 1280);
  const outH = Math.max(2, outDims.height || source.metadata.height || 720);
  const fps = clamp(
    config.fpsPreset === 'custom'
      ? config.customFps
      : config.fpsPreset !== 'original'
        ? Number(config.fpsPreset)
        : Math.round(source.metadata.fps || 30),
    15,
    60
  );

  const presetSpec = COMPRESSION_PRESETS[config.compressionPreset];
  const targetBitrateBps =
    config.rateControlMode === 'bitrate'
      ? clamp(config.targetVideoBitrateKbps, 200, 30_000) * 1000
      : Math.max(400_000, Math.round(outW * outH * fps * presetSpec.estimatedBpp));

  const startSec = config.trimEnabled ? Math.max(0, clip.startSec) : 0;
  const endSec = config.trimEnabled
    ? Math.min(source.metadata.durationSec, Math.max(startSec + 0.1, clip.endSec))
    : source.metadata.durationSec;
  const speed = clamp(config.speed, 0.25, 4);
  const totalOutDuration = Math.max(0.1, (endSec - startSec) / speed);
  const totalFrames = Math.max(1, Math.floor(totalOutDuration * fps));

  onLog?.(
    `[WebCodecs HW] Starting ${probe.codec} ${outW}x${outH} @ ${fps}fps (${Math.round(targetBitrateBps / 1000)} kbps, ${totalFrames} frames)`
  );

  // Load offscreen video element
  const video = document.createElement('video');
  video.src = source.objectUrl;
  video.muted = true;
  video.playsInline = true;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('Failed to load video for WebCodecs decoding'));
  });

  // Optional overlay bitmaps
  const wmBitmap =
    config.watermark.enabled && watermarkFile ? await createImageBitmap(watermarkFile) : null;
  const telopBitmap =
    config.textOverlay.enabled && telopPngFile ? await createImageBitmap(telopPngFile) : null;

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const encodedChunks: Uint8Array[] = [];
  let encoderError: Error | null = null;

  const encoder = new VideoEncoder({
    output: (chunk) => {
      const buf = new Uint8Array(chunk.byteLength);
      chunk.copyTo(buf);
      encodedChunks.push(buf);
    },
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    },
  });

  encoder.configure({
    codec: probe.codec,
    width: outW,
    height: outH,
    bitrate: targetBitrateBps,
    framerate: fps,
    hardwareAcceleration: 'prefer-hardware',
    avc: { format: 'annexb' },
  } as VideoEncoderConfig);

  const filterParts: string[] = [];
  if (Math.abs(config.brightness) >= 0.01) {
    filterParts.push(`brightness(${(1 + config.brightness).toFixed(2)})`);
  }
  if (Math.abs(config.contrast - 1) >= 0.01) {
    filterParts.push(`contrast(${config.contrast.toFixed(2)})`);
  }
  if (Math.abs(config.saturation - 1) >= 0.01) {
    filterParts.push(`saturate(${config.saturation.toFixed(2)})`);
  }
  const canvasFilter = filterParts.length > 0 ? filterParts.join(' ') : 'none';

  const frameDurationUs = Math.round(1_000_000 / fps);
  const srcW = video.videoWidth || outW;
  const srcH = video.videoHeight || outH;
  const sx = config.crop.enabled ? (srcW * config.crop.xPct) / 100 : 0;
  const sy = config.crop.enabled ? (srcH * config.crop.yPct) / 100 : 0;
  const sw = config.crop.enabled ? (srcW * config.crop.widthPct) / 100 : srcW;
  const sh = config.crop.enabled ? (srcH * config.crop.heightPct) / 100 : srcH;

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) throw new Error('CANCELLED');
      if (encoderError) throw encoderError;

      const outTimeSec = i / fps;
      const srcTimeSec = clamp(startSec + outTimeSec * speed, 0, Math.max(0, source.metadata.durationSec - 0.01));

      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
        video.currentTime = srcTimeSec;
      });

      ctx.save();
      ctx.clearRect(0, 0, outW, outH);
      ctx.filter = canvasFilter;
      ctx.translate(outW / 2, outH / 2);
      if (config.rotation !== 0) {
        ctx.rotate((config.rotation * Math.PI) / 180);
      }
      ctx.scale(config.flipHorizontal ? -1 : 1, config.flipVertical ? -1 : 1);
      const drawW = config.rotation === 90 || config.rotation === 270 ? outH : outW;
      const drawH = config.rotation === 90 || config.rotation === 270 ? outW : outH;
      ctx.drawImage(video, sx, sy, sw, sh, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();

      ctx.filter = 'none';
      if (wmBitmap) {
        ctx.save();
        ctx.globalAlpha = clamp(config.watermark.opacity, 0.1, 1);
        const wmW = Math.round((outW * config.watermark.scalePct) / 100);
        const wmH = Math.round((wmBitmap.height / Math.max(1, wmBitmap.width)) * wmW);
        const m = config.watermark.marginPx;
        let wx = outW - wmW - m;
        let wy = outH - wmH - m;
        if (config.watermark.position === 'top-left') {
          wx = m;
          wy = m;
        } else if (config.watermark.position === 'top-right') {
          wx = outW - wmW - m;
          wy = m;
        } else if (config.watermark.position === 'bottom-left') {
          wx = m;
          wy = outH - wmH - m;
        } else if (config.watermark.position === 'center') {
          wx = (outW - wmW) / 2;
          wy = (outH - wmH) / 2;
        }
        ctx.drawImage(wmBitmap, wx, wy, wmW, wmH);
        ctx.restore();
      }

      if (telopBitmap) {
        const showTelop =
          !config.textOverlay.useTimeRange ||
          (outTimeSec >= config.textOverlay.startSec && outTimeSec <= config.textOverlay.endSec);
        if (showTelop) {
          ctx.drawImage(telopBitmap, 0, 0, outW, outH);
        }
      }

      const frame = new VideoFrame(canvas, {
        timestamp: i * frameDurationUs,
        duration: frameDurationUs,
      });
      encoder.encode(frame, { keyFrame: i % Math.round(fps * 2) === 0 });
      frame.close();

      // Backpressure wait so GPU queue doesn't flood memory
      if (encoder.encodeQueueSize > 12) {
        await new Promise((r) => window.setTimeout(r, 8));
      }

      if (i % 5 === 0 || i === totalFrames - 1) {
        const elapsedMs = performance.now() - startedAt;
        const pct = Math.min(82, Math.round(((i + 1) / totalFrames) * 82));
        const ratio = Math.max(0.02, pct / 100);
        const etaSec = Math.max(1, Math.round((elapsedMs / ratio - elapsedMs) / 1000));
        onProgress?.(pct, elapsedMs, etaSec);
      }
    }

    await encoder.flush();
    encoder.close();
  } finally {
    wmBitmap?.close();
    telopBitmap?.close();
    video.removeAttribute('src');
    video.load();
  }

  // Merge Annex-B chunks into a single H.264 File
  const totalBytes = encodedChunks.reduce((sum, c) => sum + c.byteLength, 0);
  const h264Bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of encodedChunks) {
    h264Bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const h264File = new File([h264Bytes], 'webcodecs_hw.h264', { type: 'video/h264' });

  onLog?.(`[WebCodecs HW] Video encoded (${(totalBytes / 1024 / 1024).toFixed(2)} MB). Remuxing into ${config.container.toUpperCase()}...`);

  // Remux with audio via FFmpeg.wasm (-c:v copy: zero video re-encoding!)
  const ext = config.container === 'mov' ? 'mov' : 'mp4';
  const mimeType = ext === 'mov' ? 'video/quicktime' : 'video/mp4';
  const remuxArgs: string[] = ['-r', String(fps), '-i', '__IN_0__'];
  const inputs = [{ placeholder: '__IN_0__', file: h264File }];

  const keepAudio = source.metadata.hasAudio && config.muteMode !== 'all';
  if (keepAudio) {
    if (config.trimEnabled) {
      remuxArgs.push('-ss', startSec.toFixed(3), '-to', endSec.toFixed(3));
    }
    remuxArgs.push('-i', '__IN_1__');
    inputs.push({ placeholder: '__IN_1__', file: source.file });
    remuxArgs.push('-map', '0:v:0', '-map', '1:a:0?');
  } else {
    remuxArgs.push('-map', '0:v:0', '-an');
  }

  remuxArgs.push('-c:v', 'copy');
  if (keepAudio) {
    if (Math.abs(speed - 1) >= 0.001) {
      remuxArgs.push('-af', `atempo=${speed.toFixed(3)}`, '-c:a', 'aac', '-b:a', `${config.audioBitrateKbps}k`);
    } else if (config.audioCodec === 'copy') {
      remuxArgs.push('-c:a', 'copy');
    } else {
      remuxArgs.push('-c:a', 'aac', '-b:a', `${config.audioBitrateKbps}k`);
    }
  }
  remuxArgs.push('-movflags', '+faststart');
  if (config.stripMetadata) {
    remuxArgs.push('-map_metadata', '-1', '-map_chapters', '-1');
  }
  remuxArgs.push('-y', `output.${ext}`);

  const baseName = sanitizeFilename(stripExtension(source.metadata.fileName));
  const downloadFileName = `${baseName}_hw.${ext}`;

  const { blob } = await ffmpegClient.runCommand({
    plan: {
      inputs,
      extraFiles: [],
      pass1Args: null,
      args: remuxArgs,
      outputVirtualName: `output.${ext}`,
      downloadFileName,
      mimeType,
      commandPreview: `[WebCodecs HW ${probe.codec}] -> ffmpeg ${remuxArgs.join(' ')}`,
      effectiveDurationSec: totalOutDuration,
      usedStreamCopy: true,
      usedTwoPass: false,
      computedVideoBitrateKbps: Math.round(targetBitrateBps / 1000),
      compatWarnings: [],
    },
    onProgress: (pct) => {
      const elapsedMs = performance.now() - startedAt;
      onProgress?.(82 + Math.round(pct * 0.18), elapsedMs, 1);
    },
    onLog,
  });

  const elapsedMs = performance.now() - startedAt;
  onProgress?.(100, elapsedMs, 0);
  return {
    blob,
    elapsedMs,
    fileName: downloadFileName,
    mimeType,
    commandPreview: `[WebCodecs HW ${probe.codec} ${outW}x${outH}@${fps}fps] + ffmpeg -c:v copy remux`,
  };
}
