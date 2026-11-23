import { ASPECT_RATIO_PRESETS, RESOLUTION_PRESET_HEIGHTS } from '../config/presets';
import type { AudioOverlayTrack, ClipSegment, EditConfig } from '../types/edit';
import type { MediaMetadata, MediaSourceItem } from '../types/media';
import { clamp, makeEven, normalizeHexColor } from '../utils/formatters';

export interface Dimensions {
  width: number;
  height: number;
}

export interface AudioOutputPad {
  label: string;
  title?: string;
}

export interface FilterGraphPlan {
  /** Whether we need -filter_complex */
  useFilterComplex: boolean;
  /** Value for -filter_complex when useFilterComplex is true */
  filterComplex: string | null;
  /** Output pad label for video when useFilterComplex is true */
  videoOutLabel: string | null;
  /** Output pad labels for audio when useFilterComplex is true */
  audioOutPads: AudioOutputPad[];
  /** Simple -vf filter chain when useFilterComplex is false */
  videoFilters: string[];
  /** Simple -af filter chain when useFilterComplex is false */
  audioFilters: string[];
  /** Whether any video pixel transformation requires re-encoding */
  requiresVideoReencode: boolean;
  /** Whether any audio transformation requires re-encoding */
  requiresAudioReencode: boolean;
  /** Resolved final output dimensions */
  outputDimensions: Dimensions;
  /** Resolved target FPS if explicitly set or CFR forced */
  targetFps: number | null;
  /** Total timeline duration before global speed adjustment */
  timelineDurationSec: number;
  /** Final output duration after speed adjustment */
  effectiveDurationSec: number;
}

export function resolveTargetFps(metadata: MediaMetadata, config: EditConfig): number | null {
  if (config.fpsPreset === 'custom') {
    return clamp(config.customFps || 30, 5, 120);
  }
  if (config.fpsPreset !== 'original') {
    return Number(config.fpsPreset);
  }
  if (config.convertVfrToCfr) {
    return Math.round(clamp(metadata.fps || 30, 15, 60));
  }
  return null;
}

/**
 * 0.5〜2.0 の範囲外速度でもピッチ維持できるよう atempo を多段連結する。
 * 例: 0.25x -> ["atempo=0.5", "atempo=0.5"], 4x -> ["atempo=2.0", "atempo=2.0"]
 */
export function buildAtempoFilters(speed: number): string[] {
  const safeSpeed = clamp(speed, 0.25, 4);
  if (Math.abs(safeSpeed - 1) < 0.001) return [];

  const filters: string[] = [];
  let remaining = safeSpeed;

  while (remaining > 2.0 + 1e-4) {
    filters.push('atempo=2.0');
    remaining /= 2.0;
  }
  while (remaining < 0.5 - 1e-4) {
    filters.push('atempo=0.5');
    remaining /= 0.5;
  }

  const rounded = Number(remaining.toFixed(4));
  const formatted = Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded);
  filters.push(`atempo=${formatted}`);
  return filters;
}

/**
 * HDR → SDR トーンマッピングフィルタチェーン（@ffmpeg/core 同梱 libzimg + tonemap 使用）。
 */
export function buildHdrToSdrFilters(): string[] {
  return [
    'zscale=t=linear:npl=100',
    'format=gbrpf32le',
    'zscale=p=bt709',
    'tonemap=tonemap=hable:desat=0',
    'zscale=t=bt709:m=bt709:r=tv',
    'format=yuv420p',
  ];
}

/**
 * クロップ → ユーザー回転 → 解像度変更 → 画面比率変更の順に最終出力解像度を算出する。
 */
export function computeOutputDimensions(
  metadata: MediaMetadata,
  config: EditConfig
): Dimensions {
  if (!metadata.hasVideo || metadata.width <= 0 || metadata.height <= 0) {
    return { width: 0, height: 0 };
  }

  let w = metadata.width;
  let h = metadata.height;

  if (config.crop.enabled) {
    w = Math.max(16, Math.round((w * clamp(config.crop.widthPct, 5, 100)) / 100));
    h = Math.max(16, Math.round((h * clamp(config.crop.heightPct, 5, 100)) / 100));
  }

  if (config.rotation === 90 || config.rotation === 270) {
    [w, h] = [h, w];
  }

  if (config.resolutionPreset === 'scale') {
    const factor = clamp(config.scalePercent, 25, 400) / 100;
    w = makeEven(w * factor);
    h = makeEven(h * factor);
  } else if (config.resolutionPreset === 'custom') {
    const targetW = makeEven(clamp(config.customWidth, 64, 7680));
    const targetH = makeEven(clamp(config.customHeight, 64, 4320));
    if (config.keepAspectRatio) {
      const ratio = w / h;
      w = targetW;
      h = makeEven(targetW / ratio);
    } else {
      w = targetW;
      h = targetH;
    }
  } else if (config.resolutionPreset !== 'original') {
    const targetShortOrHeight = RESOLUTION_PRESET_HEIGHTS[config.resolutionPreset].height;
    if (h > w) {
      const scale = targetShortOrHeight / w;
      w = makeEven(targetShortOrHeight);
      h = makeEven(h * scale);
    } else {
      const scale = targetShortOrHeight / h;
      h = makeEven(targetShortOrHeight);
      w = makeEven(w * scale);
    }
  }

  if (config.aspectPreset !== 'original') {
    const ratio =
      config.aspectPreset === 'custom'
        ? clamp(config.customAspectW, 1, 100) / clamp(config.customAspectH, 1, 100)
        : ASPECT_RATIO_PRESETS[config.aspectPreset].w /
          ASPECT_RATIO_PRESETS[config.aspectPreset].h;

    const longest = Math.max(w, h);
    if (ratio >= 1) {
      w = makeEven(longest);
      h = makeEven(longest / ratio);
    } else {
      h = makeEven(longest);
      w = makeEven(longest * ratio);
    }
  }

  return { width: makeEven(w), height: makeEven(h) };
}

export interface MultiInputGraphOptions {
  primaryMetadata: MediaMetadata;
  sources?: MediaSourceItem[];
  clips: ClipSegment[];
  selectedClipId?: string | null;
  audioTracks?: AudioOverlayTrack[];
  config: EditConfig;
  /** Map from sourceId -> FFmpeg input index (0..M-1) */
  sourceInputIndexMap?: Map<string, number>;
  /** Starting FFmpeg input index for active audio overlay tracks */
  audioTrackStartInputIndex?: number;
}

/**
 * 単一クリップ〜複数クリップ連結・多トラック音声・HDR→SDR・CFR・画面比率3モードを
 * 単一エンコード用の FFmpeg フィルタグラフへ統合する。
 */
export function buildFullFilterGraph(opts: MultiInputGraphOptions): FilterGraphPlan {
  const {
    primaryMetadata,
    sources = [],
    clips,
    selectedClipId = null,
    audioTracks = [],
    config,
    sourceInputIndexMap,
    audioTrackStartInputIndex = 1,
  } = opts;

  const activeAudioTracks = audioTracks.filter((tr) => !tr.muted);
  const isMultiClip = clips.length > 1;
  const hasOverlayAudio = activeAudioTracks.length > 0 && config.taskType === 'video';
  const targetFps = resolveTargetFps(primaryMetadata, config);
  const outputDimensions = computeOutputDimensions(primaryMetadata, config);
  const scaleFlag = config.scaleAlgorithm === 'bicubic' ? 'bicubic' : 'lanczos';

  // Calculate timeline duration
  let timelineDurationSec = 0;
  let effectiveDurationSec = 0;
  const globalSpeed = config.speedScope === 'all' ? clamp(config.speed, 0.25, 4) : 1;

  if (clips.length === 0) {
    timelineDurationSec = Math.max(0.05, primaryMetadata.durationSec);
    effectiveDurationSec = timelineDurationSec / globalSpeed;
  } else {
    for (const c of clips) {
      const segDur = config.trimEnabled || isMultiClip
        ? Math.max(0.05, c.endSec - c.startSec)
        : Math.max(0.05, primaryMetadata.durationSec);
      timelineDurationSec += segDur;
      const clipSpeed =
        config.speedScope === 'selectedClip' && c.id === selectedClipId
          ? clamp(config.speed, 0.25, 4)
          : globalSpeed;
      effectiveDurationSec += segDur / clipSpeed;
    }
  }

  const preAspectFilters: string[] = [];
  const postAspectFilters: string[] = [];

  if (primaryMetadata.hasVideo) {
    if (config.convertHdrToSdr) {
      preAspectFilters.push(...buildHdrToSdrFilters());
    }

    if (config.crop.enabled) {
      const xPct = clamp(config.crop.xPct, 0, 95) / 100;
      const yPct = clamp(config.crop.yPct, 0, 95) / 100;
      const wPct = clamp(config.crop.widthPct, 5, 100 - config.crop.xPct) / 100;
      const hPct = clamp(config.crop.heightPct, 5, 100 - config.crop.yPct) / 100;
      preAspectFilters.push(
        `crop=trunc(iw*${wPct.toFixed(4)}/2)*2:trunc(ih*${hPct.toFixed(4)}/2)*2:trunc(iw*${xPct.toFixed(4)}):trunc(ih*${yPct.toFixed(4)})`
      );
    }

    if (config.rotation === 90) {
      preAspectFilters.push('transpose=1');
    } else if (config.rotation === 180) {
      preAspectFilters.push('transpose=1,transpose=1');
    } else if (config.rotation === 270) {
      preAspectFilters.push('transpose=2');
    }
    if (config.flipHorizontal) preAspectFilters.push('hflip');
    if (config.flipVertical) preAspectFilters.push('vflip');

    if (config.aspectPreset === 'original' && config.resolutionPreset !== 'original') {
      preAspectFilters.push(
        `scale=${outputDimensions.width}:${outputDimensions.height}:flags=${scaleFlag}`
      );
    }

    if (config.speedScope === 'all' && Math.abs(config.speed - 1) >= 0.001) {
      const ptsFactor = (1 / clamp(config.speed, 0.25, 4)).toFixed(5);
      postAspectFilters.push(`setpts=${ptsFactor}*PTS`);
    }
    if (config.reverse) {
      postAspectFilters.push('reverse');
    }
    if (targetFps !== null) {
      postAspectFilters.push(`fps=${targetFps}`);
    }
  }

  // Original audio linear filters (used in both simple and complex graphs)
  const keepOriginalAudio =
    primaryMetadata.hasAudio &&
    config.muteMode !== 'all' &&
    (!hasOverlayAudio || config.originalAudioHandling !== 'replace');

  const origAudioFilters: string[] = [];
  if (keepOriginalAudio) {
    if (config.muteMode === 'range') {
      const trimOffset = config.trimEnabled && !isMultiClip && clips[0] ? clips[0].startSec : 0;
      const relStart = Math.max(0, config.muteRangeStartSec - trimOffset);
      const relEnd = Math.max(relStart, config.muteRangeEndSec - trimOffset);
      if (relEnd > relStart) {
        origAudioFilters.push(
          `volume=enable='between(t,${relStart.toFixed(3)},${relEnd.toFixed(3)})':volume=0`
        );
      }
    }
    if (config.speedScope === 'all' && Math.abs(config.speed - 1) >= 0.001) {
      origAudioFilters.push(...buildAtempoFilters(config.speed));
    }
    if (config.reverse) {
      origAudioFilters.push('areverse');
    }
    if (hasOverlayAudio && Math.abs(config.originalAudioVolume - 1) >= 0.01) {
      origAudioFilters.push(`volume=${clamp(config.originalAudioVolume, 0, 2).toFixed(2)}`);
    }
    if (!hasOverlayAudio && config.enableLoudnorm) {
      origAudioFilters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
    }
  }

  const needsBlurComplex =
    primaryMetadata.hasVideo && config.aspectPreset !== 'original' && config.aspectMode === 'blur';
  const needsSelectedClipSpeedComplex =
    !isMultiClip &&
    config.speedScope === 'selectedClip' &&
    Math.abs(config.speed - 1) >= 0.001;
  const useFilterComplex =
    isMultiClip || hasOverlayAudio || needsBlurComplex || needsSelectedClipSpeedComplex;

  // =========================================================================
  // SIMPLE LINEAR GRAPH (-vf / -af) — allows fast stream copy when clean
  // =========================================================================
  if (!useFilterComplex) {
    const videoFilters = [...preAspectFilters];
    if (primaryMetadata.hasVideo && config.aspectPreset !== 'original') {
      const outW = outputDimensions.width;
      const outH = outputDimensions.height;
      if (config.aspectMode === 'stretch') {
        videoFilters.push(`scale=${outW}:${outH}:flags=${scaleFlag},setsar=1`);
      } else {
        const padColor = normalizeHexColor(config.letterboxColor);
        videoFilters.push(
          `scale=${outW}:${outH}:force_original_aspect_ratio=decrease:flags=${scaleFlag}`,
          `pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:color=${padColor}`,
          'setsar=1'
        );
      }
    }
    videoFilters.push(...postAspectFilters);

    const requiresVideoReencode =
      primaryMetadata.hasVideo &&
      (videoFilters.length > 0 ||
        (config.trimEnabled && config.cutMode === 'accurate') ||
        config.rateControlMode !== 'preset' ||
        config.convertVfrToCfr);

    const requiresAudioReencode =
      keepOriginalAudio &&
      (origAudioFilters.length > 0 || (config.trimEnabled && config.cutMode === 'accurate'));

    return {
      useFilterComplex: false,
      filterComplex: null,
      videoOutLabel: null,
      audioOutPads: [],
      videoFilters,
      audioFilters: origAudioFilters,
      requiresVideoReencode,
      requiresAudioReencode,
      outputDimensions,
      targetFps,
      timelineDurationSec,
      effectiveDurationSec,
    };
  }

  // =========================================================================
  // COMPLEX FILTER GRAPH (-filter_complex)
  // Handles: Multi-Clip Concat, Blur Background, Multi-Track Audio, Loudnorm
  // =========================================================================
  const graphSegments: string[] = [];
  let currentVideoLabel = '[0:v]';
  let currentOrigAudioLabel = '[0:a]';
  const concatFps = targetFps ?? Math.round(clamp(primaryMetadata.fps || 30, 24, 60));
  const baseNormW = makeEven(primaryMetadata.width || 1280);
  const baseNormH = makeEven(primaryMetadata.height || 720);

  // 1. Multi-clip trim + auto-normalize + concat
  if (isMultiClip) {
    const concatInputs: string[] = [];
    const anySourceHasAudio =
      keepOriginalAudio &&
      clips.some((c) => {
        const src = sources.find((s) => s.id === c.sourceId);
        return src ? src.metadata.hasAudio : primaryMetadata.hasAudio;
      });

    clips.forEach((c, idx) => {
      const inIdx = sourceInputIndexMap?.get(c.sourceId) ?? 0;
      const srcMeta = sources.find((s) => s.id === c.sourceId)?.metadata ?? primaryMetadata;
      const segDur = Math.max(0.05, c.endSec - c.startSec);
      const clipSpeed =
        config.speedScope === 'selectedClip' && c.id === selectedClipId
          ? clamp(config.speed, 0.25, 4)
          : 1;

      if (primaryMetadata.hasVideo) {
        const vSteps = [
          `trim=start=${c.startSec.toFixed(3)}:end=${c.endSec.toFixed(3)}`,
          'setpts=PTS-STARTPTS',
          `scale=${baseNormW}:${baseNormH}:force_original_aspect_ratio=decrease:flags=${scaleFlag}`,
          `pad=${baseNormW}:${baseNormH}:(ow-iw)/2:(oh-ih)/2:color=0x000000`,
          'setsar=1',
          `fps=${concatFps}`,
        ];
        if (Math.abs(clipSpeed - 1) >= 0.001) {
          vSteps.push(`setpts=${(1 / clipSpeed).toFixed(5)}*PTS`);
        }
        graphSegments.push(`[${inIdx}:v]${vSteps.join(',')}[cv${idx}]`);
        concatInputs.push(`[cv${idx}]`);
      }

      if (anySourceHasAudio) {
        if (srcMeta.hasAudio) {
          const aSteps = [
            `atrim=start=${c.startSec.toFixed(3)}:end=${c.endSec.toFixed(3)}`,
            'asetpts=PTS-STARTPTS',
            'aresample=48000',
            'aformat=channel_layouts=stereo',
          ];
          if (Math.abs(clipSpeed - 1) >= 0.001) {
            aSteps.push(...buildAtempoFilters(clipSpeed));
          }
          graphSegments.push(`[${inIdx}:a]${aSteps.join(',')}[ca${idx}]`);
        } else {
          // Generate silence matching clip duration so concat stays in sync
          const silentDur = segDur / clipSpeed;
          graphSegments.push(
            `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${silentDur.toFixed(3)}[ca${idx}]`
          );
        }
        concatInputs.push(`[ca${idx}]`);
      }
    });

    const vCount = primaryMetadata.hasVideo ? 1 : 0;
    const aCount = anySourceHasAudio ? 1 : 0;
    const outLabels = `${vCount ? '[vcat]' : ''}${aCount ? '[acat]' : ''}`;
    graphSegments.push(
      `${concatInputs.join('')}concat=n=${clips.length}:v=${vCount}:a=${aCount}${outLabels}`
    );
    if (vCount) currentVideoLabel = '[vcat]';
    if (aCount) currentOrigAudioLabel = '[acat]';
  } else if (needsSelectedClipSpeedComplex && clips[0]) {
    // Single clip with selectedClip speed applies directly
    const ptsFactor = (1 / clamp(config.speed, 0.25, 4)).toFixed(5);
    if (primaryMetadata.hasVideo) {
      graphSegments.push(`[0:v]setpts=${ptsFactor}*PTS[vspd]`);
      currentVideoLabel = '[vspd]';
    }
    if (keepOriginalAudio) {
      graphSegments.push(`[0:a]${buildAtempoFilters(config.speed).join(',')}[aspd]`);
      currentOrigAudioLabel = '[aspd]';
    }
  }

  // 2. Global Video Transforms + Aspect Ratio (Stretch / Letterbox / Blur)
  let videoOutLabel: string | null = null;
  if (primaryMetadata.hasVideo) {
    const outW = outputDimensions.width;
    const outH = outputDimensions.height;

    if (config.aspectPreset !== 'original' && config.aspectMode === 'blur') {
      const blurPower = Math.round(clamp(config.blurStrength, 5, 40));
      const bgBrightnessFilter =
        config.blurBrightness === 'darker' ? ',eq=brightness=-0.12:saturation=0.92' : '';
      const preChain = preAspectFilters.length > 0 ? `${preAspectFilters.join(',')},` : '';
      const postChain = postAspectFilters.length > 0 ? `,${postAspectFilters.join(',')}` : '';

      graphSegments.push(`${currentVideoLabel}${preChain}split=2[bg_src][fg_src]`);
      graphSegments.push(
        `[bg_src]scale=${outW}:${outH}:force_original_aspect_ratio=increase:flags=${scaleFlag},crop=${outW}:${outH},boxblur=${blurPower}:2${bgBrightnessFilter}[bg]`
      );
      graphSegments.push(
        `[fg_src]scale=${outW}:${outH}:force_original_aspect_ratio=decrease:flags=${scaleFlag}[fg]`
      );
      graphSegments.push(`[bg][fg]overlay=(W-w)/2:(H-h)/2${postChain},setsar=1[vout]`);
      videoOutLabel = '[vout]';
    } else {
      const vAll = [...preAspectFilters];
      if (config.aspectPreset !== 'original') {
        if (config.aspectMode === 'stretch') {
          vAll.push(`scale=${outW}:${outH}:flags=${scaleFlag},setsar=1`);
        } else {
          const padColor = normalizeHexColor(config.letterboxColor);
          vAll.push(
            `scale=${outW}:${outH}:force_original_aspect_ratio=decrease:flags=${scaleFlag}`,
            `pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2:color=${padColor}`,
            'setsar=1'
          );
        }
      }
      vAll.push(...postAspectFilters);
      if (vAll.length > 0) {
        graphSegments.push(`${currentVideoLabel}${vAll.join(',')}[vout]`);
        videoOutLabel = '[vout]';
      } else {
        videoOutLabel = currentVideoLabel;
      }
    }
  }

  // 3. Audio Processing & Multi-Track Mixing / Separate Tracks
  const audioOutPads: AudioOutputPad[] = [];

  if (hasOverlayAudio) {
    const preparedPads: AudioOutputPad[] = [];

    // 3a. Original audio stream if kept/mixed
    if (keepOriginalAudio) {
      const origSteps = ['aresample=48000', 'aformat=channel_layouts=stereo', ...origAudioFilters];
      graphSegments.push(`${currentOrigAudioLabel}${origSteps.join(',')}[orig_a]`);
      preparedPads.push({ label: '[orig_a]', title: 'Original Audio' });
    }

    // 3b. Each additional audio overlay track
    activeAudioTracks.forEach((track, idx) => {
      const inIdx = audioTrackStartInputIndex + idx;
      const trimS = Math.max(0, track.trimStartSec);
      const trimE = Math.max(trimS + 0.1, track.trimEndSec || track.durationSec || effectiveDurationSec);
      const segLen = Math.max(0.1, trimE - trimS);

      const steps: string[] = [
        `atrim=start=${trimS.toFixed(3)}:end=${trimE.toFixed(3)}`,
        'asetpts=PTS-STARTPTS',
        'aresample=48000',
        'aformat=channel_layouts=stereo',
      ];

      let activeLen = segLen;
      if (track.loop && effectiveDurationSec > segLen) {
        const remainingDur = Math.max(0.1, effectiveDurationSec - track.offsetSec);
        steps.push(`aloop=loop=-1:size=2000000000`, `atrim=0:${remainingDur.toFixed(3)}`, 'asetpts=PTS-STARTPTS');
        activeLen = remainingDur;
      }

      if (track.fadeInSec > 0) {
        steps.push(`afade=t=in:st=0:d=${Math.min(track.fadeInSec, activeLen).toFixed(2)}`);
      }
      if (track.fadeOutSec > 0) {
        const fadeDur = Math.min(track.fadeOutSec, activeLen);
        const fadeStart = Math.max(0, activeLen - fadeDur);
        steps.push(`afade=t=out:st=${fadeStart.toFixed(2)}:d=${fadeDur.toFixed(2)}`);
      }

      if (Math.abs(track.volume - 1) >= 0.01) {
        steps.push(`volume=${clamp(track.volume, 0, 2).toFixed(2)}`);
      }

      if (track.offsetSec > 0.01) {
        const delayMs = Math.round(track.offsetSec * 1000);
        steps.push(`adelay=${delayMs}|${delayMs}`);
      }

      const padLabel = `[bgm_${idx}]`;
      graphSegments.push(`[${inIdx}:a]${steps.join(',')}${padLabel}`);
      preparedPads.push({ label: padLabel, title: track.name });
    });

    const canSeparateTracks =
      config.audioOutputMode === 'separate' &&
      (config.container === 'mp4' || config.container === 'mkv');

    if (canSeparateTracks) {
      if (config.enableLoudnorm) {
        preparedPads.forEach((pad, idx) => {
          const normLabel = `[anorm_${idx}]`;
          graphSegments.push(`${pad.label}loudnorm=I=-16:TP=-1.5:LRA=11${normLabel}`);
          audioOutPads.push({ label: normLabel, title: pad.title });
        });
      } else {
        audioOutPads.push(...preparedPads);
      }
    } else if (preparedPads.length === 1) {
      if (config.enableLoudnorm) {
        graphSegments.push(`${preparedPads[0].label}loudnorm=I=-16:TP=-1.5:LRA=11[aout]`);
        audioOutPads.push({ label: '[aout]' });
      } else {
        audioOutPads.push({ label: preparedPads[0].label });
      }
    } else if (preparedPads.length > 1) {
      const mixInputs = preparedPads.map((p) => p.label).join('');
      const loudnormSuffix = config.enableLoudnorm ? ',loudnorm=I=-16:TP=-1.5:LRA=11' : '';
      graphSegments.push(
        `${mixInputs}amix=inputs=${preparedPads.length}:duration=first:dropout_transition=2:normalize=0${loudnormSuffix}[aout]`
      );
      audioOutPads.push({ label: '[aout]' });
    }
  } else if (keepOriginalAudio) {
    if (origAudioFilters.length > 0) {
      graphSegments.push(`${currentOrigAudioLabel}${origAudioFilters.join(',')}[aout]`);
      audioOutPads.push({ label: '[aout]' });
    } else if (currentOrigAudioLabel !== '[0:a]') {
      audioOutPads.push({ label: currentOrigAudioLabel });
    }
  }

  return {
    useFilterComplex: true,
    filterComplex: graphSegments.join(';'),
    videoOutLabel,
    audioOutPads,
    videoFilters: [],
    audioFilters: [],
    requiresVideoReencode: primaryMetadata.hasVideo,
    requiresAudioReencode: audioOutPads.length > 0 || origAudioFilters.length > 0,
    outputDimensions,
    targetFps,
    timelineDurationSec,
    effectiveDurationSec,
  };
}

/**
 * Phase 1 互換ラッパー（単一メタデータ + 単一クリップ向け）
 */
export function buildFilterGraph(
  metadata: MediaMetadata,
  config: EditConfig,
  clip: ClipSegment
): FilterGraphPlan {
  return buildFullFilterGraph({
    primaryMetadata: metadata,
    clips: [clip],
    config,
  });
}
