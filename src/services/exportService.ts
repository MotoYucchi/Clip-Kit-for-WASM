import type { DeviceProfile } from '../types/device';

export type SaveMethod = 'share' | 'download';

/**
 * デバイスに応じた保存処理を実行する。
 * iOS では Web Share API（共有シート → 写真に保存 / ファイルに保存）を優先し、
 * 非対応時や Android / PC では標準ダウンロードを行う。
 */
export async function saveExportedBlob(
  blob: Blob,
  fileName: string,
  profile: DeviceProfile,
  preferShare = profile.isIOS
): Promise<SaveMethod> {
  if (preferShare && profile.supportsWebShareFiles) {
    try {
      const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: fileName,
        });
        return 'share';
      }
    } catch (err) {
      // User dismissed share sheet -> don't force duplicate download
      if (err instanceof DOMException && err.name === 'AbortError') {
        return 'share';
      }
      // Fall back to standard download on other errors
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'download';
}
