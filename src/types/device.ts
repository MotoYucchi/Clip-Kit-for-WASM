export type DeviceTier = 'pc' | 'tablet' | 'mobile';

export type FeatureId =
  | 'export_4k'
  | 'two_pass'
  | 'codec_av1'
  | 'codec_h265'
  | 'multi_track_audio_heavy'
  | 'reverse_long_video'
  | 'blur_background'
  | 'stabilize_video';

export type CapabilityStatus = 'supported' | 'warn' | 'disabled';

export interface FeatureCapability {
  status: CapabilityStatus;
  reasonKey?: string;
}

export interface DeviceProfile {
  tier: DeviceTier;
  isIOS: boolean;
  isSafari: boolean;
  isTouch: boolean;
  deviceMemoryGB: number;
  isMemoryEstimated: boolean;
  cpuCores: number;
  supportsSharedArrayBuffer: boolean;
  isCrossOriginIsolated: boolean;
  supportsWebShareFiles: boolean;
  supportsWakeLock: boolean;
  supportsMediaRecorder: boolean;
  supportsWebCodecs: boolean;
  supportsSpeechRecognition: boolean;
  screenShortSide: number;
}

export interface DeviceTierLimits {
  warnFileSizeMB: number;
  maxRecommendedFileSizeMB: number;
  recommendedMaxDurationSec: number;
  recommendedMaxHeight: number;
  maxReverseDurationSec: number;
  disabledFeatures: FeatureId[];
  warnFeatures: FeatureId[];
}
