import { DEVICE_LIMITS } from '../../config/deviceLimits';
import { translate } from '../../i18n';
import { useProjectStore } from '../../store/useProjectStore';
import { useUiStore } from '../../store/useUiStore';
import { formatBytes, formatTimecode } from '../../utils/formatters';

export function MetadataBar() {
  const { lang, device } = useUiStore();
  const { source, isProbing } = useProjectStore();
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

  return (
    <section className="panel" aria-label="Media Metadata">
      <div className="panel-header">
        <div>
          <h2 className="panel-title mono" style={{ wordBreak: 'break-all' }}>
            {metadata.fileName}
          </h2>
          <p className="panel-subtitle">
            {metadata.container.toUpperCase()} · {formatBytes(metadata.fileSize)}
            {metadata.bitrateKbps ? ` · ${metadata.bitrateKbps} kbps` : ''}
          </p>
        </div>
        {isProbing && <span className="pill pill-info">{t('meta.probing')}</span>}
      </div>

      <div className="meta-grid">
        <div className="meta-cell">
          <span className="meta-label">{t('meta.resolution')}</span>
          <span className="meta-value mono">
            {metadata.isAudioOnly
              ? t('meta.audioOnly')
              : metadata.width > 0
                ? `${metadata.width}×${metadata.height}`
                : '—'}
          </span>
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
