export type OutputContainer = 'mp4' | 'webm' | 'mkv' | 'mov' | 'gif' | 'webp';
export type VideoCodec = 'h264' | 'h265' | 'vp9' | 'av1' | 'copy';
export type AudioCodec = 'aac' | 'mp3' | 'opus' | 'copy';
export type AudioExtractFormat = 'mp3' | 'm4a' | 'wav' | 'flac' | 'opus';
export type SnapshotFormat = 'png' | 'jpeg';

export type CompressionPreset = 'high' | 'standard' | 'small' | 'minimal';
export type RateControlMode = 'preset' | 'crf' | 'bitrate' | 'targetSize';
export type UseCasePresetId =
  | 'none'
  | 'youtube_1080p'
  | 'tiktok_9_16'
  | 'instagram_reels'
  | 'instagram_square'
  | 'x_twitter'
  | 'discord_10mb'
  | 'discord_25mb';

export type ResolutionPreset =
  | 'original'
  | '4k'
  | '1080p'
  | '720p'
  | '480p'
  | '360p'
  | 'scale'
  | 'custom';
export type ScaleAlgorithm = 'bicubic' | 'lanczos';

export type AspectPreset = 'original' | '16:9' | '9:16' | '1:1' | '4:3' | '21:9' | 'custom';
export type AspectMode = 'stretch' | 'letterbox' | 'blur';
export type BlurBrightness = 'darker' | 'normal';

export type CutMode = 'fast' | 'accurate';
export type SpeedScope = 'all' | 'selectedClip';
export type MuteMode = 'none' | 'all' | 'range' | 'removeTrack';
export type RotationDegrees = 0 | 90 | 180 | 270;
export type ExportTaskType = 'video' | 'audio-extract' | 'snapshot';

export type OriginalAudioHandling = 'keep' | 'replace' | 'mix';
export type AudioTrackOutputMode = 'mix' | 'separate';
export type FpsPreset = 'original' | '24' | '25' | '30' | '60' | 'custom';

// Phase 3 types
export type ClipTransitionType = 'none' | 'fade' | 'wipeleft' | 'slideleft' | 'dissolve';
export type TextVerticalPosition = 'top' | 'center' | 'bottom';
export type WatermarkPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center';
export type SubtitleHandlingMode = 'strip' | 'keep' | 'burnIn' | 'embedExternal';
export type VideoDenoiseLevel = 'none' | 'light' | 'medium' | 'strong';
export type AudioDenoiseLevel = 'none' | 'light' | 'strong';

// Phase 4 types
export type StabilizeLevel = 'none' | 'light' | 'medium' | 'strong';
export type StabilizeEdgeMode = 'mirror' | 'original' | 'blank';
export type PipAudioMode = 'mute' | 'mix';

export interface PipConfig {
  enabled: boolean;
  position: WatermarkPosition;
  scalePct: number; // 15..55% of main output width
  opacity: number; // 0.2..1.0
  marginPx: number;
  offsetSec: number;
  borderEnabled: boolean;
  audioMode: PipAudioMode;
}

export interface SubtitleCue {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
}

export interface ClipSegment {
  id: string;
  sourceId: string;
  startSec: number;
  endSec: number;
  label?: string;
}

export interface AudioOverlayTrack {
  id: string;
  name: string;
  file: File;
  objectUrl: string;
  durationSec: number;
  isMicRecording: boolean;
  volume: number;
  offsetSec: number;
  trimStartSec: number;
  trimEndSec: number;
  fadeInSec: number;
  fadeOutSec: number;
  loop: boolean;
  muted: boolean;
  waveformPeaks: number[];
}

export interface CropConfig {
  enabled: boolean;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
}

export interface TextOverlayConfig {
  enabled: boolean;
  text: string;
  fontSize: number; // px relative to 1080p height scale
  color: string;
  outlineColor: string;
  bgEnabled: boolean;
  bgColor: string;
  bgOpacity: number; // 0..1
  positionY: TextVerticalPosition;
  useTimeRange: boolean;
  startSec: number;
  endSec: number;
}

export interface WatermarkConfig {
  enabled: boolean;
  position: WatermarkPosition;
  scalePct: number; // 5..60% of output width
  opacity: number; // 0.1..1.0
  marginPx: number;
}

export type SpeedProfile = 'auto' | 'fastest' | 'balanced' | 'quality';

export interface EditConfig {
  taskType: ExportTaskType;

  // Performance & Parallelization Tuning
  speedProfile: SpeedProfile;
  enableParallelChunks: boolean;

  // Format & codecs
  container: OutputContainer;
  videoCodec: VideoCodec;
  audioCodec: AudioCodec;

  // Compression & Rate Control
  rateControlMode: RateControlMode;
  compressionPreset: CompressionPreset;
  useCustomCrf: boolean;
  customCrf: number;
  targetVideoBitrateKbps: number;
  targetSizeMB: number;
  enableTwoPass: boolean;
  useCasePreset: UseCasePresetId;
  audioBitrateKbps: number;

  // Trim / Cut
  trimEnabled: boolean;
  cutMode: CutMode;

  // Resize
  resolutionPreset: ResolutionPreset;
  scalePercent: number;
  customWidth: number;
  customHeight: number;
  keepAspectRatio: boolean;
  scaleAlgorithm: ScaleAlgorithm;

  // Aspect Ratio
  aspectPreset: AspectPreset;
  customAspectW: number;
  customAspectH: number;
  aspectMode: AspectMode;
  letterboxColor: string;
  blurStrength: number;
  blurBrightness: BlurBrightness;

  // Speed & Reverse
  speed: number;
  speedScope: SpeedScope;
  reverse: boolean;

  // Transform (Rotate / Flip / Crop)
  rotation: RotationDegrees;
  flipHorizontal: boolean;
  flipVertical: boolean;
  crop: CropConfig;

  // Mute / Audio Track control
  muteMode: MuteMode;
  muteRangeStartSec: number;
  muteRangeEndSec: number;
  removedAudioIndices: number[];

  // Multi-track Audio Insertion (Phase 2)
  originalAudioHandling: OriginalAudioHandling;
  originalAudioVolume: number;
  audioOutputMode: AudioTrackOutputMode;
  enableLoudnorm: boolean;

  // Frame Rate & Compatibility (Phase 2 & 3)
  fpsPreset: FpsPreset;
  customFps: number;
  convertVfrToCfr: boolean;
  convertHdrToSdr: boolean;
  deinterlace: boolean;
  videoDenoise: VideoDenoiseLevel;
  audioDenoise: AudioDenoiseLevel;

  // Phase 4: Hardware Acceleration, Stabilization & Picture-in-Picture
  useWebCodecsHw: boolean;
  stabilizeLevel: StabilizeLevel;
  stabilizeEdgeMode: StabilizeEdgeMode;
  pip: PipConfig;

  // Visual Effects, Overlays & Transitions (Phase 3)
  videoFadeInSec: number;
  videoFadeOutSec: number;
  brightness: number; // -0.5..0.5 (default 0)
  contrast: number; // 0.5..2.0 (default 1)
  saturation: number; // 0..2.5 (default 1)
  clipTransition: ClipTransitionType;
  clipTransitionDurationSec: number;
  textOverlay: TextOverlayConfig;
  watermark: WatermarkConfig;
  subtitleHandling: SubtitleHandlingMode;

  // GIF / Animated WebP (Phase 3)
  animatedFps: number; // 5..24
  animatedWidth: number; // 0 = keep computed width, else max width px (e.g. 480)
  animatedLoop: number; // 0 = infinite
  webpQuality: number; // 40..95

  // Audio extraction
  audioExtractFormat: AudioExtractFormat;
  audioExtractTrackIndex: number;
  audioExtractBitrateKbps: number;

  // Snapshot export
  snapshotFormat: SnapshotFormat;
  snapshotTimeSec: number;
  snapshotQuality: number;

  // Privacy / Metadata
  stripMetadata: boolean;
}

export interface ProjectJsonExport {
  schemaVersion: 3;
  app: 'Clip-Kit-for-WASM';
  exportedAt: string;
  config: EditConfig;
  clips: Array<{
    sourceFileName: string;
    startSec: number;
    endSec: number;
  }>;
  audioTracksMeta: Array<{
    name: string;
    volume: number;
    offsetSec: number;
    trimStartSec: number;
    trimEndSec: number;
    fadeInSec: number;
    fadeOutSec: number;
    loop: boolean;
    muted: boolean;
  }>;
}
