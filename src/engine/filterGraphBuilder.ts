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
  useFilterComplex: boolean;
  filterComplex: string | null;
  videoOutLabel: string | null;
  audioOutPads: AudioOutputPad[];
  videoFilters: string[];
  audioFilters: string[];
  requiresVideoReencode: boolean;
  requiresAudioReencode: boolean;
  outputDimensions: Dimensions;
  targetFps: number | null;
  timelineDurationSec: number;
  effectiveDurationSec: number;
}

export function resolveTargetFps(metadata: MediaMetadata, config: EditConfig): number | null {
  if (config.container === 'gif' || config.container === 'webp') {
    return clamp(Math.round(config.animatedFps || 12), 5, 24);
  }
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

  // Animated GIF / WebP optional max width cap
  if (
    (config.container === 'gif' || config.container === 'webp') &&
    config.animatedWidth > 0 &&
    w > config.animatedWidth
  ) {
    const scale = config.animatedWidth / w;
    w = makeEven(config.animatedWidth);
    h = makeEven(h * scale);
  }

  return { width: makeEven(w), height: makeEven(h) };
}

function getCornerOverlayPosition(position: EditConfig['watermark']['position'], marginPx: number): string {
  const m = Math.round(clamp(marginPx, 0, 200));
  switch (position) {
    case 'top-left':
      return `${m}:${m}`;
    case 'top-right':
      return `W-w-${m}:${m}`;
    case 'bottom-left':
      return `${m}:H-h-${m}`;
    case 'center':
      return '(W-w)/2:(H-h)/2';
    case 'bottom-right':
    default:
      return `W-w-${m}:H-h-${m}`;
  }
}

export function buildStabilizeFilter(config: EditConfig): string | null {
  if (config.stabilizeLevel === 'none') return null;
  const edge = config.stabilizeEdgeMode || 'mirror';
  if (config.stabilizeLevel === 'light') {
    return `deshake=rx=16:ry=16:edge=${edge}:blocksize=8`;
  }
  if (config.stabilizeLevel === 'medium') {
    return `deshake=rx=32:ry=32:edge=${edge}:blocksize=8:contrast=125`;
  }
  return `deshake=rx=48:ry=48:edge=${edge}:blocksize=8:contrast=150`;
}

export interface MultiInputGraphOptions {
  primaryMetadata: MediaMetadata;
  sources?: MediaSourceItem[];
  clips: ClipSegment[];
  selectedClipId?: string | null;
  audioTracks?: AudioOverlayTrack[];
  config: EditConfig;
  sourceInputIndexMap?: Map<string, number>;
  audioTrackStartInputIndex?: number;
  watermarkInputIndex?: number | null;
  telopInputIndex?: number | null;
  pipInputIndex?: number | null;
  pipHasAudio?: boolean;
  burnInSubtitleVirtualPath?: string | null;
  hasSubtitleFont?: boolean;
}

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
    watermarkInputIndex = null,
    telopInputIndex = null,
    pipInputIndex = null,
    pipHasAudio = false,
    burnInSubtitleVirtualPath = null,
    hasSubtitleFont = false,
  } = opts;

  const isAnimatedImage = config.container === 'gif' || config.container === 'webp';
  const activeAudioTracks = isAnimatedImage ? [] : audioTracks.filter((tr) => !tr.muted);
  const isMultiClip = clips.length > 1;
  const hasOverlayAudio = activeAudioTracks.length > 0 && config.taskType === 'video';
  const targetFps = resolveTargetFps(primaryMetadata, config);
  const outputDimensions = computeOutputDimensions(primaryMetadata, config);
  const scaleFlag = config.scaleAlgorithm === 'bicubic' ? 'bicubic' : 'lanczos';

  // Calculate timeline duration (including transition overlap deduction when xfade is used)
  const clipEffectiveDurs: number[] = [];
  let timelineDurationSec = 0;
  let effectiveDurationSec = 0;
  const globalSpeed = config.speedScope === 'all' ? clamp(config.speed, 0.25, 4) : 1;

  if (clips.length === 0) {
    timelineDurationSec = Math.max(0.05, primaryMetadata.durationSec);
    effectiveDurationSec = timelineDurationSec / globalSpeed;
  } else {
    for (const c of clips) {
      const segDur =
        config.trimEnabled || isMultiClip
          ? Math.max(0.05, c.endSec - c.startSec)
          : Math.max(0.05, primaryMetadata.durationSec);
      timelineDurationSec += segDur;
      const clipSpeed =
        config.speedScope === 'selectedClip' && c.id === selectedClipId
          ? clamp(config.speed, 0.25, 4)
          : globalSpeed;
      const eff = segDur / clipSpeed;
      clipEffectiveDurs.push(eff);
      effectiveDurationSec += eff;
    }
  }

  const useXfadeTransition =
    isMultiClip && primaryMetadata.hasVideo && config.clipTransition !== 'none';
  const safeTransitionDur = useXfadeTransition
    ? Math.max(
        0.1,
        Math.min(
          clamp(config.clipTransitionDurationSec, 0.2, 2.0),
          ...clipEffectiveDurs.map((d) => Math.max(0.1, d * 0.4))
        )
      )
    : 0;

  if (useXfadeTransition) {
    effectiveDurationSec = Math.max(
      0.1,
      effectiveDurationSec - safeTransitionDur * (clips.length - 1)
    );
  }

  // --- Pre-aspect video filters ---
  const preAspectFilters: string[] = [];
  const postAspectFilters: string[] = [];

  if (primaryMetadata.hasVideo) {
    if (config.deinterlace) {
      preAspectFilters.push('yadif=mode=0:parity=-1:deint=0');
    }

    const stabFilter = buildStabilizeFilter(config);
    if (stabFilter) {
      preAspectFilters.push(stabFilter);
    }

    if (config.videoDenoise === 'light') {
      preAspectFilters.push('hqdn3d=1.5:1.5:6:6');
    } else if (config.videoDenoise === 'medium') {
      preAspectFilters.push('hqdn3d=3:3:6:6');
    } else if (config.videoDenoise === 'strong') {
      preAspectFilters.push('hqdn3d=6:4.5:8:6');
    }

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

    if (
      config.aspectPreset === 'original' &&
      (config.resolutionPreset !== 'original' ||
        (isAnimatedImage && config.animatedWidth > 0))
    ) {
      preAspectFilters.push(
        `scale=${outputDimensions.width}:${outputDimensions.height}:flags=${scaleFlag}`
      );
    }

    // Color grading (eq)
    const hasColorAdjust =
      Math.abs(config.brightness) >= 0.01 ||
      Math.abs(config.contrast - 1) >= 0.01 ||
      Math.abs(config.saturation - 1) >= 0.01;
    if (hasColorAdjust) {
      postAspectFilters.push(
        `eq=brightness=${clamp(config.brightness, -0.5, 0.5).toFixed(2)}:contrast=${clamp(config.contrast, 0.5, 2).toFixed(2)}:saturation=${clamp(config.saturation, 0, 2.5).toFixed(2)}`
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

    // Video fade in / out
    if (config.videoFadeInSec > 0) {
      postAspectFilters.push(
        `fade=t=in:st=0:d=${Math.min(config.videoFadeInSec, effectiveDurationSec).toFixed(2)}`
      );
    }
    if (config.videoFadeOutSec > 0) {
      const fadeDur = Math.min(config.videoFadeOutSec, effectiveDurationSec);
      const fadeStart = Math.max(0, effectiveDurationSec - fadeDur);
      postAspectFilters.push(`fade=t=out:st=${fadeStart.toFixed(2)}:d=${fadeDur.toFixed(2)}`);
    }

    // External subtitle burn-in (SRT / ASS)
    if (config.subtitleHandling === 'burnIn' && burnInSubtitleVirtualPath) {
      const escaped = burnInSubtitleVirtualPath.replace(/:/g, '\\:');
      const fontOpt = hasSubtitleFont ? ':fontsdir=/fonts' : '';
      postAspectFilters.push(`subtitles='${escaped}'${fontOpt}`);
    }
  }

  // --- Original audio linear filters ---
  const keepOriginalAudio =
    !isAnimatedImage &&
    primaryMetadata.hasAudio &&
    config.muteMode !== 'all' &&
    (!hasOverlayAudio || config.originalAudioHandling !== 'replace');

  const origAudioFilters: string[] = [];
  if (keepOriginalAudio) {
    if (config.audioDenoise === 'light') {
      origAudioFilters.push('afftdn=nf=-25');
    } else if (config.audioDenoise === 'strong') {
      origAudioFilters.push('afftdn=nf=-20');
    }

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
  const hasVisualOverlayInput =
    primaryMetadata.hasVideo &&
    (watermarkInputIndex !== null || telopInputIndex !== null || pipInputIndex !== null);
  const needsGifPaletteComplex = primaryMetadata.hasVideo && config.container === 'gif';
  const hasPipAudioMix =
    !isAnimatedImage && pipInputIndex !== null && pipHasAudio && config.pip.enabled && config.pip.audioMode === 'mix';

  const useFilterComplex =
    isMultiClip ||
    hasOverlayAudio ||
    hasPipAudioMix ||
    needsBlurComplex ||
    needsSelectedClipSpeedComplex ||
    hasVisualOverlayInput ||
    needsGifPaletteComplex;

  // =========================================================================
  // SIMPLE LINEAR GRAPH (-vf / -af)
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
        isAnimatedImage ||
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
  // =========================================================================
  const graphSegments: string[] = [];
  let currentVideoLabel = '[0:v]';
  let currentOrigAudioLabel = '[0:a]';
  const concatFps = targetFps ?? Math.round(clamp(primaryMetadata.fps || 30, 24, 60));
  const baseNormW = makeEven(primaryMetadata.width || 1280);
  const baseNormH = makeEven(primaryMetadata.height || 720);

  // 1. Multi-clip trim + normalize + concat OR xfade/acrossfade transition
  if (isMultiClip) {
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
          'format=yuv420p',
        ];
        if (Math.abs(clipSpeed - 1) >= 0.001) {
          vSteps.push(`setpts=${(1 / clipSpeed).toFixed(5)}*PTS`);
        }
        graphSegments.push(`[${inIdx}:v]${vSteps.join(',')}[cv${idx}]`);
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
          const silentDur = segDur / clipSpeed;
          graphSegments.push(
            `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${silentDur.toFixed(3)}[ca${idx}]`
          );
        }
      }
    });

    if (useXfadeTransition) {
      // Chain xfade for video and acrossfade for audio
      let prevV = '[cv0]';
      let accumDur = clipEffectiveDurs[0] ?? 1;
      for (let i = 1; i < clips.length; i++) {
        const offset = Math.max(0.05, accumDur - safeTransitionDur);
        const outV = i === clips.length - 1 ? '[vcat]' : `[vxf${i}]`;
        graphSegments.push(
          `${prevV}[cv${i}]xfade=transition=${config.clipTransition}:duration=${safeTransitionDur.toFixed(2)}:offset=${offset.toFixed(3)}${outV}`
        );
        prevV = outV;
        accumDur = offset + (clipEffectiveDurs[i] ?? 1);
      }
      currentVideoLabel = '[vcat]';

      if (anySourceHasAudio) {
        let prevA = '[ca0]';
        for (let i = 1; i < clips.length; i++) {
          const outA = i === clips.length - 1 ? '[acat]' : `[axf${i}]`;
          graphSegments.push(
            `${prevA}[ca${i}]acrossfade=d=${safeTransitionDur.toFixed(2)}:c1=tri:c2=tri${outA}`
          );
          prevA = outA;
        }
        currentOrigAudioLabel = '[acat]';
      }
    } else {
      const concatInputs: string[] = [];
      for (let i = 0; i < clips.length; i++) {
        if (primaryMetadata.hasVideo) concatInputs.push(`[cv${i}]`);
        if (anySourceHasAudio) concatInputs.push(`[ca${i}]`);
      }
      const vCount = primaryMetadata.hasVideo ? 1 : 0;
      const aCount = anySourceHasAudio ? 1 : 0;
      const outLabels = `${vCount ? '[vcat]' : ''}${aCount ? '[acat]' : ''}`;
      graphSegments.push(
        `${concatInputs.join('')}concat=n=${clips.length}:v=${vCount}:a=${aCount}${outLabels}`
      );
      if (vCount) currentVideoLabel = '[vcat]';
      if (aCount) currentOrigAudioLabel = '[acat]';
    }
  } else if (needsSelectedClipSpeedComplex && clips[0]) {
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

  // 2. Global Video Transforms + Aspect Ratio + Overlays + GIF Palette
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
      graphSegments.push(`[bg][fg]overlay=(W-w)/2:(H-h)/2${postChain},setsar=1[v_base]`);
      currentVideoLabel = '[v_base]';
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
        graphSegments.push(`${currentVideoLabel}${vAll.join(',')}[v_base]`);
        currentVideoLabel = '[v_base]';
      }
    }

    // 2.0 Picture-in-Picture (PiP) Video Overlay
    if (pipInputIndex !== null && config.pip.enabled) {
      const pipW = Math.max(48, makeEven((outW * clamp(config.pip.scalePct, 15, 55)) / 100));
      const pipSteps: string[] = [`scale=${pipW}:-2:flags=lanczos`];
      if (config.pip.borderEnabled) {
        pipSteps.push('pad=iw+6:ih+6:3:3:color=0xffffff');
      }
      if (config.pip.opacity < 0.99) {
        pipSteps.push(`format=rgba`, `colorchannelmixer=aa=${clamp(config.pip.opacity, 0.2, 1).toFixed(2)}`);
      }
      const offsetSec = Math.max(0, config.pip.offsetSec);
      pipSteps.push(`setpts=PTS-STARTPTS+${offsetSec.toFixed(2)}/TB`);
      graphSegments.push(`[${pipInputIndex}:v]${pipSteps.join(',')}[pip_v]`);

      const pipPos = getCornerOverlayPosition(config.pip.position, config.pip.marginPx);
      const enableExpr = offsetSec > 0.01 ? `:enable='gte(t,${offsetSec.toFixed(2)})'` : '';
      graphSegments.push(
        `${currentVideoLabel}[pip_v]overlay=${pipPos}:eof_action=pass:shortest=0${enableExpr}[v_pip]`
      );
      currentVideoLabel = '[v_pip]';
    }

    // 2a. Image Watermark Overlay
    if (watermarkInputIndex !== null && config.watermark.enabled) {
      const wmW = Math.max(16, makeEven((outW * clamp(config.watermark.scalePct, 5, 60)) / 100));
      const wmAlpha = clamp(config.watermark.opacity, 0.1, 1).toFixed(2);
      const wmPos = getCornerOverlayPosition(config.watermark.position, config.watermark.marginPx);
      graphSegments.push(
        `[${watermarkInputIndex}:v]scale=${wmW}:-1:flags=lanczos,format=rgba,colorchannelmixer=aa=${wmAlpha}[wm_img]`
      );
      graphSegments.push(`${currentVideoLabel}[wm_img]overlay=${wmPos}[v_wm]`);
      currentVideoLabel = '[v_wm]';
    }

    // 2b. Canvas-Rendered Japanese/Unicode Text Telop PNG Overlay
    if (telopInputIndex !== null && config.textOverlay.enabled) {
      const enableExpr = config.textOverlay.useTimeRange
        ? `:enable='between(t,${Math.max(0, config.textOverlay.startSec).toFixed(2)},${Math.max(0.1, config.textOverlay.endSec).toFixed(2)})'`
        : '';
      graphSegments.push(
        `${currentVideoLabel}[${telopInputIndex}:v]overlay=0:0${enableExpr}[v_txt]`
      );
      currentVideoLabel = '[v_txt]';
    }

    // 2c. High-quality GIF Palette Generation
    if (needsGifPaletteComplex) {
      graphSegments.push(`${currentVideoLabel}split[gif_a][gif_b]`);
      graphSegments.push('[gif_a]palettegen=stats_mode=diff[gif_p]');
      graphSegments.push('[gif_b][gif_p]paletteuse=dither=bayer:bayer_scale=3[vout]');
      videoOutLabel = '[vout]';
    } else {
      videoOutLabel = currentVideoLabel;
    }
  }

  // 3. Audio Processing & Multi-Track Mixing / Separate Tracks / PiP Audio
  const audioOutPads: AudioOutputPad[] = [];

  if (!isAnimatedImage) {
    if (hasOverlayAudio || hasPipAudioMix) {
      const preparedPads: AudioOutputPad[] = [];

      if (keepOriginalAudio) {
        const origSteps = ['aresample=48000', 'aformat=channel_layouts=stereo', ...origAudioFilters];
        graphSegments.push(`${currentOrigAudioLabel}${origSteps.join(',')}[orig_a]`);
        preparedPads.push({ label: '[orig_a]', title: 'Original Audio' });
      }

      if (hasPipAudioMix && pipInputIndex !== null) {
        const pipAudioSteps = ['aresample=48000', 'aformat=channel_layouts=stereo'];
        if (config.pip.offsetSec > 0.01) {
          const delayMs = Math.round(config.pip.offsetSec * 1000);
          pipAudioSteps.push(`adelay=${delayMs}|${delayMs}`);
        }
        graphSegments.push(`[${pipInputIndex}:a]${pipAudioSteps.join(',')}[pip_a]`);
        preparedPads.push({ label: '[pip_a]', title: 'PiP Audio' });
      }

      activeAudioTracks.forEach((track, idx) => {
        const inIdx = audioTrackStartInputIndex + idx;
        const trimS = Math.max(0, track.trimStartSec);
        const trimE = Math.max(
          trimS + 0.1,
          track.trimEndSec || track.durationSec || effectiveDurationSec
        );
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
          steps.push(
            'aloop=loop=-1:size=2000000000',
            `atrim=0:${remainingDur.toFixed(3)}`,
            'asetpts=PTS-STARTPTS'
          );
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
