import { useRef, useState } from 'react';
import { FILE_INPUT_ACCEPT } from '../../config/formats';
import { buildFullFFmpegCommand } from '../../engine/commandBuilder';
import { ffmpegClient } from '../../engine/ffmpegClient';
import { computeOutputDimensions } from '../../engine/filterGraphBuilder';
import { probeViaBrowserElement } from '../../engine/probeParser';
import { translate, type TranslationKey } from '../../i18n';
import { saveExportedBlob } from '../../services/exportService';
import { renderTextOverlayToPngFile } from '../../services/textOverlayRenderer';
import { wakeLockService } from '../../services/wakeLockService';
import { useProjectStore } from '../../store/useProjectStore';
import { useUiStore } from '../../store/useUiStore';
import { formatBytes } from '../../utils/formatters';
import { buildZipBlob } from '../../utils/zipBuilder';

interface BatchQueueItem {
  id: string;
  file: File;
  status: 'pending' | 'running' | 'done' | 'error';
  progress: number;
  outputName?: string;
  outputBlob?: Blob;
  error?: string;
}

export function BatchModal() {
  const { lang, device, batchModalOpen, setBatchModalOpen, showToast } = useUiStore();
  const { config, watermarkFile, subtitleFile, subtitleFontFile } = useProjectStore();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<BatchQueueItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const t = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(lang, key, params);

  if (!batchModalOpen) return null;

  const handleAddFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const added: BatchQueueItem[] = [];
    for (let i = 0; i < files.length; i++) {
      added.push({
        id: `batch-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        file: files[i],
        status: 'pending',
        progress: 0,
      });
    }
    setItems((prev) => [...prev, ...added]);
  };

  const handleStartBatch = async () => {
    if (isRunning || items.length === 0) return;
    setIsRunning(true);
    await wakeLockService.acquire();

    try {
      for (const item of items) {
        if (item.status === 'done') continue;

        setItems((prev) =>
          prev.map((x) => (x.id === item.id ? { ...x, status: 'running', progress: 0, error: undefined } : x))
        );

        const tempUrl = URL.createObjectURL(item.file);
        try {
          const browserMeta = await probeViaBrowserElement(item.file, tempUrl);
          const detailedMeta = await ffmpegClient
            .probeFile(item.file, browserMeta)
            .catch(() => browserMeta);

          const batchConfig = { ...config, trimEnabled: false };
          const outDims = computeOutputDimensions(detailedMeta, batchConfig);
          const telopPngFile = await renderTextOverlayToPngFile(
            batchConfig.textOverlay,
            outDims.width || detailedMeta.width || 1280,
            outDims.height || detailedMeta.height || 720
          );

          const src = {
            id: item.id,
            file: item.file,
            objectUrl: tempUrl,
            metadata: detailedMeta,
            addedAt: Date.now(),
          };
          const clip = {
            id: `clip-${item.id}`,
            sourceId: src.id,
            startSec: 0,
            endSec: Math.max(0.1, detailedMeta.durationSec),
          };

          const plan = buildFullFFmpegCommand({
            primarySource: src,
            sources: [src],
            clips: [clip],
            audioTracks: [],
            config: batchConfig,
            watermarkFile,
            telopPngFile,
            subtitleFile,
            subtitleFontFile,
          });

          const { blob } = await ffmpegClient.runCommand({
            plan,
            onProgress: (pct) => {
              setItems((prev) =>
                prev.map((x) => (x.id === item.id ? { ...x, progress: pct } : x))
              );
            },
          });

          setItems((prev) =>
            prev.map((x) =>
              x.id === item.id
                ? {
                    ...x,
                    status: 'done',
                    progress: 100,
                    outputName: plan.downloadFileName,
                    outputBlob: blob,
                  }
                : x
            )
          );
        } catch (err) {
          setItems((prev) =>
            prev.map((x) =>
              x.id === item.id
                ? {
                    ...x,
                    status: 'error',
                    error: err instanceof Error ? err.message : String(err),
                  }
                : x
            )
          );
        } finally {
          URL.revokeObjectURL(tempUrl);
        }
      }
      showToast(t('export.resultReady'));
    } finally {
      await wakeLockService.release();
      setIsRunning(false);
    }
  };

  const completedItems = items.filter((x) => x.status === 'done' && x.outputBlob && x.outputName);

  const handleDownloadZip = async () => {
    if (completedItems.length === 0) return;
    const zipBlob = await buildZipBlob(
      completedItems.map((x) => ({
        name: x.outputName!,
        data: x.outputBlob!,
      }))
    );
    await saveExportedBlob(
      zipBlob,
      `clipkit-batch-${new Date().toISOString().slice(0, 10)}.zip`,
      device,
      false
    );
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-modal-title"
      onClick={() => !isRunning && setBatchModalOpen(false)}
    >
      <div
        className="modal-card"
        style={{ width: 'min(680px, 100%)', maxHeight: '86dvh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-header" style={{ marginBottom: 0 }}>
          <div>
            <h2 id="batch-modal-title" className="panel-title">
              {t('batch.title')}
            </h2>
            <p className="panel-subtitle">{t('batch.subtitle')}</p>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            disabled={isRunning}
            onClick={() => setBatchModalOpen(false)}
          >
            {t('batch.close')}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            ref={inputRef}
            type="file"
            accept={FILE_INPUT_ACCEPT}
            multiple
            className="sr-only"
            onChange={(e) => {
              handleAddFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="btn btn-sm"
            disabled={isRunning}
            onClick={() => inputRef.current?.click()}
          >
            {t('batch.addFiles')}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={isRunning || items.length === 0}
            onClick={() => void handleStartBatch()}
          >
            {t('batch.start')} ({items.length})
          </button>
          {completedItems.length > 0 && (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={isRunning}
              onClick={() => void handleDownloadZip()}
            >
              {t('batch.downloadZip')} ({completedItems.length})
            </button>
          )}
          {items.length > 0 && (
            <button
              type="button"
              className="btn btn-sm btn-danger"
              disabled={isRunning}
              onClick={() => setItems([])}
            >
              {t('batch.clear')}
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="alert-banner">
            <span>{t('batch.empty')}</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span className="mono" style={{ fontSize: '0.82rem', wordBreak: 'break-all' }}>
                    {item.file.name} ({formatBytes(item.file.size)})
                  </span>
                  <span
                    className={`pill ${
                      item.status === 'done'
                        ? 'pill-success'
                        : item.status === 'error'
                          ? 'pill-danger'
                          : item.status === 'running'
                            ? 'pill-primary'
                            : ''
                    }`}
                  >
                    {item.status === 'pending'
                      ? t('batch.statusPending')
                      : item.status === 'running'
                        ? t('batch.statusRunning', { pct: item.progress })
                        : item.status === 'done'
                          ? `${t('batch.statusDone')} (${formatBytes(item.outputBlob?.size ?? 0)})`
                          : t('batch.statusError')}
                  </span>
                </div>

                {item.status === 'running' && (
                  <div className="progress-bar-track" style={{ height: 8 }}>
                    <div className="progress-bar-fill" style={{ width: `${Math.max(5, item.progress)}%` }} />
                  </div>
                )}

                {item.error && (
                  <p className="field-hint" style={{ color: 'var(--accent-danger)' }}>
                    {item.error}
                  </p>
                )}

                {item.status === 'done' && item.outputBlob && item.outputName && (
                  <div>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() =>
                        void saveExportedBlob(item.outputBlob!, item.outputName!, device, device.isIOS)
                      }
                    >
                      {t('export.downloadBtn')} · {item.outputName}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
