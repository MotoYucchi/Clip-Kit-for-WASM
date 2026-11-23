import { useRef, useState } from 'react';
import { translate } from '../../i18n';
import { usePlaybackStore } from '../../store/usePlaybackStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useUiStore } from '../../store/useUiStore';
import { clamp, formatTimecode } from '../../utils/formatters';

export function Timeline() {
  const { lang } = useUiStore();
  const { source, clips, config, updateConfig, updateTrimRange } = useProjectStore();
  const { currentTime, requestSeek } = usePlaybackStore();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | null>(null);

  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key);

  if (!source || clips.length === 0) return null;

  const duration = Math.max(0.1, source.metadata.durationSec);
  const clip = clips[0];
  const startPct = clamp((clip.startSec / duration) * 100, 0, 100);
  const endPct = clamp((clip.endSec / duration) * 100, startPct, 100);
  const playheadPct = clamp((currentTime / duration) * 100, 0, 100);

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
      const nextStart = clamp(sec, 0, Math.max(0, clip.endSec - 0.1));
      updateTrimRange(nextStart, clip.endSec);
      requestSeek(nextStart);
    } else {
      const nextEnd = clamp(sec, Math.min(duration, clip.startSec + 0.1), duration);
      updateTrimRange(clip.startSec, nextEnd);
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
    <section className="panel" aria-label={t('timeline.title')}>
      <div className="panel-header">
        <h2 className="panel-title">{t('timeline.title')}</h2>
        <label className="checkbox-row" style={{ minHeight: 32 }}>
          <input
            type="checkbox"
            checked={config.trimEnabled}
            onChange={(e) => updateConfig({ trimEnabled: e.target.checked })}
          />
          <span>{t('timeline.enableTrim')}</span>
        </label>
      </div>

      {/* Touch-friendly draggable timeline track */}
      <div
        ref={trackRef}
        className="timeline-track-wrap"
        onPointerDown={handleTrackPointerDown}
        role="group"
        aria-label="Timeline scrub and trim track"
      >
        <div className="timeline-track-bg" />
        <div
          className="timeline-selection"
          style={{
            left: `${startPct}%`,
            width: `${Math.max(0.5, endPct - startPct)}%`,
            opacity: config.trimEnabled ? 1 : 0.35,
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

      {/* Numeric Trim Inputs */}
      <div className="field-row" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div className="field-group">
          <label className="field-label" htmlFor="trim-start-sec">
            {t('timeline.start')} (s)
          </label>
          <input
            id="trim-start-sec"
            type="number"
            min={0}
            max={Math.max(0, clip.endSec - 0.1)}
            step={0.1}
            className="input-control mono"
            value={Number(clip.startSec.toFixed(2))}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (!Number.isFinite(val)) return;
              updateConfig({ trimEnabled: true });
              updateTrimRange(val, clip.endSec);
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
            min={Math.min(duration, clip.startSec + 0.1)}
            max={Number(duration.toFixed(2))}
            step={0.1}
            className="input-control mono"
            value={Number(clip.endSec.toFixed(2))}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (!Number.isFinite(val)) return;
              updateConfig({ trimEnabled: true });
              updateTrimRange(clip.startSec, val);
            }}
          />
        </div>

        <div className="field-group">
          <span className="field-label">{t('timeline.selectedDuration')}</span>
          <div
            className="input-control mono"
            style={{ display: 'flex', alignItems: 'center', color: 'var(--accent-primary)' }}
          >
            {formatTimecode(Math.max(0, clip.endSec - clip.startSec))}
          </div>
        </div>
      </div>

      {/* Fast vs Accurate Cut Mode */}
      {config.trimEnabled && (
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
