import { useRef, useState } from 'react';
import { FILE_INPUT_ACCEPT } from '../../config/formats';
import { translate } from '../../i18n';
import { usePlaybackStore } from '../../store/usePlaybackStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useUiStore } from '../../store/useUiStore';
import { clamp, formatTimecode } from '../../utils/formatters';
import { WaveformBar } from './WaveformBar';

interface TimelineProps {
  onAppendVideoFile?: (file: File) => void;
}

export function Timeline({ onAppendVideoFile }: TimelineProps) {
  const { lang } = useUiStore();
  const {
    source,
    sources,
    primaryWaveformPeaks,
    clips,
    selectedClipId,
    audioTracks,
    config,
    selectClip,
    updateConfig,
    updateTrimRange,
    splitClipAtTime,
    duplicateClip,
    removeClip,
    moveClip,
  } = useProjectStore();
  const { currentTime, timelineZoom, setTimelineZoom, requestSeek } = usePlaybackStore();

  const trackRef = useRef<HTMLDivElement | null>(null);
  const appendInputRef = useRef<HTMLInputElement | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | null>(null);

  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate(lang, key, params);

  if (!source || clips.length === 0) return null;

  const activeClip = clips.find((c) => c.id === selectedClipId) ?? clips[0];
  const activeSource = sources.find((s) => s.id === activeClip.sourceId) ?? source;
  const duration = Math.max(0.1, activeSource.metadata.durationSec);

  const startPct = clamp((activeClip.startSec / duration) * 100, 0, 100);
  const endPct = clamp((activeClip.endSec / duration) * 100, startPct, 100);
  const playheadPct = clamp((currentTime / duration) * 100, 0, 100);

  const totalClipsDuration = clips.reduce(
    (sum, c) => sum + Math.max(0.05, c.endSec - c.startSec),
    0
  );

  const clientXToTime = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    return Number((ratio * duration).toFixed(2));
  };

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingHandle) return;
    const sec = clientXToTime(e.clientX);
    requestSeek(sec);
  };

  const handleTrimPointerDown = (
    handle: 'start' | 'end',
    e: React.PointerEvent<HTMLButtonElement>
  ) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingHandle(handle);
    if (!config.trimEnabled) {
      updateConfig({ trimEnabled: true });
    }
  };

  const handleTrimPointerMove = (
    handle: 'start' | 'end',
    e: React.PointerEvent<HTMLButtonElement>
  ) => {
    if (draggingHandle !== handle) return;
    const sec = clientXToTime(e.clientX);
    if (handle === 'start') {
      const nextStart = clamp(sec, 0, Math.max(0, activeClip.endSec - 0.1));
      updateTrimRange(nextStart, activeClip.endSec, activeClip.id);
      requestSeek(nextStart);
    } else {
      const nextEnd = clamp(sec, Math.min(duration, activeClip.startSec + 0.1), duration);
      updateTrimRange(activeClip.startSec, nextEnd, activeClip.id);
      requestSeek(nextEnd);
    }
  };

  const handleTrimPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDraggingHandle(null);
  };

  return (
    <section className="panel" aria-label={t('timeline.multiTitle')}>
      <div className="panel-header">
        <div>
          <h2 className="panel-title">{t('timeline.multiTitle')}</h2>
          <p className="panel-subtitle mono">
            {t('timeline.clipsCount', {
              count: clips.length,
              dur: formatTimecode(totalClipsDuration),
            })}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label className="checkbox-row" style={{ minHeight: 32 }}>
            <input
              type="checkbox"
              checked={config.trimEnabled || clips.length > 1}
              disabled={clips.length > 1}
              onChange={(e) => updateConfig({ trimEnabled: e.target.checked })}
            />
            <span>{t('timeline.enableTrim')}</span>
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="field-label">{t('timeline.zoom')}</span>
            <input
              type="range"
              min={1}
              max={6}
              step={0.5}
              value={timelineZoom}
              onChange={(e) => setTimelineZoom(Number(e.target.value))}
              aria-label={t('timeline.zoom')}
              style={{ width: 78, accentColor: 'var(--accent-primary)' }}
            />
            <span className="mono" style={{ fontSize: '0.75rem' }}>
              {timelineZoom}x
            </span>
          </div>
        </div>
      </div>

      {/* Multi-Clip Action Toolbar */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <button
          type="button"
          className="btn btn-sm"
          title="S"
          onClick={() => splitClipAtTime(activeClip.id, currentTime)}
        >
          ✂ {t('timeline.splitAtPlayhead')}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => duplicateClip(activeClip.id)}
        >
          ⧉ {t('timeline.duplicateClip')}
        </button>
        {onAppendVideoFile && !source.metadata.isAudioOnly && (
          <>
            <input
              ref={appendInputRef}
              type="file"
              accept={FILE_INPUT_ACCEPT}
              className="sr-only"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  onAppendVideoFile(e.target.files[0]);
                }
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => appendInputRef.current?.click()}
            >
              {t('timeline.addVideoClip')}
            </button>
          </>
        )}
      </div>

      {/* Multi-Clip Sequence List (visible when 2+ clips or sources exist) */}
      {clips.length > 1 && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            paddingBottom: 6,
            marginBottom: 8,
          }}
        >
          {clips.map((c, idx) => {
            const selected = c.id === activeClip.id;
            return (
              <div
                key={c.id}
                onClick={() => selectClip(c.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectClip(c.id);
                  }
                }}
                style={{
                  minWidth: 165,
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${selected ? 'var(--accent-primary)' : 'var(--border-default)'}`,
                  background: selected ? 'var(--accent-primary-soft)' : 'var(--bg-surface-elevated)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  flexShrink: 0,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                  <strong className="mono" style={{ fontSize: '0.78rem' }}>
                    Clip #{idx + 1}
                  </strong>
                  <span className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    {formatTimecode(Math.max(0, c.endSec - c.startSec), false)}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {c.label || source.metadata.fileName}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ minHeight: 28, padding: '2px 7px', fontSize: '0.72rem' }}
                    disabled={idx === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      moveClip(c.id, -1);
                    }}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ minHeight: 28, padding: '2px 7px', fontSize: '0.72rem' }}
                    disabled={idx === clips.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      moveClip(c.id, 1);
                    }}
                  >
                    →
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    style={{ minHeight: 28, padding: '2px 7px', fontSize: '0.72rem', marginLeft: 'auto' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeClip(c.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Scrollable zoomed timeline track + primary waveform */}
      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <div style={{ width: `${timelineZoom * 100}%`, minWidth: '100%' }}>
          <div
            ref={trackRef}
            className="timeline-track-wrap"
            onPointerDown={handleTrackPointerDown}
            role="group"
            aria-label="Timeline scrub and trim track"
          >
            <div className="timeline-track-bg" style={{ overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
              {activeSource.id === source.id && primaryWaveformPeaks.length > 0 && (
                <WaveformBar peaks={primaryWaveformPeaks} color="var(--accent-info)" height={24} />
              )}
            </div>
            <div
              className="timeline-selection"
              style={{
                left: `${startPct}%`,
                width: `${Math.max(0.5, endPct - startPct)}%`,
                opacity: config.trimEnabled || clips.length > 1 ? 1 : 0.35,
              }}
            />
            <div className="timeline-playhead" style={{ left: `${playheadPct}%` }} />

            <button
              type="button"
              className="trim-handle"
              style={{ left: `${startPct}%` }}
              aria-label={t('timeline.start')}
              onPointerDown={(e) => handleTrimPointerDown('start', e)}
              onPointerMove={(e) => handleTrimPointerMove('start', e)}
              onPointerUp={handleTrimPointerUp}
              onPointerCancel={handleTrimPointerUp}
            >
              [
            </button>

            <button
              type="button"
              className="trim-handle"
              style={{ left: `${endPct}%` }}
              aria-label={t('timeline.end')}
              onPointerDown={(e) => handleTrimPointerDown('end', e)}
              onPointerMove={(e) => handleTrimPointerMove('end', e)}
              onPointerUp={handleTrimPointerUp}
              onPointerCancel={handleTrimPointerUp}
            >
              ]
            </button>
          </div>

          {/* Aligned Overlay Audio Track Waveform Lanes */}
          {audioTracks.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
              {audioTracks.map((tr) => {
                const trackLeftPct = clamp((tr.offsetSec / Math.max(0.1, totalClipsDuration)) * 100, 0, 98);
                const trimLen = Math.max(0.1, (tr.trimEndSec || tr.durationSec) - tr.trimStartSec);
                const visualLen = tr.loop ? Math.max(0.1, totalClipsDuration - tr.offsetSec) : trimLen;
                const trackWidthPct = clamp(
                  (visualLen / Math.max(0.1, totalClipsDuration)) * 100,
                  2,
                  100 - trackLeftPct
                );
                return (
                  <div
                    key={tr.id}
                    style={{
                      position: 'relative',
                      height: 28,
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 5,
                      overflow: 'hidden',
                      opacity: tr.muted ? 0.4 : 1,
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        left: `${trackLeftPct}%`,
                        width: `${trackWidthPct}%`,
                        top: 2,
                        bottom: 2,
                        background: 'var(--accent-success-soft)',
                        border: '1px solid var(--accent-success)',
                        borderRadius: 4,
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      {tr.waveformPeaks.length > 0 && (
                        <WaveformBar peaks={tr.waveformPeaks} color="var(--accent-success)" height={22} />
                      )}
                      <span
                        className="mono"
                        style={{
                          position: 'absolute',
                          left: 6,
                          fontSize: '0.68rem',
                          color: 'var(--text-primary)',
                          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {tr.name} ({tr.offsetSec.toFixed(1)}s)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Numeric Trim Inputs for Active Clip */}
      <div className="field-row" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div className="field-group">
          <label className="field-label" htmlFor="trim-start-sec">
            {t('timeline.start')} (s)
          </label>
          <input
            id="trim-start-sec"
            type="number"
            min={0}
            max={Math.max(0, activeClip.endSec - 0.1)}
            step={0.1}
            className="input-control mono"
            value={Number(activeClip.startSec.toFixed(2))}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (!Number.isFinite(val)) return;
              updateConfig({ trimEnabled: true });
              updateTrimRange(val, activeClip.endSec, activeClip.id);
            }}
          />
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="trim-end-sec">
            {t('timeline.end')} (s)
          </label>
          <input
            id="trim-end-sec"
            type="number"
            min={Math.min(duration, activeClip.startSec + 0.1)}
            max={Number(duration.toFixed(2))}
            step={0.1}
            className="input-control mono"
            value={Number(activeClip.endSec.toFixed(2))}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (!Number.isFinite(val)) return;
              updateConfig({ trimEnabled: true });
              updateTrimRange(activeClip.startSec, val, activeClip.id);
            }}
          />
        </div>

        <div className="field-group">
          <span className="field-label">{t('timeline.selectedDuration')}</span>
          <div
            className="input-control mono"
            style={{ display: 'flex', alignItems: 'center', color: 'var(--accent-primary)' }}
          >
            {formatTimecode(Math.max(0, activeClip.endSec - activeClip.startSec))}
          </div>
        </div>
      </div>

      {clips.length > 1 && (
        <p className="field-hint" style={{ marginTop: 8 }}>
          {t('timeline.concatNote')}
        </p>
      )}

      {/* Fast vs Accurate Cut Mode (single clip only) */}
      {config.trimEnabled && clips.length === 1 && (
        <div style={{ marginTop: 12 }} className="field-group">
          <span className="field-label">{t('timeline.cutMode')}</span>
          <div className="preset-grid">
            <button
              type="button"
              className={`preset-card ${config.cutMode === 'fast' ? 'active' : ''}`}
              onClick={() => updateConfig({ cutMode: 'fast' })}
            >
              <span className="preset-card-title">{t('timeline.cutFast')}</span>
              <span className="preset-card-desc">{t('timeline.cutFastHint')}</span>
            </button>
            <button
              type="button"
              className={`preset-card ${config.cutMode === 'accurate' ? 'active' : ''}`}
              onClick={() => updateConfig({ cutMode: 'accurate' })}
            >
              <span className="preset-card-title">{t('timeline.cutAccurate')}</span>
              <span className="preset-card-desc">{t('timeline.cutAccurateHint')}</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
