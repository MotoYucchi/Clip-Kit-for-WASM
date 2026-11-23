import { useMemo, useState } from 'react';
import { buildFFmpegCommand } from '../../engine/commandBuilder';
import { estimateOutputSize } from '../../engine/sizeEstimator';
import { translate } from '../../i18n';
import { saveExportedBlob } from '../../services/exportService';
import { useJobStore } from '../../store/useJobStore';
import { usePlaybackStore } from '../../store/usePlaybackStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useUiStore } from '../../store/useUiStore';
import { formatBytes } from '../../utils/formatters';

interface ExportPanelProps {
  onExecute: () => void;
}

export function ExportPanel({ onExecute }: ExportPanelProps) {
  const { lang, device, showToast } = useUiStore();
  const { source, clips, config } = useProjectStore();
  const { wasmStatus, latestResult, errorMessage } = useJobStore();
  const { setPreviewMode } = usePlaybackStore();
  const [showCommand, setShowCommand] = useState(false);

  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate(lang, key, params);

  const primaryClip = clips[0];

  const estimate = useMemo(() => {
    if (!source || !primaryClip) return null;
    return estimateOutputSize(source.metadata, config, primaryClip);
  }, [source, primaryClip, config]);

  const commandPlan = useMemo(() => {
    if (!source || !primaryClip) return null;
    return buildFFmpegCommand('input', source.metadata, config, primaryClip);
  }, [source, primaryClip, config]);

  if (!source || !primaryClip || !estimate || !commandPlan) return null;

  const isBusy = wasmStatus === 'loading' || wasmStatus === 'running';

  const ctaLabel =
    config.taskType === 'audio-extract'
      ? t('export.runAudioBtn')
      : config.taskType === 'snapshot'
        ? t('export.runSnapshotBtn')
        : t('export.runBtn');

  const handleSave = async (preferShare: boolean) => {
    if (!latestResult) return;
    const method = await saveExportedBlob(
      latestResult.blob,
      latestResult.fileName,
      device,
      preferShare
    );
    showToast(
      method === 'share'
        ? `${latestResult.fileName} (Share)`
        : `${latestResult.fileName} (${formatBytes(latestResult.size)})`
    );
  };

  return (
    <section className="panel" aria-label="Export">
      <div className="export-summary">
        <div className="export-estimate-row">
          <span className="field-label">{t('export.estimatedSize')}</span>
          <span className="mono" style={{ fontWeight: 700, fontSize: '0.95rem' }}>
            ~{formatBytes(estimate.estimatedBytes)}
            {estimate.deltaPercent !== null && (
              <span
                style={{
                  marginLeft: 6,
                  fontSize: '0.78rem',
                  color:
                    estimate.deltaPercent <= 0 ? 'var(--accent-success)' : 'var(--accent-warning)',
                }}
              >
                ({estimate.deltaPercent > 0 ? `+${estimate.deltaPercent}%` : `${estimate.deltaPercent}%`})
              </span>
            )}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className={`pill ${commandPlan.usedStreamCopy ? 'pill-success' : 'pill-primary'}`}>
            {commandPlan.usedStreamCopy ? t('export.fastCopy') : t('export.singlePass')}
          </span>
          <span className="pill mono">{commandPlan.downloadFileName}</span>
        </div>

        <button
          type="button"
          className="btn btn-primary btn-lg btn-block"
          disabled={isBusy}
          onClick={onExecute}
        >
          {ctaLabel}
        </button>

        <button
          type="button"
          className="btn btn-sm"
          onClick={() => setShowCommand((prev) => !prev)}
        >
          {t('export.showCommand')}
        </button>

        {showCommand && <pre className="command-code">{commandPlan.commandPreview}</pre>}
      </div>

      {errorMessage && (
        <div className="alert-banner alert-danger" style={{ marginTop: 12 }} role="alert">
          <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{errorMessage}</span>
        </div>
      )}

      {latestResult && (
        <div
          className="alert-banner alert-success"
          style={{ marginTop: 12, flexDirection: 'column', alignItems: 'stretch' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <strong>{t('export.resultReady')}</strong>
            <span className="mono" style={{ fontSize: '0.78rem' }}>
              {formatBytes(latestResult.size)} ·{' '}
              {t('export.elapsed', { sec: (latestResult.elapsedMs / 1000).toFixed(1) })}
            </span>
          </div>
          <span className="mono" style={{ fontSize: '0.78rem', wordBreak: 'break-all' }}>
            {latestResult.fileName}
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {device.isIOS && device.supportsWebShareFiles ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ flex: 1 }}
                  onClick={() => handleSave(true)}
                >
                  {t('export.shareBtn')}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => handleSave(false)}
                >
                  {t('export.downloadBtn')}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ flex: 1 }}
                onClick={() => handleSave(false)}
              >
                {t('export.downloadBtn')}
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setPreviewMode('compare')}
            >
              {t('preview.compare')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
