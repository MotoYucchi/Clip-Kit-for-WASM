import { useEffect } from 'react';
import { ExportPanel } from './components/controls/ExportPanel';
import { QuickWizard } from './components/controls/QuickWizard';
import { SettingsPanels } from './components/controls/SettingsPanels';
import { Footer, NoticeStrip } from './components/layout/Footer';
import { Header } from './components/layout/Header';
import { DropZone } from './components/media/DropZone';
import { MetadataBar } from './components/media/MetadataBar';
import { VideoPreview } from './components/media/VideoPreview';
import { ProgressModal } from './components/modals/ProgressModal';
import { Timeline } from './components/timeline/Timeline';
import { buildFFmpegCommand } from './engine/commandBuilder';
import { ffmpegClient } from './engine/ffmpegClient';
import { probeViaBrowserElement } from './engine/probeParser';
import { translate } from './i18n';
import { wakeLockService } from './services/wakeLockService';
import { useJobStore } from './store/useJobStore';
import { usePlaybackStore } from './store/usePlaybackStore';
import { useProjectStore } from './store/useProjectStore';
import { useUiStore } from './store/useUiStore';

export function App() {
  const {
    lang,
    uiMode,
    mobileSheetOpen,
    setMobileSheetOpen,
    toastMessage,
    showToast,
    refreshDevice,
  } = useUiStore();

  const {
    source,
    clips,
    config,
    pendingRecovery,
    setSource,
    updateSourceMetadata,
    setProbing,
    restoreRecovery,
    dismissRecovery,
  } = useProjectStore();

  const {
    wasmStatus,
    setWasmState,
    startJob,
    updateProgress,
    appendLog,
    completeJob,
    failJob,
    clearResult,
  } = useJobStore();

  const { setPreviewMode, setCurrentTime } = usePlaybackStore();

  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate(lang, key, params);

  // Sync FFmpeg worker status to job store
  useEffect(() => {
    const unsub = ffmpegClient.onStatusChange((status, mode) => {
      setWasmState(status, mode);
    });
    return unsub;
  }, [setWasmState]);

  // Keep device tier updated on orientation / resize changes
  useEffect(() => {
    const onResize = () => refreshDevice();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [refreshDevice]);

  // Basic PC keyboard shortcuts (Space play/pause, Ctrl+Z / Ctrl+Shift+Z Undo/Redo)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          useProjectStore.getState().redo();
        } else {
          useProjectStore.getState().undo();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleFileSelected = async (file: File) => {
    clearResult();
    setPreviewMode('original');
    setCurrentTime(0);

    const objectUrl = URL.createObjectURL(file);
    const browserMeta = await probeViaBrowserElement(file, objectUrl);

    setSource({
      id: `src-${Date.now()}`,
      file,
      objectUrl,
      metadata: browserMeta,
      addedAt: Date.now(),
    });

    // Enrich metadata asynchronously with FFmpeg probe (rotation, HDR, VFR, multi-audio tracks)
    setProbing(true);
    try {
      const detailedMeta = await ffmpegClient.probeFile(file, browserMeta);
      updateSourceMetadata(detailedMeta);
    } catch (err) {
      console.warn('[ClipKit] FFmpeg probe skipped/failed, keeping browser metadata:', err);
    } finally {
      setProbing(false);
    }
  };

  const handleExecute = async () => {
    const clip = clips[0];
    if (!source || !clip) return;

    setMobileSheetOpen(false);
    const plan = buildFFmpegCommand('__INPUT__', source.metadata, config, clip);
    const wakeLocked = await wakeLockService.acquire();
    startJob(wakeLocked);

    try {
      const { blob, elapsedMs } = await ffmpegClient.runCommand({
        file: source.file,
        plan,
        onProgress: (pct, elapsed, eta) => updateProgress(pct, elapsed, eta),
        onLog: (line) => appendLog(line),
      });

      const objectUrl = URL.createObjectURL(blob);
      completeJob({
        id: `res-${Date.now()}`,
        fileName: plan.downloadFileName,
        mimeType: plan.mimeType,
        size: blob.size,
        blob,
        objectUrl,
        createdAt: Date.now(),
        elapsedMs,
        commandPreview: plan.commandPreview,
        taskType: config.taskType,
      });

      setPreviewMode('output');
      showToast(`${t('export.resultReady')}: ${plan.downloadFileName}`);
    } catch (err) {
      if (err instanceof Error && err.message === 'CANCELLED') {
        failJob('');
      } else {
        failJob(err instanceof Error ? err.message : String(err));
      }
    } finally {
      await wakeLockService.release();
    }
  };

  const handleCancel = async () => {
    ffmpegClient.cancelActiveJob();
    await wakeLockService.release();
    showToast(t('progress.cancel'));
  };

  const isBusy = wasmStatus === 'loading' || wasmStatus === 'running';

  return (
    <div className="app-shell">
      <Header />

      <main className="app-main">
        {/* Session recovery banner */}
        {pendingRecovery && (
          <div className="alert-banner alert-info" role="status">
            <span>{t('recovery.message', { fileName: pendingRecovery.lastFileName })}</span>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button type="button" className="btn btn-sm btn-primary" onClick={restoreRecovery}>
                {t('recovery.restore')}
              </button>
              <button type="button" className="btn btn-sm" onClick={dismissRecovery}>
                {t('recovery.dismiss')}
              </button>
            </div>
          </div>
        )}

        {!source ? (
          <DropZone onFileSelected={handleFileSelected} />
        ) : (
          <div className="workspace-grid">
            {/* Left / Main column: Preview + Metadata + Timeline + Simple Wizard */}
            <div className="workspace-left">
              <VideoPreview />
              <MetadataBar />
              <Timeline />
              {uiMode === 'simple' && <QuickWizard />}
              {/* On mobile, keep ExportPanel accessible inline as well */}
              <div className="mobile-inline-export">
                <ExportPanel onExecute={handleExecute} />
              </div>
            </div>

            {/* Right column (PC / Tablet): Detailed Settings + Export */}
            <div className="workspace-right workspace-right-desktop">
              <SettingsPanels />
              <ExportPanel onExecute={handleExecute} />
            </div>
          </div>
        )}

        <NoticeStrip />
      </main>

      <Footer />

      {/* Mobile One-Handed Bottom Action Dock */}
      {source && (
        <div className="mobile-action-dock" role="region" aria-label="Mobile quick actions">
          <button
            type="button"
            className="btn"
            style={{ flex: 1 }}
            onClick={() => setMobileSheetOpen(true)}
          >
            {t('header.modeAdvanced')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1.4 }}
            disabled={isBusy}
            onClick={handleExecute}
          >
            {config.taskType === 'audio-extract'
              ? t('export.runAudioBtn')
              : config.taskType === 'snapshot'
                ? t('export.runSnapshotBtn')
                : t('export.runBtn')}
          </button>
        </div>
      )}

      {/* Mobile Bottom Sheet for Editing Controls */}
      {source && mobileSheetOpen && (
        <div
          className="mobile-sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile settings menu"
          onClick={() => setMobileSheetOpen(false)}
        >
          <div className="mobile-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-sheet-handle" />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 16px 8px',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <strong>{t('header.modeAdvanced')}</strong>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setMobileSheetOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="mobile-sheet-body">
              <SettingsPanels />
            </div>
          </div>
        </div>
      )}

      <ProgressModal onCancel={handleCancel} />

      {toastMessage && (
        <div className="toast-container" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
