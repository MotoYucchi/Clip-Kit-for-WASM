import {
  AUDIO_EXTRACT_SPECS,
  CONTAINER_SPECS,
  resolveCodecCompatibility,
} from '../config/formats';
import { COMPRESSION_PRESETS } from '../config/presets';
import type { ClipSegment, EditConfig } from '../types/edit';
import type { MediaMetadata } from '../types/media';
import { clamp, sanitizeFilename, stripExtension } from '../utils/formatters';
import { buildFilterGraph } from './filterGraphBuilder';

export interface FFmpegCommandPlan {
  args: string[];
  outputVirtualName: string;
  downloadFileName: string;
  mimeType: string;
  commandPreview: string;
  effectiveDurationSec: number;
  usedStreamCopy: boolean;
  compatWarnings: string[];
}

function getEffectiveAudioTrackMaps(
  metadata: MediaMetadata,
  config: EditConfig
): string[] {
  if (!metadata.hasAudio || config.muteMode === 'all') {
    return [];
  }
  if (config.muteMode === 'removeTrack' && metadata.audioStreams.length > 1) {
    const kept = metadata.audioStreams.filter(
      (s) => !config.removedAudioIndices.includes(s.audioIndex)
    );
    return kept.map((s) => `0:a:${s.audioIndex}`);
  }
  return ['0:a:0?'];
}

export function buildFFmpegCommand(
  inputVirtualPath: string,
  metadata: MediaMetadata,
  config: EditConfig,
  clip: ClipSegment
): FFmpegCommandPlan {
  const baseName = sanitizeFilename(stripExtension(metadata.fileName));
  const trimStart = config.trimEnabled ? clamp(clip.startSec, 0, metadata.durationSec) : 0;
  const trimEnd = config.trimEnabled
    ? clamp(clip.endSec, trimStart + 0.05, Math.max(metadata.durationSec, trimStart + 0.05))
    : metadata.durationSec;
  const trimDuration = Math.max(0.05, trimEnd - trimStart);

  // =========================================================================
  // 1. Snapshot Export (Current frame / Specified time -> PNG / JPEG)
  // =========================================================================
  if (config.taskType === 'snapshot') {
    const ext = config.snapshotFormat === 'png' ? 'png' : 'jpg';
    const mimeType = config.snapshotFormat === 'png' ? 'image/png' : 'image/jpeg';
    const snapshotTime = clamp(config.snapshotTimeSec, 0, Math.max(0, metadata.durationSec));
    const outputVirtualName = `snapshot.${ext}`;

    // Apply visual transforms (crop/rotate/flip/resize/aspect) to snapshot as well
    const visualOnlyConfig: EditConfig = {
      ...config,
      speed: 1,
      reverse: false,
      trimEnabled: false,
      muteMode: 'all',
    };
    const graph = buildFilterGraph(metadata, visualOnlyConfig, clip);

    const args: string[] = ['-ss', snapshotTime.toFixed(3), '-i', inputVirtualPath];
    if (graph.useFilterComplex && graph.filterComplex && graph.videoOutLabel) {
      args.push('-filter_complex', graph.filterComplex, '-map', graph.videoOutLabel);
    } else if (graph.videoFilters.length > 0) {
      args.push('-vf', graph.videoFilters.join(','));
    }

    args.push('-frames:v', '1');
    if (config.snapshotFormat === 'jpeg') {
      args.push('-q:v', String(clamp(Math.round(config.snapshotQuality), 2, 15)));
    }
    if (config.stripMetadata) {
      args.push('-map_metadata', '-1');
    }
    args.push('-y', outputVirtualName);

    return {
      args,
      outputVirtualName,
      downloadFileName: `${baseName}_frame_${Math.round(snapshotTime * 10)}ds.${ext}`,
      mimeType,
      commandPreview: `ffmpeg ${args.join(' ')}`,
      effectiveDurationSec: 0.1,
      usedStreamCopy: false,
      compatWarnings: [],
    };
  }

  // =========================================================================
  // 2. Audio Extraction (MP3 / AAC m4a / WAV / FLAC / Opus)
  // =========================================================================
  if (config.taskType === 'audio-extract') {
    const spec = AUDIO_EXTRACT_SPECS[config.audioExtractFormat];
    const outputVirtualName = `extracted.${spec.extension}`;
    const trackIdx = clamp(
      config.audioExtractTrackIndex,
      0,
      Math.max(0, metadata.audioStreams.length - 1)
    );

    const args: string[] = [];
    if (config.trimEnabled) {
      args.push('-ss', trimStart.toFixed(3), '-to', trimEnd.toFixed(3));
    }
    args.push('-i', inputVirtualPath);
    args.push('-vn', '-map', `0:a:${trackIdx}`);

    const graph = buildFilterGraph(metadata, config, clip);
    if (graph.audioFilters.length > 0) {
      args.push('-af', graph.audioFilters.join(','));
    }

    args.push('-c:a', spec.ffmpegCodec);
    if (spec.supportsBitrate) {
      args.push('-b:a', `${config.audioExtractBitrateKbps}k`);
    }
    if (config.stripMetadata) {
      args.push('-map_metadata', '-1');
    }
    args.push('-y', outputVirtualName);

    return {
      args,
      outputVirtualName,
      downloadFileName: `${baseName}_audio.${spec.extension}`,
      mimeType: spec.mimeType,
      commandPreview: `ffmpeg ${args.join(' ')}`,
      effectiveDurationSec: trimDuration / clamp(config.speed, 0.25, 4),
      usedStreamCopy: false,
      compatWarnings: [],
    };
  }

  // =========================================================================
  // 3. Video Processing (Single-Encode Pipeline or Fast Stream Copy)
  // =========================================================================
  const containerSpec = CONTAINER_SPECS[config.container];
  const compat = resolveCodecCompatibility(
    config.container,
    config.videoCodec,
    config.audioCodec
  );
  const graph = buildFilterGraph(metadata, config, clip);
  const presetSpec = COMPRESSION_PRESETS[config.compressionPreset];
  const audioMaps = getEffectiveAudioTrackMaps(metadata, config);

  // Determine whether stream copy is genuinely possible
  const canVideoCopy =
    compat.videoCodec === 'copy' && !graph.requiresVideoReencode;
  const canAudioCopy =
    compat.audioCodec === 'copy' && !graph.requiresAudioReencode;
  const isFastCutOnly =
    config.trimEnabled &&
    config.cutMode === 'fast' &&
    !graph.requiresVideoReencode &&
    !graph.requiresAudioReencode &&
    !metadata.isAudioOnly;

  const useVideoCopy = canVideoCopy || isFastCutOnly;
  const useAudioCopy = canAudioCopy || isFastCutOnly;

  const effectiveVideoCodec = useVideoCopy
    ? 'copy'
    : compat.videoCodec === 'copy'
      ? containerSpec.defaultVideoCodec
      : compat.videoCodec;

  const effectiveAudioCodec = useAudioCopy
    ? 'copy'
    : compat.audioCodec === 'copy'
      ? containerSpec.defaultAudioCodec
      : compat.audioCodec;

  const args: string[] = [];

  // Seeking strategy: fast seek before -i for stream copy; accurate trim after -i when re-encoding
  if (config.trimEnabled && useVideoCopy && useAudioCopy) {
    args.push('-ss', trimStart.toFixed(3), '-to', trimEnd.toFixed(3), '-i', inputVirtualPath);
  } else {
    args.push('-i', inputVirtualPath);
    if (config.trimEnabled) {
      args.push('-ss', trimStart.toFixed(3), '-to', trimEnd.toFixed(3));
    }
  }

  // Video filter & mapping
  if (metadata.hasVideo) {
    if (graph.useFilterComplex && graph.filterComplex && graph.videoOutLabel) {
      args.push('-filter_complex', graph.filterComplex, '-map', graph.videoOutLabel);
    } else {
      args.push('-map', '0:v:0');
      if (graph.videoFilters.length > 0 && !useVideoCopy) {
        args.push('-vf', graph.videoFilters.join(','));
      }
    }
  }

  // Audio mapping & filters
  if (audioMaps.length === 0) {
    args.push('-an');
  } else {
    for (const mapSpec of audioMaps) {
      args.push('-map', mapSpec);
    }
    if (graph.audioFilters.length > 0 && !useAudioCopy) {
      args.push('-af', graph.audioFilters.join(','));
    }
  }

  // Video encoder parameters
  if (metadata.hasVideo) {
    if (effectiveVideoCodec === 'copy') {
      args.push('-c:v', 'copy');
    } else if (effectiveVideoCodec === 'h264') {
      const crf = config.useCustomCrf ? config.customCrf : presetSpec.crfH264;
      args.push(
        '-c:v',
        'libx264',
        '-preset',
        presetSpec.x264Preset,
        '-crf',
        String(clamp(Math.round(crf), 14, 45)),
        '-pix_fmt',
        'yuv420p'
      );
    } else if (effectiveVideoCodec === 'h265') {
      const crf = config.useCustomCrf ? config.customCrf : presetSpec.crfH265;
      args.push(
        '-c:v',
        'libx265',
        '-preset',
        presetSpec.x264Preset,
        '-crf',
        String(clamp(Math.round(crf), 16, 45)),
        '-pix_fmt',
        'yuv420p',
        '-tag:v',
        'hvc1'
      );
    } else if (effectiveVideoCodec === 'vp9') {
      const crf = config.useCustomCrf ? config.customCrf : presetSpec.crfVp9;
      args.push(
        '-c:v',
        'libvpx-vp9',
        '-crf',
        String(clamp(Math.round(crf), 18, 50)),
        '-b:v',
        '0',
        '-deadline',
        'realtime',
        '-cpu-used',
        '5',
        '-pix_fmt',
        'yuv420p'
      );
    }

    // When re-encoding a phone video that had rotation metadata, FFmpeg auto-rotates frames:
    // explicitly clear rotate metadata so players don't rotate a second time.
    if (effectiveVideoCodec !== 'copy' && metadata.rotation !== 0) {
      args.push('-metadata:s:v:0', 'rotate=0');
    }
  }

  // Audio encoder parameters
  if (audioMaps.length > 0) {
    const audioBitrate = config.audioBitrateKbps || presetSpec.audioBitrateKbps;
    if (effectiveAudioCodec === 'copy') {
      args.push('-c:a', 'copy');
    } else if (effectiveAudioCodec === 'aac') {
      args.push('-c:a', 'aac', '-b:a', `${audioBitrate}k`);
    } else if (effectiveAudioCodec === 'mp3') {
      args.push('-c:a', 'libmp3lame', '-b:a', `${audioBitrate}k`);
    } else if (effectiveAudioCodec === 'opus') {
      args.push('-c:a', 'libopus', '-b:a', `${audioBitrate}k`);
    }
  }

  // Container optimizations & metadata stripping
  if (config.container === 'mp4' || config.container === 'mov') {
    args.push('-movflags', '+faststart');
  }
  if (config.stripMetadata) {
    args.push('-map_metadata', '-1', '-map_chapters', '-1');
  }

  const outputVirtualName = `output.${containerSpec.extension}`;
  args.push('-y', outputVirtualName);

  const compatWarnings = [...compat.warnings];
  if (compat.videoCodec === 'copy' && !useVideoCopy) {
    compatWarnings.push('compat.copyOverriddenByFilter');
  }

  return {
    args,
    outputVirtualName,
    downloadFileName: `${baseName}_clipkit.${containerSpec.extension}`,
    mimeType: containerSpec.mimeType,
    commandPreview: `ffmpeg ${args.join(' ')}`,
    effectiveDurationSec: trimDuration / clamp(config.speed, 0.25, 4),
    usedStreamCopy: useVideoCopy && useAudioCopy,
    compatWarnings,
  };
}
