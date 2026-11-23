export type OutputContainer = 'mp4' | 'webm' | 'mkv' | 'mov';
export type VideoCodec = 'h264' | 'h265' | 'vp9' | 'av1' | 'copy';
export type AudioCodec = 'aac' | 'mp3' | 'opus' | 'copy';
export type AudioExtractFormat = 'mp3' | 'm4a' | 'wav' | 'flac' | 'opus';
export type SnapshotFormat = 'png' | 'jpeg';

export type CompressionPreset = 'high' | 'standard' | 'small' | 'minimal';
export type ResolutionPreset = 'original' | '4k' | '1080p' | '720p' | '480p' | '360p' | 'scale' | 'custom';
export type ScaleAlgorithm = 'bicubic' | 'lanczos';

export type AspectPreset = 'original' | '16:9' | '9:16' | '1:1' | '4:3' | '21:9' | 'custom';
export type AspectMode = 'stretch' | 'letterbox' | 'blur';
export type BlurBrightness = 'darker' | 'normal';

export type CutMode = 'fast' | 'accurate';
export type MuteMode = 'none' | 'all' | 'range' | 'removeTrack';
export type RotationDegrees = 0 | 90 | 180 | 270;

export type ExportTaskType = 'video' | 'audio-extract' | 'snapshot';

export interface ClipSegment {
  id: string;
  sourceId: string;
  startSec: number;
  endSec: number;
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

  // Compression
  compressionPreset: CompressionPreset;
  useCustomCrf: boolean;
  customCrf: number;
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

export interface EditPresetSummary {
  id: string;
  labelKey: string;
  descKey: string;
}
