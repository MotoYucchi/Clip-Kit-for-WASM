import { useEffect, useRef } from 'react';
import { translate } from '../../i18n';
import { useJobStore } from '../../store/useJobStore';
import { usePlaybackStore } from '../../store/usePlaybackStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useUiStore } from '../../store/useUiStore';
import { clamp, formatTimecode } from '../../utils/formatters';

export function VideoPreview() {
  const { lang } = useUiStore();
  const { source, clips, config, updateConfig, updateTrimRange } = useProjectStore();
  const { latestResult } = useJobStore();
  const {
    currentTime,
    isPlaying,
    previewMode,
    seekRequestSec,
    setCurrentTime,
    setIsPlaying,
    setPreviewMode,
    clearSeekRequest,
  } = usePlaybackStore();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key);

  const primaryClip = clips[0];
  const fps = source?.metadata.fps || 30;
  const frameStep = 1 / clamp(fps, 10, 120);

  // Sync external seek requests (e.g. from Timeline)
  useEffect(() => {
    if (seekRequestSec === null) return;
    const mediaEl = source?.metadata.isAudioOnly ? audioRef.current : videoRef.current;
    if (mediaEl && Number.isFinite(seekRequestSec)) {
      mediaEl.currentTime = seekRequestSec;
    }
    clearSeekRequest();
  }, [seekRequestSec, source?.metadata.isAudioOnly, clearSeekRequest]);

  // Sync preview playback speed
  useEffect(() => {
    const mediaEl = source?.metadata.isAudioOnly ? audioRef.current : videoRef.current;
    if (mediaEl) {
      mediaEl.playbackRate = clamp(config.speed, 0.25, 4);
    }
  }, [config.speed, source?.metadata.isAudioOnly]);

  if (!source) return null;

  const togglePlay = () => {
    const mediaEl = source.metadata.isAudioOnly ? audioRef.current : videoRef.current;
    if (!mediaEl) return;
    if (mediaEl.paused) {
      mediaEl.play().catch(() => undefined);
    } else {
      mediaEl.pause();
    }
  };

  const stepFrame = (direction: -1 | 1) => {
    const mediaEl = source.metadata.isAudioOnly ? audioRef.current : videoRef.current;
    if (!mediaEl) return;
    mediaEl.pause();
    const next = clamp(
      mediaEl.currentTime + direction * frameStep,
      0,
      Math.max(0, source.metadata.durationSec)
    );
    mediaEl.currentTime = next;
    setCurrentTime(next);
  };

  // Visual preview transform reflecting user's rotation / flip settings immediately
  const transformParts: string[] = [];
  if (config.rotation !== 0) transformParts.push(`rotate(${config.rotation}deg)`);
  if (config.flipHorizontal) transformParts.push('scaleX(-1)');
  if (config.flipVertical) transformParts.push('scaleY(-1)');
  const previewTransformStyle =
    transformParts.length > 0 ? { transform: transformParts.join(' ') } : undefined;

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
          {formatTimecode(currentTime)} / {formatTimecode(source.metadata.durationSec)}
        </span>
      </div>

      {/* Stage */}
      <div className="preview-stage">
        {effectivePreviewMode === 'compare' && latestResult ? (
          <div className="compare-grid">
            <div className="compare-pane">
              <span className="pill">{t('preview.original')}</span>
              {source.metadata.isAudioOnly ? (
                <audio src={source.objectUrl} controls style={{ width: '100%' }} />
              ) : (
                <video src={source.objectUrl} controls playsInline />
              )}
            </div>
            <div className="compare-pane">
              <span className="pill pill-success">{t('preview.output')}</span>
              {latestResult.taskType === 'snapshot' ? (
                <img src={latestResult.objectUrl} alt="Exported snapshot" />
              ) : latestResult.taskType === 'audio-extract' ? (
                <audio src={latestResult.objectUrl} controls style={{ width: '100%' }} />
              ) : (
                <video src={latestResult.objectUrl} controls playsInline />
              )}
            </div>
          </div>
        ) : effectivePreviewMode === 'output' && latestResult ? (
          latestResult.taskType === 'snapshot' ? (
            <img
              src={latestResult.objectUrl}
              alt="Exported snapshot"
              className="preview-video"
            />
          ) : latestResult.taskType === 'audio-extract' ? (
            <div style={{ padding: 24, width: '100%' }}>
              <audio src={latestResult.objectUrl} controls style={{ width: '100%' }} />
            </div>
          ) : (
            <video src={latestResult.objectUrl} controls playsInline className="preview-video" />
          )
        ) : source.metadata.isAudioOnly ? (
          <div style={{ padding: 24, width: '100%' }}>
            <audio
              ref={audioRef}
              src={source.objectUrl}
              controls
              style={{ width: '100%' }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            />
          </div>
        ) : !source.metadata.canBrowserPlay ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-secondary)', maxWidth: 420 }}>
            <p style={{ margin: 0, fontSize: '0.88rem' }}>{t('preview.noVideoPreview')}</p>
          </div>
        ) : (
          <div style={{ position: 'relative', display: 'inline-flex', maxWidth: '100%' }}>
            <video
              ref={videoRef}
              src={source.objectUrl}
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
          </div>
        )}
      </div>

      {/* Transport & Quick Frame Controls */}
      {effectivePreviewMode === 'original' && source.metadata.canBrowserPlay && (
        <div className="preview-transport">
          <div className="transport-group">
            <button type="button" className="btn btn-sm" onClick={togglePlay}>
              {isPlaying ? t('preview.pause') : t('preview.play')}
            </button>
            {!source.metadata.isAudioOnly && (
              <>
                <button
                  type="button"
                  className="btn btn-sm mono"
                  onClick={() => stepFrame(-1)}
                  title={t('preview.prevFrame')}
                >
                  -1f
                </button>
                <button
                  type="button"
                  className="btn btn-sm mono"
                  onClick={() => stepFrame(1)}
                  title={t('preview.nextFrame')}
                >
                  +1f
                </button>
              </>
            )}
          </div>

          <div className="transport-group">
            {primaryClip && (
              <>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    updateConfig({ trimEnabled: true });
                    updateTrimRange(currentTime, Math.max(currentTime + 0.2, primaryClip.endSec));
                  }}
                >
                  {t('preview.setStart')}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    updateConfig({ trimEnabled: true });
                    updateTrimRange(Math.min(primaryClip.startSec, Math.max(0, currentTime - 0.2)), currentTime);
                  }}
                >
                  {t('preview.setEnd')}
                </button>
              </>
            )}
            {!source.metadata.isAudioOnly && (
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
