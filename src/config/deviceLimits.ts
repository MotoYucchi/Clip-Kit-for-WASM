import type {
  DeviceProfile,
  DeviceTier,
  DeviceTierLimits,
  FeatureCapability,
  FeatureId,
} from '../types/device';

/**
 * デバイス区分ごとの目安上限・機能制限を一元管理する設定ファイル。
 * 実機検証（iPhone / Android / iPad / PC）の結果に合わせて、ここを調整するだけで全体へ反映されます。
 */
export const DEVICE_LIMITS: Record<DeviceTier, DeviceTierLimits> = {
  pc: {
    warnFileSizeMB: 1500,
    maxRecommendedFileSizeMB: 4000,
    recommendedMaxDurationSec: 3600,
    recommendedMaxHeight: 2160,
    maxReverseDurationSec: 120,
    disabledFeatures: ['codec_av1'],
    warnFeatures: ['codec_h265'],
  },
  tablet: {
    warnFileSizeMB: 500,
    maxRecommendedFileSizeMB: 1024,
    recommendedMaxDurationSec: 1200,
    recommendedMaxHeight: 1080,
    maxReverseDurationSec: 45,
    disabledFeatures: ['codec_av1'],
    warnFeatures: ['export_4k', 'two_pass', 'codec_h265', 'multi_track_audio_heavy', 'reverse_long_video'],
  },
  mobile: {
    warnFileSizeMB: 200,
    maxRecommendedFileSizeMB: 500,
    recommendedMaxDurationSec: 300,
    recommendedMaxHeight: 1080,
    maxReverseDurationSec: 20,
    disabledFeatures: ['export_4k', 'two_pass', 'codec_av1', 'codec_h265', 'multi_track_audio_heavy'],
    warnFeatures: ['reverse_long_video', 'blur_background'],
  },
};

/**
 * 標準バンドルの @ffmpeg/core (0.12.10) に含まれるエンコーダ可否フラグ。
 * カスタム WASM コアへ差し替える場合はここを更新する。
 */
export const WASM_CORE_CAPABILITIES = {
  h264: true,
  h265: true,
  vp9: true,
  av1: false, // @ffmpeg/core@0.12.10 は libaom/libsvtav1 未同梱
  aac: true,
  mp3: true,
  opus: true,
  flac: true,
  wav: true,
} as const;

export function getFeatureCapability(
  featureId: FeatureId,
  profile: DeviceProfile
): FeatureCapability {
  if (featureId === 'codec_av1' && !WASM_CORE_CAPABILITIES.av1) {
    return {
      status: 'disabled',
      reasonKey: 'cap.av1NotInCore',
    };
  }

  const limits = DEVICE_LIMITS[profile.tier];

  if (limits.disabledFeatures.includes(featureId)) {
    switch (featureId) {
      case 'export_4k':
        return { status: 'disabled', reasonKey: 'cap.mobileNo4k' };
      case 'two_pass':
        return { status: 'disabled', reasonKey: 'cap.mobileNoTwoPass' };
      case 'codec_h265':
        return { status: 'disabled', reasonKey: 'cap.mobileNoH265' };
      case 'multi_track_audio_heavy':
        return { status: 'disabled', reasonKey: 'cap.mobileNoHeavyAudio' };
      default:
        return { status: 'disabled', reasonKey: 'cap.deviceNotSupported' };
    }
  }

  // Low-memory PC/Tablet extra safeguard (<= 4GB RAM)
  if (profile.deviceMemoryGB <= 4 && (featureId === 'export_4k' || featureId === 'codec_h265')) {
    return {
      status: 'warn',
      reasonKey: 'cap.lowMemoryWarn',
    };
  }

  if (limits.warnFeatures.includes(featureId)) {
    switch (featureId) {
      case 'export_4k':
        return { status: 'warn', reasonKey: 'cap.warn4kHeavy' };
      case 'codec_h265':
        return { status: 'warn', reasonKey: 'cap.warnH265Slow' };
      case 'blur_background':
        return { status: 'warn', reasonKey: 'cap.warnBlurHeavy' };
      case 'reverse_long_video':
        return { status: 'warn', reasonKey: 'cap.warnReverseMemory' };
      default:
        return { status: 'warn', reasonKey: 'cap.heavyProcessWarn' };
    }
  }

  return { status: 'supported' };
}
