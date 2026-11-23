import type { TextOverlayConfig } from '../types/edit';
import { clamp } from '../utils/formatters';

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return `rgba(0, 0, 0, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

/**
 * テキストテロップ（日本語・絵文字・複数行対応）を透過 PNG としてオフスクリーン Canvas に描画する。
 * FFmpeg.wasm 仮想環境にシステムフォントが存在しない問題を完全に回避し、
 * プレビューと同一の見た目で overlay 合成できる。
 */
export async function renderTextOverlayToPngFile(
  overlay: TextOverlayConfig,
  width: number,
  height: number
): Promise<File | null> {
  if (typeof document === 'undefined' || !overlay.enabled || !overlay.text.trim()) {
    return null;
  }
  const safeW = Math.max(64, Math.round(width));
  const safeH = Math.max(64, Math.round(height));

  const canvas = document.createElement('canvas');
  canvas.width = safeW;
  canvas.height = safeH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const scaleFactor = safeH / 1080;
  const fontPx = Math.max(16, Math.round(overlay.fontSize * scaleFactor));
  const lineHeight = Math.round(fontPx * 1.35);

  ctx.font = `700 ${fontPx}px "Noto Sans JP", "Inter", system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lines = overlay.text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return null;

  const maxLineWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
  const totalHeight = lines.length * lineHeight;
  const padX = Math.round(fontPx * 0.65);
  const padY = Math.round(fontPx * 0.35);

  let centerY = safeH * 0.86;
  if (overlay.positionY === 'top') {
    centerY = Math.max(totalHeight / 2 + padY + 24, safeH * 0.14);
  } else if (overlay.positionY === 'center') {
    centerY = safeH * 0.5;
  } else {
    centerY = Math.min(safeH - totalHeight / 2 - padY - 24, safeH * 0.86);
  }

  if (overlay.bgEnabled) {
    const boxW = Math.min(safeW - 24, maxLineWidth + padX * 2);
    const boxH = totalHeight + padY * 2;
    const boxX = (safeW - boxW) / 2;
    const boxY = centerY - boxH / 2;
    const radius = Math.round(fontPx * 0.25);

    ctx.fillStyle = hexToRgba(overlay.bgColor, overlay.bgOpacity);
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, radius);
    ctx.fill();
  }

  const startY = centerY - totalHeight / 2 + lineHeight / 2;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, Math.round(fontPx * 0.11));
  ctx.strokeStyle = overlay.outlineColor;
  ctx.fillStyle = overlay.color;

  lines.forEach((line, idx) => {
    const y = startY + idx * lineHeight;
    ctx.strokeText(line, safeW / 2, y, safeW - 48);
    ctx.fillText(line, safeW / 2, y, safeW - 48);
  });

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  return new File([blob], 'telop_overlay.png', { type: 'image/png' });
}
