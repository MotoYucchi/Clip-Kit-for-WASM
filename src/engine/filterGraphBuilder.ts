import { ASPECT_RATIO_PRESETS, RESOLUTION_PRESET_HEIGHTS } from '../config/presets';
import type { ClipSegment, EditConfig } from '../types/edit';
import type { MediaMetadata } from '../types/media';
import { clamp, makeEven, normalizeHexColor } from '../utils/formatters';

export interface Dimensions {
  width: number;
  height: number;
}

export interface FilterGraphPlan {
  /** Whether we need -filter_complex (used e.g. for blur background split+overlay) */
  useFilterComplex: boolean;
  /** Value for -filter_complex when useFilterComplex is true */
  filterComplex: string | null;
  /** Output pad label for video when useFilterComplex is true */
  videoOutLabel: string | null;
  /** Simple -vf filter chain when useFilterComplex is false */
  videoFilters: string[];
  /** Simple -af filter chain */
  audioFilters: string[];
  /** Whether any video pixel transformation requires re-encoding */
  requiresVideoReencode: boolean;
  /** Whether any audio transformation requires re-encoding */
  requiresAudioReencode: boolean;
  /** Resolved final output dimensions */
  outputDimensions: Dimensions;
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
 * クロップ → ユーザー回転 → 解像度変更 → 画面比率変更の順に最終出力解像度を算出する。
 */
export function computeOutputDimensions(
  metadata: MediaMetadata,
  config: EditConfig
): Dimensions {
  if (!metadata.hasVideo || metadata.width <= 0 || metadata.height <= 0) {
    return { width: 0, height: 0 };
  }

  // 1. Start from display-oriented dimensions (FFmpeg auto-rotates input frames by default)
  let w = metadata.width;
  let h = metadata.height;

  // 2. Apply crop
  if (config.crop.enabled) {
    w = Math.max(16, Math.round((w * clamp(config.crop.widthPct, 5, 100)) / 100));
    h = Math.max(16, Math.round((h * clamp(config.crop.heightPct, 5, 100)) / 100));
  }

  // 3. Apply user rotation (90 / 270 swaps width & height)
  if (config.rotation === 90 || config.rotation === 270) {
    [w, h] = [h, w];
  }

  // 4. Apply resolution preset / scale / custom
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
    // Portrait videos preserve portrait orientation cleanly (e.g. 1080p portrait -> 1080x1920)
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

  // 5. Apply aspect ratio target frame
  if (config.aspectPreset !== 'original') {
    const ratio =
      config.aspectPreset === 'custom'
        ? clamp(config.customAspectW, 1, 100) / clamp(config.customAspectH, 1, 100)
        : ASPECT_RATIO_PRESETS[config.aspectPreset].w /
          ASPECT_RATIO_PRESETS[config.aspectPreset].h;

    // Fit target aspect ratio preserving approximate resolution budget (longest side)
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

/**
 * 全加工を単一エンコード用の FFmpeg フィルタグラフへ統合する。
 */
export function buildFilterGraph(
  metadata: MediaMetadata,
  config: EditConfig,
  clip: ClipSegment
): FilterGraphPlan {
  const outputDimensions = computeOutputDimensions(metadata, config);
  const preAspectFilters: string[] = [];
  const postAspectFilters: string[] = [];
  const audioFilters: string[] = [];

  const scaleFlag = config.scaleAlgorithm === 'bicubic' ? 'bicubic' : 'lanczos';

  // --- Video pre-aspect pipeline ---
  if (metadata.hasVideo) {
    // 1. Crop (relative to auto-oriented frame)
    if (config.crop.enabled) {
      const xPct = clamp(config.crop.xPct, 0, 95) / 100;
      const yPct = clamp(config.crop.yPct, 0, 95) / 100;
      const wPct = clamp(config.crop.widthPct, 5, 100 - config.crop.xPct) / 100;
      const hPct = clamp(config.crop.heightPct, 5, 100 - config.crop.yPct) / 100;
      preAspectFilters.push(
        `crop=trunc(iw*${wPct.toFixed(4)}/2)*2:trunc(ih*${hPct.toFixed(4)}/2)*2:trunc(iw*${xPct.toFixed(4)}):trunc(ih*${yPct.toFixed(4)})`
      );
    }

    // 2. User Rotation & Flip
    if (config.rotation === 90) {
      preAspectFilters.push('transpose=1');
    } else if (config.rotation === 180) {
      preAspectFilters.push('transpose=1,transpose=1');
    } else if (config.rotation === 270) {
      preAspectFilters.push('transpose=2');
    }
    if (config.flipHorizontal) {
      preAspectFilters.push('hflip');
    }
    if (config.flipVertical) {
      preAspectFilters.push('vflip');
    }

    // 3. Resolution change (when aspect ratio is original)
    if (config.aspectPreset === 'original' && config.resolutionPreset !== 'original') {
      preAspectFilters.push(
        `scale=${outputDimensions.width}:${outputDimensions.height}:flags=${scaleFlag}`
      );
    }

    // 4. Speed & Reverse (post aspect so blur/pad operate cleanly)
    if (Math.abs(config.speed - 1) >= 0.001) {
      const ptsFactor = (1 / clamp(config.speed, 0.25, 4)).toFixed(5);
      postAspectFilters.push(`setpts=${ptsFactor}*PTS`);
    }
    if (config.reverse) {
      postAspectFilters.push('reverse');
    }
  }

  // --- Audio pipeline ---
  const hasAudioOutput = metadata.hasAudio && config.muteMode !== 'all';
  if (hasAudioOutput) {
    // Range mute: adjust timestamps relative to trimmed start
    if (config.muteMode === 'range') {
      const trimOffset = config.trimEnabled ? clip.startSec : 0;
      const relStart = Math.max(0, config.muteRangeStartSec - trimOffset);
      const relEnd = Math.max(relStart, config.muteRangeEndSec - trimOffset);
      if (relEnd > relStart) {
        audioFilters.push(
          `volume=enable='between(t,${relStart.toFixed(3)},${relEnd.toFixed(3)})':volume=0`
        );
      }
    }

    // Speed change with pitch preservation (multi-stage atempo)
    if (Math.abs(config.speed - 1) >= 0.001) {
      audioFilters.push(...buildAtempoFilters(config.speed));
    }

    // Reverse audio
    if (config.reverse) {
      audioFilters.push('areverse');
    }
  }

  // --- Aspect Ratio Modes ---
  const outW = outputDimensions.width;
  const outH = outputDimensions.height;

  // Mode 3: Blur background uses -filter_complex (split -> scale+crop+boxblur -> overlay)
  if (metadata.hasVideo && config.aspectPreset !== 'original' && config.aspectMode === 'blur') {
    const blurPower = Math.round(clamp(config.blurStrength, 5, 40));
    const bgBrightnessFilter =
      config.blurBrightness === 'darker' ? ',eq=brightness=-0.12:saturation=0.92' : '';

    const segments: string[] = [];
    const preChain = preAspectFilters.length > 0 ? `${preAspectFilters.join(',')},` : '';

    segments.push(`[0:v]${preChain}split=2[bg_src][fg_src]`);
    segments.push(
      `[bg_src]scale=${outW}:${outH}:force_original_aspect_ratio=increase:flags=${scaleFlag},crop=${outW}:${outH},boxblur=${blurPower}:2${bgBrightnessFilter}[bg]`
    );
    segments.push(
      `[fg_src]scale=${outW}:${outH}:force_original_aspect_ratio=decrease:flags=${scaleFlag}[fg]`
    );

    const postChain = postAspectFilters.length > 0 ? `,${postAspectFilters.join(',')}` : '';
    segments.push(`[bg][fg]overlay=(W-w)/2:(H-h)/2${postChain},setsar=1[vout]`);

    return {
      useFilterComplex: true,
      filterComplex: segments.join(';'),
      videoOutLabel: '[vout]',
      videoFilters: [],
      audioFilters,
      requiresVideoReencode: true,
      requiresAudioReencode: audioFilters.length > 0,
      outputDimensions,
    };
  }

  // Mode 1 (stretch) and Mode 2 (letterbox) use linear -vf
  const videoFilters: string[] = [...preAspectFilters];
  if (metadata.hasVideo && config.aspectPreset !== 'original') {
    if (config.aspectMode === 'stretch') {
      videoFilters.push(`scale=${outW}:${outH}:flags=${scaleFlag},setsar=1`);
    } else {
      // Letterbox: fit inside target frame and pad with chosen color
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
    metadata.hasVideo &&
    (videoFilters.length > 0 || (config.trimEnabled && config.cutMode === 'accurate'));

  const requiresAudioReencode =
    hasAudioOutput &&
    (audioFilters.length > 0 || (config.trimEnabled && config.cutMode === 'accurate'));

  return {
    useFilterComplex: false,
    filterComplex: null,
    videoOutLabel: null,
    videoFilters,
    audioFilters,
    requiresVideoReencode,
    requiresAudioReencode,
    outputDimensions,
  };
}
