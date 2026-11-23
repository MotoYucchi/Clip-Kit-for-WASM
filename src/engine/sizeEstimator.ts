import { AUDIO_EXTRACT_SPECS } from '../config/formats';
import { COMPRESSION_PRESETS } from '../config/presets';
import type { ClipSegment, EditConfig } from '../types/edit';
import type { MediaMetadata } from '../types/media';
import { clamp } from '../utils/formatters';
import { buildFilterGraph } from './filterGraphBuilder';

export interface SizeEstimate {
  estimatedBytes: number;
  deltaPercent: number | null;
  confidence: 'exact' | 'approximate';
}

/**
 * 変換前に出力ファイルサイズを概算する。
 */
export function estimateOutputSize(
  metadata: MediaMetadata,
  config: EditConfig,
  clip: ClipSegment
): SizeEstimate {
  const fullDuration = Math.max(0.1, metadata.durationSec);
  const trimDuration = config.trimEnabled
    ? clamp(clip.endSec - clip.startSec, 0.05, fullDuration)
    : fullDuration;
  const outputDuration = trimDuration / clamp(config.speed, 0.25, 4);

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

  const graph = buildFilterGraph(metadata, config, clip);
  const isCopyMode =
    (config.videoCodec === 'copy' && !graph.requiresVideoReencode) ||
    (config.trimEnabled &&
      config.cutMode === 'fast' &&
      !graph.requiresVideoReencode &&
      !graph.requiresAudioReencode);

  if (isCopyMode) {
    const ratio = trimDuration / fullDuration;
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
  const { width, height } = graph.outputDimensions;
  const fps = clamp(metadata.fps ?? 30, 12, 60);

  let videoBpp = preset.estimatedBpp;
  if (config.useCustomCrf) {
    // Every +6 CRF roughly halves bitrate
    const crfDelta = config.customCrf - 23;
    videoBpp = 0.085 * Math.pow(2, -crfDelta / 6);
  }

  // Codec efficiency factor relative to H.264
  const codecFactor =
    config.videoCodec === 'h265' ? 0.72 : config.videoCodec === 'vp9' ? 0.78 : 1.0;

  const videoBitrateBps = metadata.hasVideo
    ? width * height * fps * videoBpp * codecFactor
    : 0;

  const hasAudio = metadata.hasAudio && config.muteMode !== 'all';
  const audioBitrateBps = hasAudio ? (config.audioBitrateKbps || preset.audioBitrateKbps) * 1000 : 0;

  // Container muxing overhead ~2%
  const estimatedBytes = Math.round(((videoBitrateBps + audioBitrateBps) * outputDuration) / 8 * 1.02);
  const deltaPercent =
    metadata.fileSize > 0
      ? Math.round(((estimatedBytes - metadata.fileSize) / metadata.fileSize) * 100)
      : null;

  return {
    estimatedBytes: Math.max(1024, estimatedBytes),
    deltaPercent,
    confidence: 'approximate',
  };
}
