export type OutputContainer = 'mp4' | 'webm' | 'mkv' | 'mov';
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

export type ResolutionPreset = 'original' | '4k' | '1080p' | '720p' | '480p' | '360p' | 'scale' | 'custom';
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

export interface ClipSegment {
  id: string;
  sourceId: string;
  startSec: number;
  endSec: number;
  /** Optional clip-specific label for UI */
  label?: string;
}

export interface AudioOverlayTrack {
  id: string;
  name: string;
  file: File;
  objectUrl: string;
  durationSec: number;
  isMicRecording: boolean;
  /** Volume multiplier (0.0 to 2.0, 1.0 = 100%) */
  volume: number;
  /** Start position on main timeline (seconds) */
  offsetSec: number;
  /** Trim within this audio file */
  trimStartSec: number;
  trimEndSec: number;
  fadeInSec: number;
  fadeOutSec: number;
  loop: boolean;
  muted: boolean;
  /** Normalized waveform peak bars (0..1) for timeline alignment */
  waveformPeaks: number[];
}

export interface CropConfig {
  enabled: boolean;
  /** Crop rectangle in percentage (0–100) relative to oriented display frame */
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
}

export interface EditConfig {
  taskType: ExportTaskType;

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
  blurStrength: number; // 5..40
  blurBrightness: BlurBrightness;

  // Speed & Reverse
  speed: number; // 0.25..4
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
  originalAudioVolume: number; // 0..2
  audioOutputMode: AudioTrackOutputMode;
  enableLoudnorm: boolean;

  // Frame Rate & Compatibility (Phase 2)
  fpsPreset: FpsPreset;
  customFps: number;
  convertVfrToCfr: boolean;
  convertHdrToSdr: boolean;

  // Audio extraction
  audioExtractFormat: AudioExtractFormat;
  audioExtractTrackIndex: number; // audio-relative index 0..N-1
  audioExtractBitrateKbps: number;

  // Snapshot export
  snapshotFormat: SnapshotFormat;
  snapshotTimeSec: number;
  snapshotQuality: number; // JPEG 2..15 (lower is better in FFmpeg -q:v)

  // Privacy / Metadata
  stripMetadata: boolean;
}

export interface ProjectJsonExport {
  schemaVersion: 2;
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
