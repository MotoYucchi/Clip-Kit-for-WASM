import { useState } from 'react';
import { translate } from '../../i18n';
import { useJobStore } from '../../store/useJobStore';
import { useUiStore } from '../../store/useUiStore';
import { formatDurationShort } from '../../utils/formatters';

interface ProgressModalProps {
  onCancel: () => void;
}

export function ProgressModal({ onCancel }: ProgressModalProps) {
  const { lang } = useUiStore();
  const { wasmStatus, progress, etaSec, wakeLockActive, logs } = useJobStore();
  const [showLogs, setShowLogs] = useState(false);

  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate(lang, key, params);

  if (wasmStatus !== 'loading' && wasmStatus !== 'running') {
    return null;
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="progress-modal-title"
    >
      <div className="modal-card">
        <div className="panel-header" style={{ marginBottom: 0 }}>
          <h2 id="progress-modal-title" className="panel-title">
            {wasmStatus === 'loading' ? t('progress.loadingWasm') : t('progress.title')}
          </h2>
          <span className="mono" style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>
            {wasmStatus === 'loading' ? '…' : `${progress}%`}
          </span>
        </div>

        <div
          className="progress-bar-track"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="progress-bar-fill"
            style={{ width: `${wasmStatus === 'loading' ? 22 : Math.max(4, progress)}%` }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            fontSize: '0.82rem',
            color: 'var(--text-secondary)',
          }}
        >
          <span>
            {etaSec !== null
              ? t('progress.eta', { eta: formatDurationShort(etaSec) })
              : t('progress.etaCalculating')}
          </span>
          {wakeLockActive && <span className="pill pill-success">{t('progress.wakeLockOn')}</span>}
        </div>

        <div className="alert-banner alert-warning" role="status">
          <span>{t('progress.keepOpen')}</span>
        </div>

        {logs.length > 0 && (
          <div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setShowLogs((prev) => !prev)}
            >
              {t('progress.logsToggle')} ({logs.length})
            </button>
            {showLogs && <div className="log-box" style={{ marginTop: 8 }}>{logs.slice(-30).join('\n')}</div>}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-danger" onClick={onCancel}>
            {t('progress.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
