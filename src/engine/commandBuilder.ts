import {
  AUDIO_EXTRACT_SPECS,
  CONTAINER_SPECS,
  resolveCodecCompatibility,
} from '../config/formats';
import { COMPRESSION_PRESETS } from '../config/presets';
import type { AudioOverlayTrack, ClipSegment, EditConfig } from '../types/edit';
import type { MediaMetadata, MediaSourceItem } from '../types/media';
import { clamp, sanitizeFilename, stripExtension } from '../utils/formatters';
import { buildFullFilterGraph } from './filterGraphBuilder';

export interface CommandInputSpec {
  placeholder: string;
  file: File;
}

export interface FFmpegCommandPlan {
  /** Input files in exact order matching __IN_0__, __IN_1__, ... */
  inputs: CommandInputSpec[];
  /** Optional Pass 1 args when 2-pass encoding is enabled */
  pass1Args: string[] | null;
  /** Main execution args (single-pass or Pass 2) */
  args: string[];
  outputVirtualName: string;
  downloadFileName: string;
  mimeType: string;
  commandPreview: string;
  effectiveDurationSec: number;
  usedStreamCopy: boolean;
  usedTwoPass: boolean;
  computedVideoBitrateKbps: number | null;
  compatWarnings: string[];
}

/**
 * 目標ファイルサイズ (MB) と出力尺・音声ビットレートから映像目標ビットレート (kbps) を自動算出する。
 * コンテナオーバーヘッド (~3%) を差し引き、安全に目標サイズ内へ収める。
 */
export function computeTargetVideoBitrateKbps(
  targetSizeMB: number,
  durationSec: number,
  audioBitrateKbps: number,
  hasAudio: boolean
): number {
  const safeDur = Math.max(0.5, durationSec);
  const usableBits = Math.max(64_000, targetSizeMB * 1024 * 1024 * 8 * 0.96);
  const totalKbps = usableBits / safeDur / 1000;
  const audioKbps = hasAudio ? audioBitrateKbps : 0;
  return Math.max(120, Math.round(totalKbps - audioKbps));
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

export interface BuildCommandOptions {
  primarySource: MediaSourceItem;
  sources: MediaSourceItem[];
  clips: ClipSegment[];
  selectedClipId?: string | null;
  audioTracks: AudioOverlayTrack[];
  config: EditConfig;
}

export function buildFullFFmpegCommand(opts: BuildCommandOptions): FFmpegCommandPlan {
  const { primarySource, sources, clips, selectedClipId = null, audioTracks, config } = opts;
  const metadata = primarySource.metadata;
  const primaryClip = clips[0] ?? {
    id: 'clip-0',
    sourceId: primarySource.id,
    startSec: 0,
    endSec: metadata.durationSec,
  };
  const baseName = sanitizeFilename(stripExtension(metadata.fileName));
  const activeAudioTracks = audioTracks.filter((tr) => !tr.muted);

  const trimStart = config.trimEnabled ? clamp(primaryClip.startSec, 0, metadata.durationSec) : 0;
  const trimEnd = config.trimEnabled
    ? clamp(primaryClip.endSec, trimStart + 0.05, Math.max(metadata.durationSec, trimStart + 0.05))
    : metadata.durationSec;
  const trimDuration = Math.max(0.05, trimEnd - trimStart);

  // =========================================================================
  // 1. Snapshot Export
  // =========================================================================
  if (config.taskType === 'snapshot') {
    const ext = config.snapshotFormat === 'png' ? 'png' : 'jpg';
    const mimeType = config.snapshotFormat === 'png' ? 'image/png' : 'image/jpeg';
    const snapshotTime = clamp(config.snapshotTimeSec, 0, Math.max(0, metadata.durationSec));
    const outputVirtualName = `snapshot.${ext}`;

    const visualOnlyConfig: EditConfig = {
      ...config,
      speed: 1,
      reverse: false,
      trimEnabled: false,
      muteMode: 'all',
    };
    const graph = buildFullFilterGraph({
      primaryMetadata: metadata,
      clips: [primaryClip],
      config: visualOnlyConfig,
    });

    const args: string[] = ['-ss', snapshotTime.toFixed(3), '-i', '__IN_0__'];
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
      inputs: [{ placeholder: '__IN_0__', file: primarySource.file }],
      pass1Args: null,
      args,
      outputVirtualName,
      downloadFileName: `${baseName}_frame_${Math.round(snapshotTime * 10)}ds.${ext}`,
      mimeType,
      commandPreview: `ffmpeg ${args.map((a) => (a === '__IN_0__' ? metadata.fileName : a)).join(' ')}`,
      effectiveDurationSec: 0.1,
      usedStreamCopy: false,
      usedTwoPass: false,
      computedVideoBitrateKbps: null,
      compatWarnings: [],
    };
  }

  // =========================================================================
  // 2. Audio Extraction
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
    args.push('-i', '__IN_0__');
    args.push('-vn', '-map', `0:a:${trackIdx}`);

    const graph = buildFullFilterGraph({
      primaryMetadata: metadata,
      clips: [primaryClip],
      config,
    });
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
      inputs: [{ placeholder: '__IN_0__', file: primarySource.file }],
      pass1Args: null,
      args,
      outputVirtualName,
      downloadFileName: `${baseName}_audio.${spec.extension}`,
      mimeType: spec.mimeType,
      commandPreview: `ffmpeg ${args.map((a) => (a === '__IN_0__' ? metadata.fileName : a)).join(' ')}`,
      effectiveDurationSec: trimDuration / clamp(config.speed, 0.25, 4),
      usedStreamCopy: false,
      usedTwoPass: false,
      computedVideoBitrateKbps: null,
      compatWarnings: [],
    };
  }

  // =========================================================================
  // 3. Video Processing (Single-Clip, Multi-Clip Concat, Multi-Track, 2-Pass)
  // =========================================================================
  const containerSpec = CONTAINER_SPECS[config.container];
  const compat = resolveCodecCompatibility(config.container, config.videoCodec, config.audioCodec);
  const presetSpec = COMPRESSION_PRESETS[config.compressionPreset];

  // Collect ordered unique video source inputs referenced by clips
  const inputs: CommandInputSpec[] = [];
  const sourceInputIndexMap = new Map<string, number>();

  const registerSource = (src: MediaSourceItem) => {
    if (sourceInputIndexMap.has(src.id)) return;
    const idx = inputs.length;
    sourceInputIndexMap.set(src.id, idx);
    inputs.push({ placeholder: `__IN_${idx}__`, file: src.file });
  };

  registerSource(primarySource);
  for (const c of clips) {
    const src = sources.find((s) => s.id === c.sourceId);
    if (src) registerSource(src);
  }

  const audioTrackStartInputIndex = inputs.length;
  for (const track of activeAudioTracks) {
    const idx = inputs.length;
    inputs.push({ placeholder: `__IN_${idx}__`, file: track.file });
  }

  const graph = buildFullFilterGraph({
    primaryMetadata: metadata,
    sources,
    clips: clips.length > 0 ? clips : [primaryClip],
    selectedClipId,
    audioTracks: activeAudioTracks,
    config,
    sourceInputIndexMap,
    audioTrackStartInputIndex,
  });

  const isMultiInput = inputs.length > 1;
  const isMultiClip = clips.length > 1;
  const audioMaps = getEffectiveAudioTrackMaps(metadata, config);
  const hasAnyAudioOutput =
    (graph.useFilterComplex && graph.audioOutPads.length > 0) ||
    (!graph.useFilterComplex && audioMaps.length > 0);

  const canVideoCopy =
    !isMultiInput &&
    !isMultiClip &&
    !graph.useFilterComplex &&
    compat.videoCodec === 'copy' &&
    !graph.requiresVideoReencode;

  const canAudioCopy =
    !isMultiInput &&
    !isMultiClip &&
    !graph.useFilterComplex &&
    compat.audioCodec === 'copy' &&
    !graph.requiresAudioReencode;

  const isFastCutOnly =
    !isMultiInput &&
    !isMultiClip &&
    !graph.useFilterComplex &&
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

  const audioBitrate = config.audioBitrateKbps || presetSpec.audioBitrateKbps;

  // Compute video bitrate for bitrate / targetSize modes
  let computedVideoBitrateKbps: number | null = null;
  if (effectiveVideoCodec !== 'copy' && metadata.hasVideo) {
    if (config.rateControlMode === 'bitrate') {
      computedVideoBitrateKbps = clamp(Math.round(config.targetVideoBitrateKbps || 2000), 120, 50_000);
    } else if (config.rateControlMode === 'targetSize') {
      computedVideoBitrateKbps = computeTargetVideoBitrateKbps(
        config.targetSizeMB,
        graph.effectiveDurationSec,
        audioBitrate,
        hasAnyAudioOutput
      );
    }
  }

  const usedTwoPass =
    Boolean(computedVideoBitrateKbps) &&
    config.enableTwoPass &&
    effectiveVideoCodec !== 'copy' &&
    metadata.hasVideo;

  const buildPassArgs = (passNumber: 0 | 1 | 2): string[] => {
    const args: string[] = [];

    // Inputs
    if (!isMultiClip && !isMultiInput && config.trimEnabled && useVideoCopy && useAudioCopy) {
      args.push('-ss', trimStart.toFixed(3), '-to', trimEnd.toFixed(3), '-i', inputs[0].placeholder);
    } else {
      for (const inp of inputs) {
        args.push('-i', inp.placeholder);
      }
      if (!isMultiClip && config.trimEnabled) {
        args.push('-ss', trimStart.toFixed(3), '-to', trimEnd.toFixed(3));
      }
    }

    // Filters & Stream Mapping
    if (graph.useFilterComplex && graph.filterComplex) {
      args.push('-filter_complex', graph.filterComplex);
      if (metadata.hasVideo && graph.videoOutLabel) {
        args.push('-map', graph.videoOutLabel);
      }
      if (passNumber !== 1) {
        if (graph.audioOutPads.length > 0) {
          for (const pad of graph.audioOutPads) {
            args.push('-map', pad.label);
          }
        } else if (activeAudioTracks.length === 0 && audioMaps.length > 0) {
          for (const mapSpec of audioMaps) {
            args.push('-map', mapSpec);
          }
        } else {
          args.push('-an');
        }
      }
    } else {
      if (metadata.hasVideo) {
        args.push('-map', '0:v:0');
        if (graph.videoFilters.length > 0 && !useVideoCopy) {
          args.push('-vf', graph.videoFilters.join(','));
        }
      }
      if (passNumber !== 1) {
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
      }
    }

    // Video codec & rate control
    if (metadata.hasVideo) {
      if (effectiveVideoCodec === 'copy') {
        args.push('-c:v', 'copy');
      } else if (effectiveVideoCodec === 'h264') {
        args.push('-c:v', 'libx264', '-preset', presetSpec.x264Preset, '-pix_fmt', 'yuv420p');
        if (computedVideoBitrateKbps) {
          args.push(
            '-b:v',
            `${computedVideoBitrateKbps}k`,
            '-maxrate',
            `${Math.round(computedVideoBitrateKbps * 1.25)}k`,
            '-bufsize',
            `${Math.round(computedVideoBitrateKbps * 2)}k`
          );
        } else {
          const crf =
            config.rateControlMode === 'crf' || config.useCustomCrf
              ? config.customCrf
              : presetSpec.crfH264;
          args.push('-crf', String(clamp(Math.round(crf), 14, 45)));
        }
      } else if (effectiveVideoCodec === 'h265') {
        args.push(
          '-c:v',
          'libx265',
          '-preset',
          presetSpec.x264Preset,
          '-pix_fmt',
          'yuv420p',
          '-tag:v',
          'hvc1'
        );
        if (computedVideoBitrateKbps) {
          args.push('-b:v', `${computedVideoBitrateKbps}k`);
        } else {
          const crf =
            config.rateControlMode === 'crf' || config.useCustomCrf
              ? config.customCrf
              : presetSpec.crfH265;
          args.push('-crf', String(clamp(Math.round(crf), 16, 45)));
        }
      } else if (effectiveVideoCodec === 'vp9') {
        args.push('-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p');
        if (computedVideoBitrateKbps) {
          args.push('-b:v', `${computedVideoBitrateKbps}k`, '-cpu-used', '4');
        } else {
          const crf =
            config.rateControlMode === 'crf' || config.useCustomCrf
              ? config.customCrf
              : presetSpec.crfVp9;
          args.push(
            '-crf',
            String(clamp(Math.round(crf), 18, 50)),
            '-b:v',
            '0',
            '-deadline',
            'realtime',
            '-cpu-used',
            '5'
          );
        }
      }

      if (config.convertVfrToCfr && effectiveVideoCodec !== 'copy') {
        args.push('-vsync', 'cfr');
      }
      if (effectiveVideoCodec !== 'copy' && metadata.rotation !== 0) {
        args.push('-metadata:s:v:0', 'rotate=0');
      }
    }

    // 2-Pass flags
    if (passNumber === 1) {
      args.push('-pass', '1', '-passlogfile', 'ffmpeg2pass', '-an', '-f', 'null', '-');
      return args;
    }
    if (passNumber === 2) {
      args.push('-pass', '2', '-passlogfile', 'ffmpeg2pass');
    }

    // Audio encoder parameters
    if (hasAnyAudioOutput) {
      if (effectiveAudioCodec === 'copy') {
        args.push('-c:a', 'copy');
      } else if (effectiveAudioCodec === 'aac') {
        args.push('-c:a', 'aac', '-b:a', `${audioBitrate}k`);
      } else if (effectiveAudioCodec === 'mp3') {
        args.push('-c:a', 'libmp3lame', '-b:a', `${audioBitrate}k`);
      } else if (effectiveAudioCodec === 'opus') {
        args.push('-c:a', 'libopus', '-b:a', `${audioBitrate}k`);
      }

      // Label separate audio tracks in MP4/MKV
      if (graph.useFilterComplex && graph.audioOutPads.length > 1) {
        graph.audioOutPads.forEach((pad, idx) => {
          if (pad.title) {
            args.push(`-metadata:s:a:${idx}`, `title=${pad.title}`);
          }
        });
      }
    }

    if (config.container === 'mp4' || config.container === 'mov') {
      args.push('-movflags', '+faststart');
    }
    if (config.stripMetadata) {
      args.push('-map_metadata', '-1', '-map_chapters', '-1');
    }

    const outputVirtualName = `output.${containerSpec.extension}`;
    args.push('-y', outputVirtualName);
    return args;
  };

  const pass1Args = usedTwoPass ? buildPassArgs(1) : null;
  const finalArgs = usedTwoPass ? buildPassArgs(2) : buildPassArgs(0);

  const replacePlaceholdersForPreview = (rawArgs: string[]) =>
    rawArgs
      .map((a) => {
        const hit = inputs.find((inp) => inp.placeholder === a);
        return hit ? `"${hit.file.name}"` : a;
      })
      .join(' ');

  const commandPreview = pass1Args
    ? `# Pass 1\nffmpeg ${replacePlaceholdersForPreview(pass1Args)}\n\n# Pass 2\nffmpeg ${replacePlaceholdersForPreview(finalArgs)}`
    : `ffmpeg ${replacePlaceholdersForPreview(finalArgs)}`;

  const compatWarnings = [...compat.warnings];
  if (compat.videoCodec === 'copy' && !useVideoCopy) {
    compatWarnings.push('compat.copyOverriddenByFilter');
  }
  if (
    activeAudioTracks.length > 0 &&
    config.audioOutputMode === 'separate' &&
    config.container !== 'mp4' &&
    config.container !== 'mkv'
  ) {
    compatWarnings.push('compat.separateTrackNeedsMp4Mkv');
  }

  return {
    inputs,
    pass1Args,
    args: finalArgs,
    outputVirtualName: `output.${containerSpec.extension}`,
    downloadFileName: `${baseName}_clipkit.${containerSpec.extension}`,
    mimeType: containerSpec.mimeType,
    commandPreview,
    effectiveDurationSec: graph.effectiveDurationSec,
    usedStreamCopy: useVideoCopy && useAudioCopy,
    usedTwoPass,
    computedVideoBitrateKbps,
    compatWarnings,
  };
}

/**
 * Phase 1 互換ラッパー（単一ファイルテスト・簡易呼び出し用）
 */
export function buildFFmpegCommand(
  inputVirtualPath: string,
  metadata: MediaMetadata,
  config: EditConfig,
  clip: ClipSegment
): FFmpegCommandPlan {
  const dummyFile = new File([], metadata.fileName, { type: metadata.mimeType });
  const source: MediaSourceItem = {
    id: clip.sourceId || 'src-0',
    file: dummyFile,
    objectUrl: '',
    metadata,
    addedAt: 0,
  };
  const plan = buildFullFFmpegCommand({
    primarySource: source,
    sources: [source],
    clips: [clip],
    audioTracks: [],
    config,
  });
  return {
    ...plan,
    args: plan.args.map((a) => (a === '__IN_0__' ? inputVirtualPath : a)),
    pass1Args: plan.pass1Args
      ? plan.pass1Args.map((a) => (a === '__IN_0__' ? inputVirtualPath : a))
      : null,
  };
}
