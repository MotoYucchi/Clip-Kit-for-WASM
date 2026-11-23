import { useEffect } from 'react';
import { ExportPanel } from './components/controls/ExportPanel';
import { QuickWizard } from './components/controls/QuickWizard';
import { SettingsPanels } from './components/controls/SettingsPanels';
import { Footer, NoticeStrip } from './components/layout/Footer';
import { Header } from './components/layout/Header';
import { DropZone } from './components/media/DropZone';
import { MetadataBar } from './components/media/MetadataBar';
import { VideoPreview } from './components/media/VideoPreview';
import { BatchModal } from './components/modals/BatchModal';
import { ProgressModal } from './components/modals/ProgressModal';
import { ShortcutsModal } from './components/modals/ShortcutsModal';
import { Timeline } from './components/timeline/Timeline';
import { buildFullFFmpegCommand } from './engine/commandBuilder';
import { ffmpegClient } from './engine/ffmpegClient';
import { computeOutputDimensions } from './engine/filterGraphBuilder';
import { probeViaBrowserElement } from './engine/probeParser';
import { translate } from './i18n';
import { renderTextOverlayToPngFile } from './services/textOverlayRenderer';
import { wakeLockService } from './services/wakeLockService';
import { extractWaveformPeaks } from './services/waveformService';
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
    setShortcutsOpen,
    toastMessage,
    showToast,
    refreshDevice,
  } = useUiStore();

  const {
    source,
    sources,
    clips,
    selectedClipId,
    audioTracks,
    watermarkFile,
    subtitleFile,
    subtitleFontFile,
    config,
    pendingRecovery,
    setSource,
    addAdditionalSource,
    updateSourceMetadata,
    setPrimaryWaveformPeaks,
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

  useEffect(() => {
    const unsub = ffmpegClient.onStatusChange((status, mode) => {
      setWasmState(status, mode);
    });
    return unsub;
  }, [setWasmState]);

  useEffect(() => {
    const onResize = () => refreshDevice();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [refreshDevice]);

  // Full PC Keyboard Shortcuts (Space, J/K/L, I/O, Left/Right, S, Ctrl+Z/Ctrl+Shift+Z, ?)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(!useUiStore.getState().shortcutsOpen);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          useProjectStore.getState().redo();
        } else {
          useProjectStore.getState().undo();
        }
        return;
      }

      const proj = useProjectStore.getState();
      if (!proj.source) return;
      const pb = usePlaybackStore.getState();
      const activeClip = proj.clips.find((c) => c.id === proj.selectedClipId) ?? proj.clips[0];

      if (e.code === 'Space') {
        e.preventDefault();
        pb.dispatchCommand('toggle');
      } else if (e.key.toLowerCase() === 'j') {
        e.preventDefault();
        pb.dispatchCommand('seekDelta', -5);
      } else if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        pb.dispatchCommand('pause');
      } else if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        pb.dispatchCommand('seekDelta', 5);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        pb.dispatchCommand('stepFrame', -1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        pb.dispatchCommand('stepFrame', 1);
      } else if (e.key.toLowerCase() === 'i' && activeClip) {
        e.preventDefault();
        proj.updateConfig({ trimEnabled: true });
        proj.updateTrimRange(
          pb.currentTime,
          Math.max(pb.currentTime + 0.2, activeClip.endSec),
          activeClip.id
        );
      } else if (e.key.toLowerCase() === 'o' && activeClip) {
        e.preventDefault();
        proj.updateConfig({ trimEnabled: true });
        proj.updateTrimRange(
          Math.min(activeClip.startSec, Math.max(0, pb.currentTime - 0.2)),
          pb.currentTime,
          activeClip.id
        );
      } else if (e.key.toLowerCase() === 's' && activeClip) {
        e.preventDefault();
        proj.splitClipAtTime(activeClip.id, pb.currentTime);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setShortcutsOpen]);

  const handleFileSelected = async (file: File) => {
    clearResult();
    setPreviewMode('original');
    setCurrentTime(0);

    const objectUrl = URL.createObjectURL(file);
    const browserMeta = await probeViaBrowserElement(file, objectUrl);
    const srcId = `src-${Date.now()}`;

    setSource({
      id: srcId,
      file,
      objectUrl,
      metadata: browserMeta,
      addedAt: Date.now(),
    });

    // Extract timeline waveform asynchronously (non-blocking)
    void extractWaveformPeaks(file, 140).then(({ peaks }) => {
      if (peaks.length > 0) {
        setPrimaryWaveformPeaks(peaks);
      }
    });

    setProbing(true);
    try {
      const detailedMeta = await ffmpegClient.probeFile(file, browserMeta);
      updateSourceMetadata(detailedMeta, srcId);
    } catch (err) {
      console.warn('[ClipKit] FFmpeg probe skipped/failed, keeping browser metadata:', err);
    } finally {
      setProbing(false);
    }
  };

  const handleAppendVideoFile = async (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    const browserMeta = await probeViaBrowserElement(file, objectUrl);
    const srcId = `src-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    addAdditionalSource({
      id: srcId,
      file,
      objectUrl,
      metadata: browserMeta,
      addedAt: Date.now(),
    });
    showToast(`+ ${file.name}`);

    try {
      const detailedMeta = await ffmpegClient.probeFile(file, browserMeta);
      updateSourceMetadata(detailedMeta, srcId);
    } catch {
      // Keep browser metadata
    }
  };

  const handleExecute = async () => {
    if (!source || clips.length === 0) return;

    setMobileSheetOpen(false);
    const outDims = computeOutputDimensions(source.metadata, config);
    const telopPngFile = await renderTextOverlayToPngFile(
      config.textOverlay,
      outDims.width || source.metadata.width || 1280,
      outDims.height || source.metadata.height || 720
    );

    const plan = buildFullFFmpegCommand({
      primarySource: source,
      sources,
      clips,
      selectedClipId,
      audioTracks,
      config,
      watermarkFile,
      telopPngFile,
      subtitleFile,
      subtitleFontFile,
    });
    const wakeLocked = await wakeLockService.acquire();
    startJob(wakeLocked);

    try {
      const { blob, elapsedMs } = await ffmpegClient.runCommand({
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
            <div className="workspace-left">
              <VideoPreview />
              <MetadataBar />
              <Timeline onAppendVideoFile={handleAppendVideoFile} />
              {uiMode === 'simple' && <QuickWizard />}
              <div className="mobile-inline-export">
                <ExportPanel onExecute={handleExecute} />
              </div>
            </div>

            <div className="workspace-right workspace-right-desktop">
              <SettingsPanels />
              <ExportPanel onExecute={handleExecute} />
            </div>
          </div>
        )}

        <NoticeStrip />
      </main>

      <Footer />

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
      <ShortcutsModal />
      <BatchModal />

      {toastMessage && (
        <div className="toast-container" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
