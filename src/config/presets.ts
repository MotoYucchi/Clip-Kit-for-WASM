import type {
  AspectPreset,
  CompressionPreset,
  EditConfig,
  ResolutionPreset,
} from '../types/edit';

export interface CompressionPresetSpec {
  id: CompressionPreset;
  labelKey: string;
  descKey: string;
  crfH264: number;
  crfH265: number;
  crfVp9: number;
  x264Preset: 'fast' | 'veryfast' | 'superfast';
  audioBitrateKbps: number;
  /** Heuristic bits-per-pixel-per-frame multiplier for size estimation */
  estimatedBpp: number;
}

export const COMPRESSION_PRESETS: Record<CompressionPreset, CompressionPresetSpec> = {
  high: {
    id: 'high',
    labelKey: 'compress.high',
    descKey: 'compress.highDesc',
    crfH264: 19,
    crfH265: 22,
    crfVp9: 24,
    x264Preset: 'fast',
    audioBitrateKbps: 192,
    estimatedBpp: 0.14,
  },
  standard: {
    id: 'standard',
    labelKey: 'compress.standard',
    descKey: 'compress.standardDesc',
    crfH264: 23,
    crfH265: 26,
    crfVp9: 30,
    x264Preset: 'veryfast',
    audioBitrateKbps: 128,
    estimatedBpp: 0.085,
  },
  small: {
    id: 'small',
    labelKey: 'compress.small',
    descKey: 'compress.smallDesc',
    crfH264: 28,
    crfH265: 30,
    crfVp9: 35,
    x264Preset: 'veryfast',
    audioBitrateKbps: 96,
    estimatedBpp: 0.048,
  },
  minimal: {
    id: 'minimal',
    labelKey: 'compress.minimal',
    descKey: 'compress.minimalDesc',
    crfH264: 33,
    crfH265: 35,
    crfVp9: 42,
    x264Preset: 'superfast',
    audioBitrateKbps: 64,
    estimatedBpp: 0.025,
  },
};

export const RESOLUTION_PRESET_HEIGHTS: Record<
  Exclude<ResolutionPreset, 'original' | 'scale' | 'custom'>,
  { label: string; height: number }
> = {
  '4k': { label: '4K (2160p)', height: 2160 },
  '1080p': { label: 'Full HD (1080p)', height: 1080 },
  '720p': { label: 'HD (720p)', height: 720 },
  '480p': { label: 'SD (480p)', height: 480 },
  '360p': { label: 'Low (360p)', height: 360 },
};

export const ASPECT_RATIO_PRESETS: Record<
  Exclude<AspectPreset, 'original' | 'custom'>,
  { label: string; w: number; h: number }
> = {
  '16:9': { label: '16:9 (YouTube / 横長)', w: 16, h: 9 },
  '9:16': { label: '9:16 (TikTok / Reels / 縦長)', w: 9, h: 16 },
  '1:1': { label: '1:1 (正方形)', w: 1, h: 1 },
  '4:3': { label: '4:3 (クラシック)', w: 4, h: 3 },
  '21:9': { label: '21:9 (シネマ)', w: 21, h: 9 },
};

export const SPEED_PRESETS = [0.25, 0.5, 1, 1.5, 2, 4] as const;

export function createDefaultEditConfig(): EditConfig {
  return {
    taskType: 'video',
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    compressionPreset: 'standard',
    useCustomCrf: false,
    customCrf: 23,
    audioBitrateKbps: 128,
    trimEnabled: false,
    cutMode: 'accurate',
    resolutionPreset: 'original',
    scalePercent: 100,
    customWidth: 1280,
    customHeight: 720,
    keepAspectRatio: true,
    scaleAlgorithm: 'lanczos',
    aspectPreset: 'original',
    customAspectW: 16,
    customAspectH: 9,
    aspectMode: 'letterbox',
    letterboxColor: '#000000',
    blurStrength: 18,
    blurBrightness: 'darker',
    speed: 1,
    reverse: false,
    rotation: 0,
    flipHorizontal: false,
    flipVertical: false,
    crop: {
      enabled: false,
      xPct: 0,
      yPct: 0,
      widthPct: 100,
      heightPct: 100,
    },
    muteMode: 'none',
    muteRangeStartSec: 0,
    muteRangeEndSec: 5,
    removedAudioIndices: [],
    audioExtractFormat: 'mp3',
    audioExtractTrackIndex: 0,
    audioExtractBitrateKbps: 192,
    snapshotFormat: 'png',
    snapshotTimeSec: 0,
    snapshotQuality: 2,
    stripMetadata: true,
  };
}
