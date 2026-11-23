import type { DeviceProfile, DeviceTier } from '../types/device';

interface NavigatorWithMemory extends Navigator {
  deviceMemory?: number;
}

/**
 * 端末区分（PC / タブレット / スマホ）、メモリ、CPU コア数、
 * SharedArrayBuffer / WakeLock / Web Share API の可否を自動検出する。
 */
export function detectDeviceProfile(): DeviceProfile {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      tier: 'pc',
      isIOS: false,
      isSafari: false,
      isTouch: false,
      deviceMemoryGB: 8,
      isMemoryEstimated: true,
      cpuCores: 4,
      supportsSharedArrayBuffer: false,
      isCrossOriginIsolated: false,
      supportsWebShareFiles: false,
      supportsWakeLock: false,
      supportsMediaRecorder: false,
      screenShortSide: 1080,
    };
  }

  const nav = navigator as NavigatorWithMemory;
  const ua = nav.userAgent || '';
  const maxTouchPoints = nav.maxTouchPoints || 0;

  const isIPadOS = /Macintosh/i.test(ua) && maxTouchPoints > 1;
  const isIPhoneOrIPod = /iPhone|iPod/i.test(ua);
  const isIPad = /iPad/i.test(ua) || isIPadOS;
  const isIOS = isIPhoneOrIPod || isIPad;
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|Edg|OPR|Android/i.test(ua);
  const isAndroid = /Android/i.test(ua);

  const isCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const isTouch = isCoarsePointer || maxTouchPoints > 0;
  const screenShortSide = Math.min(window.screen?.width || window.innerWidth, window.screen?.height || window.innerHeight);

  let tier: DeviceTier = 'pc';
  if (isIPhoneOrIPod || (isAndroid && /Mobile/i.test(ua)) || (isTouch && screenShortSide < 600)) {
    tier = 'mobile';
  } else if (isIPad || (isAndroid && !/Mobile/i.test(ua)) || (isTouch && screenShortSide < 1024)) {
    tier = 'tablet';
  }

  const rawMem = nav.deviceMemory;
  const isMemoryEstimated = typeof rawMem !== 'number' || !Number.isFinite(rawMem);
  const deviceMemoryGB = !isMemoryEstimated
    ? rawMem!
    : tier === 'mobile'
      ? isIOS
        ? 4
        : 3
      : tier === 'tablet'
        ? 4
        : 8;

  const cpuCores = Math.max(1, nav.hardwareConcurrency || (tier === 'mobile' ? 4 : 8));
  const isCrossOriginIsolated = Boolean(window.crossOriginIsolated);
  const supportsSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined' && isCrossOriginIsolated;
  const supportsWebShareFiles =
    typeof nav.share === 'function' && typeof nav.canShare === 'function';
  const supportsWakeLock = 'wakeLock' in nav;
  const supportsMediaRecorder = typeof window.MediaRecorder !== 'undefined';

  return {
    tier,
    isIOS,
    isSafari,
    isTouch,
    deviceMemoryGB,
    isMemoryEstimated,
    cpuCores,
    supportsSharedArrayBuffer,
    isCrossOriginIsolated,
    supportsWebShareFiles,
    supportsWakeLock,
    supportsMediaRecorder,
    screenShortSide,
  };
}
