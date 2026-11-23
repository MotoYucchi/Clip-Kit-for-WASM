export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx++;
  }
  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[unitIdx]}`;
}

export function formatTimecode(sec: number, showMs = true): string {
  if (!Number.isFinite(sec) || sec < 0) return showMs ? '00:00.00' : '00:00';
  const totalMs = Math.round(sec * 1000);
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const centis = Math.floor((totalMs % 1000) / 10);

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const cs = String(centis).padStart(2, '0');

  if (hours > 0) {
    const hh = String(hours).padStart(2, '0');
    return showMs ? `${hh}:${mm}:${ss}.${cs}` : `${hh}:${mm}:${ss}`;
  }
  return showMs ? `${mm}:${ss}.${cs}` : `${mm}:${ss}`;
}

export function formatDurationShort(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0秒';
  if (sec < 60) return `${Math.ceil(sec)}秒`;
  const mins = Math.floor(sec / 60);
  const rem = Math.ceil(sec % 60);
  return rem > 0 ? `${mins}分${rem}秒` : `${mins}分`;
}

export function makeEven(value: number): number {
  const rounded = Math.round(value);
  const even = rounded % 2 === 0 ? rounded : rounded + 1;
  return Math.max(2, even);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function stripExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx > 0 ? fileName.slice(0, idx) : fileName;
}

export function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx > 0 ? fileName.slice(idx + 1).toLowerCase() : '';
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim() || 'output';
}

export function normalizeHexColor(hex: string): string {
  const cleaned = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `0x${cleaned.toLowerCase()}`;
  }
  return '0x000000';
}
