import { useEffect, useRef } from 'react';
import { translate } from '../../i18n';
import { useJobStore } from '../../store/useJobStore';
import { usePlaybackStore } from '../../store/usePlaybackStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useUiStore } from '../../store/useUiStore';
import { clamp, formatTimecode } from '../../utils/formatters';

export function VideoPreview() {
  const { lang } = useUiStore();
  const {
    source,
    sources,
    clips,
    selectedClipId,
    watermarkPreviewUrl,
    pipPreviewUrl,
    subtitleCues,
    config,
    updateConfig,
    updateTrimRange,
  } = useProjectStore();
  const { latestResult } = useJobStore();
  const {
    currentTime,
    isPlaying,
    previewMode,
    seekRequestSec,
    command,
    setCurrentTime,
    setIsPlaying,
    setPreviewMode,
    clearSeekRequest,
    clearCommand,
  } = usePlaybackStore();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key);

  const activeClip = clips.find((c) => c.id === selectedClipId) ?? clips[0];
  const activeSource =
    (activeClip ? sources.find((s) => s.id === activeClip.sourceId) : null) ?? source;

  const fps = activeSource?.metadata.fps || 30;
  const frameStep = 1 / clamp(fps, 10, 120);

  // Sync external seek requests (from Timeline)
  useEffect(() => {
    if (seekRequestSec === null) return;
    const mediaEl = activeSource?.metadata.isAudioOnly ? audioRef.current : videoRef.current;
    if (mediaEl && Number.isFinite(seekRequestSec)) {
      mediaEl.currentTime = seekRequestSec;
    }
    clearSeekRequest();
  }, [seekRequestSec, activeSource?.metadata.isAudioOnly, clearSeekRequest]);

  // Sync keyboard playback commands (Space, J/K/L, ArrowLeft/ArrowRight)
  useEffect(() => {
    if (!command || !activeSource) return;
    const mediaEl = activeSource.metadata.isAudioOnly ? audioRef.current : videoRef.current;
    if (mediaEl) {
      const maxDur = Math.max(0, activeSource.metadata.durationSec);
      if (command.type === 'toggle') {
        if (mediaEl.paused) {
          mediaEl.play().catch(() => undefined);
        } else {
          mediaEl.pause();
        }
      } else if (command.type === 'pause') {
        mediaEl.pause();
      } else if (command.type === 'seekDelta') {
        const next = clamp(mediaEl.currentTime + (command.value ?? 0), 0, maxDur);
        mediaEl.currentTime = next;
        setCurrentTime(next);
      } else if (command.type === 'stepFrame') {
        mediaEl.pause();
        const next = clamp(mediaEl.currentTime + (command.value ?? 1) * frameStep, 0, maxDur);
        mediaEl.currentTime = next;
        setCurrentTime(next);
      }
    }
    clearCommand();
  }, [command, activeSource, frameStep, setCurrentTime, clearCommand]);

  // Sync preview playback speed
  useEffect(() => {
    const mediaEl = activeSource?.metadata.isAudioOnly ? audioRef.current : videoRef.current;
    if (mediaEl) {
      mediaEl.playbackRate = clamp(config.speed, 0.25, 4);
    }
  }, [config.speed, activeSource?.metadata.isAudioOnly]);

  if (!activeSource) return null;

  const togglePlay = () => {
    const mediaEl = activeSource.metadata.isAudioOnly ? audioRef.current : videoRef.current;
    if (!mediaEl) return;
    if (mediaEl.paused) {
      mediaEl.play().catch(() => undefined);
    } else {
      mediaEl.pause();
    }
  };

  const stepFrame = (direction: -1 | 1) => {
    const mediaEl = activeSource.metadata.isAudioOnly ? audioRef.current : videoRef.current;
    if (!mediaEl) return;
    mediaEl.pause();
    const next = clamp(
      mediaEl.currentTime + direction * frameStep,
      0,
      Math.max(0, activeSource.metadata.durationSec)
    );
    mediaEl.currentTime = next;
    setCurrentTime(next);
  };

  const transformParts: string[] = [];
  if (config.rotation !== 0) transformParts.push(`rotate(${config.rotation}deg)`);
  if (config.flipHorizontal) transformParts.push('scaleX(-1)');
  if (config.flipVertical) transformParts.push('scaleY(-1)');

  const filterParts: string[] = [];
  if (Math.abs(config.brightness) >= 0.01) {
    filterParts.push(`brightness(${(1 + config.brightness).toFixed(2)})`);
  }
  if (Math.abs(config.contrast - 1) >= 0.01) {
    filterParts.push(`contrast(${config.contrast.toFixed(2)})`);
  }
  if (Math.abs(config.saturation - 1) >= 0.01) {
    filterParts.push(`saturate(${config.saturation.toFixed(2)})`);
  }

  const previewTransformStyle: React.CSSProperties | undefined =
    transformParts.length > 0 || filterParts.length > 0
      ? {
          ...(transformParts.length > 0 ? { transform: transformParts.join(' ') } : {}),
          ...(filterParts.length > 0 ? { filter: filterParts.join(' ') } : {}),
        }
      : undefined;

  const isResultImage = Boolean(
    latestResult &&
      (latestResult.taskType === 'snapshot' ||
        latestResult.mimeType === 'image/gif' ||
        latestResult.mimeType === 'image/webp')
  );

  const hasResult = Boolean(latestResult);
  const effectivePreviewMode = hasResult ? previewMode : 'original';

  return (
    <section className="panel" aria-label="Media Preview">
      <div className="panel-header">
        <div className="segmented" role="tablist" aria-label="Preview Mode">
          <button
            type="button"
            role="tab"
            aria-selected={effectivePreviewMode === 'original'}
            className={`segmented-btn ${effectivePreviewMode === 'original' ? 'active' : ''}`}
            onClick={() => setPreviewMode('original')}
          >
            {t('preview.original')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={effectivePreviewMode === 'output'}
            disabled={!hasResult}
            className={`segmented-btn ${effectivePreviewMode === 'output' ? 'active' : ''}`}
            onClick={() => setPreviewMode('output')}
          >
            {t('preview.output')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={effectivePreviewMode === 'compare'}
            disabled={!hasResult}
            className={`segmented-btn ${effectivePreviewMode === 'compare' ? 'active' : ''}`}
            onClick={() => setPreviewMode('compare')}
          >
            {t('preview.compare')}
          </button>
        </div>

        <span className="mono" style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          {formatTimecode(currentTime)} / {formatTimecode(activeSource.metadata.durationSec)}
        </span>
      </div>

      {/* Stage */}
      <div className="preview-stage">
        {effectivePreviewMode === 'compare' && latestResult ? (
          <div className="compare-grid">
            <div className="compare-pane">
              <span className="pill">{t('preview.original')}</span>
              {activeSource.metadata.isAudioOnly ? (
                <audio src={activeSource.objectUrl} controls style={{ width: '100%' }} />
              ) : (
                <video src={activeSource.objectUrl} controls playsInline />
              )}
            </div>
            <div className="compare-pane">
              <span className="pill pill-success">{t('preview.output')}</span>
              {isResultImage ? (
                <img src={latestResult.objectUrl} alt="Exported media" />
              ) : latestResult.taskType === 'audio-extract' ? (
                <audio src={latestResult.objectUrl} controls style={{ width: '100%' }} />
              ) : (
                <video src={latestResult.objectUrl} controls playsInline />
              )}
            </div>
          </div>
        ) : effectivePreviewMode === 'output' && latestResult ? (
          isResultImage ? (
            <img
              src={latestResult.objectUrl}
              alt="Exported media"
              className="preview-video"
            />
          ) : latestResult.taskType === 'audio-extract' ? (
            <div style={{ padding: 24, width: '100%' }}>
              <audio src={latestResult.objectUrl} controls style={{ width: '100%' }} />
            </div>
          ) : (
            <video src={latestResult.objectUrl} controls playsInline className="preview-video" />
          )
        ) : activeSource.metadata.isAudioOnly ? (
          <div style={{ padding: 24, width: '100%' }}>
            <audio
              ref={audioRef}
              key={activeSource.id}
              src={activeSource.objectUrl}
              controls
              style={{ width: '100%' }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            />
          </div>
        ) : !activeSource.metadata.canBrowserPlay ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-secondary)', maxWidth: 420 }}>
            <p style={{ margin: 0, fontSize: '0.88rem' }}>{t('preview.noVideoPreview')}</p>
          </div>
        ) : (
          <div style={{ position: 'relative', display: 'inline-flex', maxWidth: '100%' }}>
            <video
              ref={videoRef}
              key={activeSource.id}
              src={activeSource.objectUrl}
              playsInline
              controls
              className="preview-video"
              style={previewTransformStyle}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            />
            {config.crop.enabled && (
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: `${config.crop.xPct}%`,
                  top: `${config.crop.yPct}%`,
                  width: `${config.crop.widthPct}%`,
                  height: `${config.crop.heightPct}%`,
                  border: '2px dashed var(--accent-primary)',
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
                  pointerEvents: 'none',
                }}
              />
            )}
            {config.watermark.enabled && watermarkPreviewUrl && (
              <img
                src={watermarkPreviewUrl}
                alt=""
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  pointerEvents: 'none',
                  width: `${config.watermark.scalePct}%`,
                  opacity: config.watermark.opacity,
                  ...(config.watermark.position === 'top-left'
                    ? { top: 10, left: 10 }
                    : config.watermark.position === 'top-right'
                      ? { top: 10, right: 10 }
                      : config.watermark.position === 'bottom-left'
                        ? { bottom: 38, left: 10 }
                        : config.watermark.position === 'center'
                          ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
                          : { bottom: 38, right: 10 }),
                }}
              />
            )}
            {config.textOverlay.enabled && config.textOverlay.text.trim() && (
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  maxWidth: '90%',
                  textAlign: 'center',
                  pointerEvents: 'none',
                  padding: config.textOverlay.bgEnabled ? '4px 12px' : 0,
                  borderRadius: 6,
                  background: config.textOverlay.bgEnabled ? 'rgba(0,0,0,0.55)' : 'transparent',
                  color: config.textOverlay.color,
                  fontWeight: 700,
                  fontSize: `${Math.max(12, Math.round(config.textOverlay.fontSize * 0.36))}px`,
                  textShadow: `0 1px 3px ${config.textOverlay.outlineColor}`,
                  whiteSpace: 'pre-wrap',
                  ...(config.textOverlay.positionY === 'top'
                    ? { top: '10%' }
                    : config.textOverlay.positionY === 'center'
                      ? { top: '46%' }
                      : { bottom: '16%' }),
                }}
              >
                {config.textOverlay.text}
              </div>
            )}
            {config.pip.enabled && pipPreviewUrl && (
              <video
                src={pipPreviewUrl}
                muted
                loop
                autoPlay
                playsInline
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  pointerEvents: 'none',
                  width: `${config.pip.scalePct}%`,
                  opacity: config.pip.opacity,
                  border: config.pip.borderEnabled ? '2px solid #ffffff' : 'none',
                  borderRadius: 4,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.55)',
                  ...(config.pip.position === 'top-left'
                    ? { top: 10, left: 10 }
                    : config.pip.position === 'top-right'
                      ? { top: 10, right: 10 }
                      : config.pip.position === 'bottom-left'
                        ? { bottom: 38, left: 10 }
                        : config.pip.position === 'center'
                          ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
                          : { bottom: 38, right: 10 }),
                }}
              />
            )}
            {(() => {
              const activeCue = subtitleCues.find(
                (c) => currentTime >= c.startSec && currentTime <= c.endSec && c.text.trim()
              );
              if (!activeCue) return null;
              return (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: '50%',
                    bottom: '10%',
                    transform: 'translateX(-50%)',
                    maxWidth: '90%',
                    padding: '4px 12px',
                    borderRadius: 6,
                    background: 'rgba(0, 0, 0, 0.72)',
                    color: '#ffffff',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    textAlign: 'center',
                    pointerEvents: 'none',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {activeCue.text}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Transport & Quick Frame Controls */}
      {effectivePreviewMode === 'original' && activeSource.metadata.canBrowserPlay && (
        <div className="preview-transport">
          <div className="transport-group">
            <button type="button" className="btn btn-sm" onClick={togglePlay}>
              {isPlaying ? t('preview.pause') : t('preview.play')}
            </button>
            {!activeSource.metadata.isAudioOnly && (
              <>
                <button
                  type="button"
                  className="btn btn-sm mono"
                  onClick={() => stepFrame(-1)}
                  title={`${t('preview.prevFrame')} (←)`}
                >
                  -1f
                </button>
                <button
                  type="button"
                  className="btn btn-sm mono"
                  onClick={() => stepFrame(1)}
                  title={`${t('preview.nextFrame')} (→)`}
                >
                  +1f
                </button>
              </>
            )}
          </div>

          <div className="transport-group">
            {activeClip && (
              <>
                <button
                  type="button"
                  className="btn btn-sm"
                  title={`${t('preview.setStart')} (I)`}
                  onClick={() => {
                    updateConfig({ trimEnabled: true });
                    updateTrimRange(
                      currentTime,
                      Math.max(currentTime + 0.2, activeClip.endSec),
                      activeClip.id
                    );
                  }}
                >
                  {t('preview.setStart')}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  title={`${t('preview.setEnd')} (O)`}
                  onClick={() => {
                    updateConfig({ trimEnabled: true });
                    updateTrimRange(
                      Math.min(activeClip.startSec, Math.max(0, currentTime - 0.2)),
                      currentTime,
                      activeClip.id
                    );
                  }}
                >
                  {t('preview.setEnd')}
                </button>
              </>
            )}
            {!activeSource.metadata.isAudioOnly && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() =>
                  updateConfig({
                    snapshotTimeSec: Number(currentTime.toFixed(2)),
                  })
                }
              >
                {t('preview.setSnapshot')}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
