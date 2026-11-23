interface WaveformBarProps {
  peaks: number[];
  color?: string;
  height?: number;
  className?: string;
}

/**
 * Web Audio API で抽出した正規化ピーク配列を軽量 SVG 波形として描画する。
 */
export function WaveformBar({
  peaks,
  color = 'var(--accent-info)',
  height = 36,
  className = '',
}: WaveformBarProps) {
  if (!peaks || peaks.length === 0) return null;

  const width = 1000;
  const barSlot = width / peaks.length;
  const barWidth = Math.max(2, barSlot * 0.68);
  const mid = height / 2;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
      style={{ width: '100%', height, display: 'block', pointerEvents: 'none' }}
    >
      {peaks.map((amp, idx) => {
        const clamped = Math.max(0.06, Math.min(1, amp));
        const h = clamped * (height - 4);
        const x = idx * barSlot + (barSlot - barWidth) / 2;
        const y = mid - h / 2;
        return (
          <rect
            key={idx}
            x={x}
            y={y}
            width={barWidth}
            height={h}
            rx={1.5}
            fill={color}
            fillOpacity={0.78}
          />
        );
      })}
    </svg>
  );
}
