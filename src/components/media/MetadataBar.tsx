import { useState } from 'react';
import { DEVICE_LIMITS } from '../../config/deviceLimits';
import { translate } from '../../i18n';
import { useProjectStore } from '../../store/useProjectStore';
import { useUiStore } from '../../store/useUiStore';
import { formatBytes, formatTimecode } from '../../utils/formatters';

export function MetadataBar() {
  const { lang, device } = useUiStore();
  const { source, isProbing } = useProjectStore();
  const [expanded, setExpanded] = useState(device.tier === 'pc');

  if (!source) return null;

  const { metadata } = source;
  const limits = DEVICE_LIMITS[device.tier];
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate(lang, key, params);

  const tierLabel = t(
    device.tier === 'mobile'
      ? 'device.mobile'
      : device.tier === 'tablet'
        ? 'device.tablet'
        : 'device.pc'
  );

  const warnings: string[] = [];
  const fileSizeMB = metadata.fileSize / (1024 * 1024);
  if (fileSizeMB > limits.warnFileSizeMB) {
    warnings.push(
      t('device.warnLargeFile', {
        size: formatBytes(metadata.fileSize),
        tier: tierLabel,
        limit: limits.warnFileSizeMB,
      })
    );
  }
  if (metadata.durationSec > limits.recommendedMaxDurationSec) {
    warnings.push(
      t('device.warnLongDuration', {
        tier: tierLabel,
        mins: Math.round(limits.recommendedMaxDurationSec / 60),
      })
    );
  }
  if (!metadata.canBrowserPlay && metadata.hasVideo) {
    warnings.push(t('device.warnHevcPreview'));
  }
  if (metadata.isHdr) {
    warnings.push(t('device.warnHdr'));
  }
  if (metadata.isVfrSuspected) {
    warnings.push(t('device.warnVfr'));
  }
  if (metadata.rotation !== 0) {
    warnings.push(t('device.warnRotated', { deg: metadata.rotation }));
  }

  const resShort = metadata.isAudioOnly
    ? t('meta.audioOnly')
    : metadata.width > 0
      ? `${metadata.width}×${metadata.height}`
      : '—';

  // Mobile & Tablet compact collapsible bar saves ~220px of vertical space!
  if (!expanded) {
    return (
      <button
        type="button"
        className="meta-compact-bar"
        onClick={() => setExpanded(true)}
        aria-expanded={false}
      >
        <div className="meta-compact-summary">
          <span className="meta-compact-name mono">{metadata.fileName}</span>
          <span className="mono">{resShort}</span>
          <span className="mono">{formatBytes(metadata.fileSize)}</span>
          {isProbing && <span className="pill pill-info">{t('meta.probing')}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {warnings.length > 0 && (
            <span className="pill pill-primary">
              ⚠ {t('mobile.warningsCount', { count: warnings.length })}
            </span>
          )}
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>▾</span>
        </div>
      </button>
    );
  }

  return (
    <section className="panel" aria-label="Media Metadata">
      <div className="panel-header">
        <div style={{ minWidth: 0 }}>
          <h2 className="panel-title mono" style={{ wordBreak: 'break-all' }}>
            {metadata.fileName}
          </h2>
          <p className="panel-subtitle">
            {metadata.container.toUpperCase()} · {formatBytes(metadata.fileSize)}
            {metadata.bitrateKbps ? ` · ${metadata.bitrateKbps} kbps` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isProbing && <span className="pill pill-info">{t('meta.probing')}</span>}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setExpanded(false)}
            aria-expanded={true}
          >
            ▴
          </button>
        </div>
      </div>

      <div className="meta-grid">
        <div className="meta-cell">
          <span className="meta-label">{t('meta.resolution')}</span>
          <span className="meta-value mono">{resShort}</span>
        </div>

        <div className="meta-cell">
          <span className="meta-label">{t('meta.fps')}</span>
          <span className="meta-value mono">
            {metadata.fps ? `${metadata.fps.toFixed(2).replace(/\.00$/, '')} fps` : '—'}
            {metadata.isVfrSuspected ? ' (VFR)' : ''}
          </span>
        </div>

        <div className="meta-cell">
          <span className="meta-label">{t('meta.codec')}</span>
          <span className="meta-value mono">
            {[metadata.videoCodec, metadata.audioStreams[0]?.codec].filter(Boolean).join(' / ') || '—'}
          </span>
        </div>

        <div className="meta-cell">
          <span className="meta-label">{t('meta.duration')}</span>
          <span className="meta-value mono">{formatTimecode(metadata.durationSec)}</span>
        </div>

        <div className="meta-cell">
          <span className="meta-label">{t('meta.audioTracks')}</span>
          <span className="meta-value">
            {t('meta.tracksUnit', { count: metadata.audioStreams.length })}
          </span>
        </div>

        <div className="meta-cell">
          <span className="meta-label">
            {t('meta.rotation')} / {t('meta.hdr')}
          </span>
          <span className="meta-value mono">
            {metadata.rotation}° · {metadata.isHdr ? t('meta.hdr') : t('meta.sdr')}
          </span>
        </div>
      </div>

      {warnings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {warnings.map((msg, idx) => (
            <div key={idx} className="alert-banner alert-warning" role="status">
              <span>{msg}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
