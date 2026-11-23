import { AUDIO_EXTRACT_SPECS } from '../config/formats';
import { COMPRESSION_PRESETS } from '../config/presets';
import type { AudioOverlayTrack, ClipSegment, EditConfig } from '../types/edit';
import type { MediaMetadata } from '../types/media';
import { clamp } from '../utils/formatters';
import { computeTargetVideoBitrateKbps } from './commandBuilder';
import { buildFullFilterGraph } from './filterGraphBuilder';

export interface SizeEstimate {
  estimatedBytes: number;
  deltaPercent: number | null;
  confidence: 'exact' | 'approximate';
  computedVideoBitrateKbps?: number | null;
}

/**
 * 変換前に出力ファイルサイズを概算する（複数クリップ・ビットレート指定・目標サイズ指定・多トラック対応）。
 */
export function estimateOutputSize(
  metadata: MediaMetadata,
  config: EditConfig,
  clipOrClips: ClipSegment | ClipSegment[],
  audioTracks: AudioOverlayTrack[] = [],
  selectedClipId: string | null = null
): SizeEstimate {
  const clips = Array.isArray(clipOrClips) ? clipOrClips : [clipOrClips];
  const fullDuration = Math.max(0.1, metadata.durationSec);
  const graph = buildFullFilterGraph({
    primaryMetadata: metadata,
    clips,
    selectedClipId,
    audioTracks,
    config,
  });
  const outputDuration = Math.max(0.05, graph.effectiveDurationSec);

  if (config.taskType === 'snapshot') {
    const pixels = Math.max(1, metadata.width * metadata.height);
    const bytesPerPixel = config.snapshotFormat === 'png' ? 0.85 : 0.12;
    return {
      estimatedBytes: Math.round(pixels * bytesPerPixel),
      deltaPercent: null,
      confidence: 'approximate',
    };
  }

  if (config.taskType === 'audio-extract') {
    const spec = AUDIO_EXTRACT_SPECS[config.audioExtractFormat];
    const kbps = spec.supportsBitrate ? config.audioExtractBitrateKbps : spec.defaultBitrateKbps;
    const estimatedBytes = Math.round((kbps * 1000 * outputDuration) / 8);
    return {
      estimatedBytes,
      deltaPercent:
        metadata.fileSize > 0
          ? Math.round(((estimatedBytes - metadata.fileSize) / metadata.fileSize) * 100)
          : null,
      confidence: spec.supportsBitrate ? 'exact' : 'approximate',
    };
  }

  if (config.container === 'gif' || config.container === 'webp') {
    const { width, height } = graph.outputDimensions;
    const fps = clamp(config.animatedFps || 12, 5, 24);
    const bytesPerPixelFrame =
      config.container === 'gif' ? 0.16 : 0.045 * (clamp(config.webpQuality || 75, 30, 95) / 75);
    const estimatedBytes = Math.max(
      4096,
      Math.round(width * height * fps * outputDuration * bytesPerPixelFrame)
    );
    return {
      estimatedBytes,
      deltaPercent:
        metadata.fileSize > 0
          ? Math.round(((estimatedBytes - metadata.fileSize) / metadata.fileSize) * 100)
          : null,
      confidence: 'approximate',
    };
  }

  const activeTracks = audioTracks.filter((tr) => !tr.muted);
  const hasOverlay = activeTracks.length > 0;
  const isCopyMode =
    clips.length <= 1 &&
    !hasOverlay &&
    !graph.useFilterComplex &&
    ((config.videoCodec === 'copy' && !graph.requiresVideoReencode) ||
      (config.trimEnabled &&
        config.cutMode === 'fast' &&
        !graph.requiresVideoReencode &&
        !graph.requiresAudioReencode));

  if (isCopyMode) {
    const ratio = graph.timelineDurationSec / fullDuration;
    const estimatedBytes = Math.round(metadata.fileSize * ratio);
    return {
      estimatedBytes,
      deltaPercent:
        metadata.fileSize > 0
          ? Math.round(((estimatedBytes - metadata.fileSize) / metadata.fileSize) * 100)
          : null,
      confidence: 'approximate',
    };
  }

  const preset = COMPRESSION_PRESETS[config.compressionPreset];
  const audioKbps = config.audioBitrateKbps || preset.audioBitrateKbps;
  const hasAudio =
    (metadata.hasAudio && config.muteMode !== 'all') || activeTracks.length > 0;

  // Separate multi-audio tracks multiply audio stream size
  const separateTrackCount =
    hasOverlay &&
    config.audioOutputMode === 'separate' &&
    (config.container === 'mp4' || config.container === 'mkv')
      ? activeTracks.length +
        (metadata.hasAudio && config.originalAudioHandling !== 'replace' ? 1 : 0)
      : hasAudio
        ? 1
        : 0;

  // Explicit target size mode (e.g. Discord 10MB / 25MB)
  if (config.rateControlMode === 'targetSize' && metadata.hasVideo) {
    const targetVideoKbps = computeTargetVideoBitrateKbps(
      config.targetSizeMB,
      outputDuration,
      audioKbps * Math.max(1, separateTrackCount),
      hasAudio
    );
    const totalBps = (targetVideoKbps + audioKbps * separateTrackCount) * 1000;
    const estimatedBytes = Math.round((totalBps * outputDuration) / 8 * 1.03);
    const deltaPercent =
      metadata.fileSize > 0
        ? Math.round(((estimatedBytes - metadata.fileSize) / metadata.fileSize) * 100)
        : null;
    return {
      estimatedBytes: Math.max(1024, estimatedBytes),
      deltaPercent,
      confidence: 'exact',
      computedVideoBitrateKbps: targetVideoKbps,
    };
  }

  // Explicit video bitrate mode
  if (config.rateControlMode === 'bitrate' && metadata.hasVideo) {
    const videoKbps = clamp(config.targetVideoBitrateKbps || 2000, 120, 50_000);
    const totalBps = (videoKbps + audioKbps * separateTrackCount) * 1000;
    const estimatedBytes = Math.round((totalBps * outputDuration) / 8 * 1.02);
    const deltaPercent =
      metadata.fileSize > 0
        ? Math.round(((estimatedBytes - metadata.fileSize) / metadata.fileSize) * 100)
        : null;
    return {
      estimatedBytes: Math.max(1024, estimatedBytes),
      deltaPercent,
      confidence: 'exact',
      computedVideoBitrateKbps: videoKbps,
    };
  }

  // Preset / CRF heuristic mode
  const { width, height } = graph.outputDimensions;
  const fps = clamp(graph.targetFps ?? metadata.fps ?? 30, 12, 60);

  let videoBpp = preset.estimatedBpp;
  if (config.rateControlMode === 'crf' || config.useCustomCrf) {
    const crfDelta = config.customCrf - 23;
    videoBpp = 0.085 * Math.pow(2, -crfDelta / 6);
  }

  const codecFactor =
    config.videoCodec === 'h265' ? 0.72 : config.videoCodec === 'vp9' ? 0.78 : 1.0;

  const videoBitrateBps = metadata.hasVideo
    ? width * height * fps * videoBpp * codecFactor
    : 0;

  const audioBitrateBps = audioKbps * separateTrackCount * 1000;
  const estimatedBytes = Math.round(((videoBitrateBps + audioBitrateBps) * outputDuration) / 8 * 1.02);
  const deltaPercent =
    metadata.fileSize > 0
      ? Math.round(((estimatedBytes - metadata.fileSize) / metadata.fileSize) * 100)
      : null;

  return {
    estimatedBytes: Math.max(1024, estimatedBytes),
    deltaPercent,
    confidence: 'approximate',
    computedVideoBitrateKbps: null,
  };
}
