import { useRef } from 'react';
import { translate, type TranslationKey } from '../../i18n';
import { useProjectStore } from '../../store/useProjectStore';
import { useUiStore } from '../../store/useUiStore';
import type {
  ClipTransitionType,
  SubtitleHandlingMode,
  TextVerticalPosition,
  WatermarkPosition,
} from '../../types/edit';

export function EffectsPanel() {
  const { lang } = useUiStore();
  const {
    source,
    clips,
    config,
    watermarkFile,
    watermarkPreviewUrl,
    subtitleFile,
    subtitleFontFile,
    updateConfig,
    setWatermarkFile,
    setSubtitleFile,
    setSubtitleFontFile,
  } = useProjectStore();

  const wmInputRef = useRef<HTMLInputElement | null>(null);
  const subInputRef = useRef<HTMLInputElement | null>(null);
  const fontInputRef = useRef<HTMLInputElement | null>(null);

  const t = (key: TranslationKey) => translate(lang, key);

  if (!source) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. Color Grading */}
      <div className="field-group">
        <div className="panel-header" style={{ marginBottom: 4 }}>
          <span className="field-label">{t('fx.colorHeading')}</span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => updateConfig({ brightness: 0, contrast: 1, saturation: 1 })}
          >
            {t('fx.resetColor')}
          </button>
        </div>

        <div className="field-label">
          <span>{t('fx.brightness')}</span>
          <span className="mono">{config.brightness.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={-0.5}
          max={0.5}
          step={0.02}
          className="range-control"
          value={config.brightness}
          onChange={(e) => updateConfig({ brightness: Number(e.target.value) })}
        />

        <div className="field-label">
          <span>{t('fx.contrast')}</span>
          <span className="mono">{config.contrast.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0.5}
          max={2.0}
          step={0.05}
          className="range-control"
          value={config.contrast}
          onChange={(e) => updateConfig({ contrast: Number(e.target.value) })}
        />

        <div className="field-label">
          <span>{t('fx.saturation')}</span>
          <span className="mono">{config.saturation.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={2.5}
          step={0.05}
          className="range-control"
          value={config.saturation}
          onChange={(e) => updateConfig({ saturation: Number(e.target.value) })}
        />
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: 0 }} />

      {/* 2. Video Fade In / Out */}
      <div className="field-group">
        <span className="field-label">{t('fx.fadeHeading')}</span>
        <div className="field-row">
          <div className="field-group">
            <label className="field-label" htmlFor="fx-fadein">
              {t('fx.fadeIn')}
            </label>
            <input
              id="fx-fadein"
              type="number"
              min={0}
              max={15}
              step={0.2}
              className="input-control mono"
              value={config.videoFadeInSec}
              onChange={(e) =>
                updateConfig({ videoFadeInSec: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="fx-fadeout">
              {t('fx.fadeOut')}
            </label>
            <input
              id="fx-fadeout"
              type="number"
              min={0}
              max={15}
              step={0.2}
              className="input-control mono"
              value={config.videoFadeOutSec}
              onChange={(e) =>
                updateConfig({ videoFadeOutSec: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </div>
        </div>
      </div>

      {/* 3. Clip Transitions */}
      <div className="field-group">
        <span className="field-label">
          {t('fx.transitionHeading')} ({clips.length})
        </span>
        <div className="field-row">
          <div className="field-group">
            <label className="field-label" htmlFor="fx-trans-type">
              {t('fx.transitionType')}
            </label>
            <select
              id="fx-trans-type"
              className="select-control"
              value={config.clipTransition}
              onChange={(e) =>
                updateConfig({ clipTransition: e.target.value as ClipTransitionType })
              }
            >
              <option value="none">{t('fx.transitionNone')}</option>
              <option value="fade">{t('fx.transitionFade')}</option>
              <option value="dissolve">{t('fx.transitionDissolve')}</option>
              <option value="wipeleft">{t('fx.transitionWipeLeft')}</option>
              <option value="slideleft">{t('fx.transitionSlideLeft')}</option>
            </select>
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="fx-trans-dur">
              {t('fx.transitionDuration')}
            </label>
            <input
              id="fx-trans-dur"
              type="number"
              min={0.2}
              max={2.0}
              step={0.1}
              disabled={config.clipTransition === 'none'}
              className="input-control mono"
              value={config.clipTransitionDurationSec}
              onChange={(e) =>
                updateConfig({
                  clipTransitionDurationSec: Math.max(0.2, Math.min(2, Number(e.target.value) || 0.6)),
                })
              }
            />
          </div>
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: 0 }} />

      {/* 4. Text Telop Burn-in */}
      <div className="field-group">
        <span className="field-label">{t('fx.textHeading')}</span>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={config.textOverlay.enabled}
            onChange={(e) =>
              updateConfig({
                textOverlay: { ...config.textOverlay, enabled: e.target.checked },
              })
            }
          />
          <span>{t('fx.textEnable')}</span>
        </label>

        {config.textOverlay.enabled && (
          <>
            <textarea
              rows={2}
              className="input-control"
              placeholder={t('fx.textPlaceholder')}
              value={config.textOverlay.text}
              onChange={(e) =>
                updateConfig({
                  textOverlay: { ...config.textOverlay, text: e.target.value },
                })
              }
            />

            <div className="field-row">
              <div className="field-group">
                <div className="field-label">
                  <span>{t('fx.textSize')}</span>
                  <span className="mono">{config.textOverlay.fontSize}px</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={110}
                  step={2}
                  className="range-control"
                  value={config.textOverlay.fontSize}
                  onChange={(e) =>
                    updateConfig({
                      textOverlay: { ...config.textOverlay, fontSize: Number(e.target.value) },
                    })
                  }
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="fx-text-pos">
                  {t('fx.textPos')}
                </label>
                <select
                  id="fx-text-pos"
                  className="select-control"
                  value={config.textOverlay.positionY}
                  onChange={(e) =>
                    updateConfig({
                      textOverlay: {
                        ...config.textOverlay,
                        positionY: e.target.value as TextVerticalPosition,
                      },
                    })
                  }
                >
                  <option value="top">{t('fx.textPosTop')}</option>
                  <option value="center">{t('fx.textPosCenter')}</option>
                  <option value="bottom">{t('fx.textPosBottom')}</option>
                </select>
              </div>
            </div>

            <div className="field-row">
              <div className="field-group">
                <label className="field-label" htmlFor="fx-text-color">
                  {t('fx.textColor')}
                </label>
                <input
                  id="fx-text-color"
                  type="color"
                  className="input-control"
                  style={{ padding: 4, height: 40 }}
                  value={config.textOverlay.color}
                  onChange={(e) =>
                    updateConfig({
                      textOverlay: { ...config.textOverlay, color: e.target.value },
                    })
                  }
                />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="fx-text-outline">
                  {t('fx.textOutline')}
                </label>
                <input
                  id="fx-text-outline"
                  type="color"
                  className="input-control"
                  style={{ padding: 4, height: 40 }}
                  value={config.textOverlay.outlineColor}
                  onChange={(e) =>
                    updateConfig({
                      textOverlay: { ...config.textOverlay, outlineColor: e.target.value },
                    })
                  }
                />
              </div>
            </div>

            <div className="field-row">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={config.textOverlay.bgEnabled}
                  onChange={(e) =>
                    updateConfig({
                      textOverlay: { ...config.textOverlay, bgEnabled: e.target.checked },
                    })
                  }
                />
                <span>{t('fx.textBg')}</span>
              </label>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={config.textOverlay.useTimeRange}
                  onChange={(e) =>
                    updateConfig({
                      textOverlay: { ...config.textOverlay, useTimeRange: e.target.checked },
                    })
                  }
                />
                <span>{t('fx.textTimeRange')}</span>
              </label>
            </div>

            {config.textOverlay.useTimeRange && (
              <div className="field-row">
                <div className="field-group">
                  <label className="field-label">{t('timeline.start')} (s)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    className="input-control mono"
                    value={config.textOverlay.startSec}
                    onChange={(e) =>
                      updateConfig({
                        textOverlay: {
                          ...config.textOverlay,
                          startSec: Math.max(0, Number(e.target.value) || 0),
                        },
                      })
                    }
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">{t('timeline.end')} (s)</label>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    className="input-control mono"
                    value={config.textOverlay.endSec}
                    onChange={(e) =>
                      updateConfig({
                        textOverlay: {
                          ...config.textOverlay,
                          endSec: Math.max(0.1, Number(e.target.value) || 5),
                        },
                      })
                    }
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: 0 }} />

      {/* 5. Image Watermark Overlay */}
      <div className="field-group">
        <span className="field-label">{t('fx.wmHeading')}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            ref={wmInputRef}
            type="file"
            accept="image/png,image/webp,image/jpeg"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (f) setWatermarkFile(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => wmInputRef.current?.click()}
          >
            {t('fx.wmSelect')}
          </button>
          {watermarkFile && (
            <>
              <span className="pill mono">{watermarkFile.name}</span>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => setWatermarkFile(null)}
              >
                {t('fx.wmClear')}
              </button>
            </>
          )}
        </div>

        {watermarkFile && watermarkPreviewUrl && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img
                src={watermarkPreviewUrl}
                alt="Watermark preview"
                style={{
                  width: 56,
                  height: 56,
                  objectFit: 'contain',
                  background: 'var(--bg-input)',
                  borderRadius: 6,
                  border: '1px solid var(--border-subtle)',
                  padding: 4,
                }}
              />
              <div className="field-group" style={{ flex: 1 }}>
                <label className="field-label" htmlFor="fx-wm-pos">
                  {t('fx.wmPosition')}
                </label>
                <select
                  id="fx-wm-pos"
                  className="select-control"
                  value={config.watermark.position}
                  onChange={(e) =>
                    updateConfig({
                      watermark: {
                        ...config.watermark,
                        position: e.target.value as WatermarkPosition,
                      },
                    })
                  }
                >
                  <option value="bottom-right">Bottom Right</option>
                  <option value="bottom-left">Bottom Left</option>
                  <option value="top-right">Top Right</option>
                  <option value="top-left">Top Left</option>
                  <option value="center">Center</option>
                </select>
              </div>
            </div>

            <div className="field-row">
              <div className="field-group">
                <div className="field-label">
                  <span>{t('fx.wmScale')}</span>
                  <span className="mono">{config.watermark.scalePct}%</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={60}
                  step={1}
                  className="range-control"
                  value={config.watermark.scalePct}
                  onChange={(e) =>
                    updateConfig({
                      watermark: { ...config.watermark, scalePct: Number(e.target.value) },
                    })
                  }
                />
              </div>

              <div className="field-group">
                <div className="field-label">
                  <span>{t('fx.wmOpacity')}</span>
                  <span className="mono">{Math.round(config.watermark.opacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  className="range-control"
                  value={config.watermark.opacity}
                  onChange={(e) =>
                    updateConfig({
                      watermark: { ...config.watermark, opacity: Number(e.target.value) },
                    })
                  }
                />
              </div>
            </div>
          </>
        )}
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: 0 }} />

      {/* 6. Subtitles (SRT / ASS) */}
      <div className="field-group">
        <span className="field-label">{t('fx.subHeading')}</span>
        <select
          className="select-control"
          value={config.subtitleHandling}
          onChange={(e) =>
            updateConfig({ subtitleHandling: e.target.value as SubtitleHandlingMode })
          }
        >
          <option value="strip">{t('fx.subStrip')}</option>
          <option value="keep">{t('fx.subKeep')}</option>
          <option value="embedExternal">{t('fx.subEmbed')}</option>
          <option value="burnIn">{t('fx.subBurnIn')}</option>
        </select>

        {(config.subtitleHandling === 'embedExternal' ||
          config.subtitleHandling === 'burnIn') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                ref={subInputRef}
                type="file"
                accept=".srt,.ass,.ssa,.vtt"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (f) setSubtitleFile(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => subInputRef.current?.click()}
              >
                {t('fx.subSelectFile')}
              </button>
              {subtitleFile && (
                <>
                  <span className="pill mono">{subtitleFile.name}</span>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => setSubtitleFile(null)}
                  >
                    {t('fx.wmClear')}
                  </button>
                </>
              )}
            </div>

            {config.subtitleHandling === 'burnIn' && (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    ref={fontInputRef}
                    type="file"
                    accept=".ttf,.otf"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setSubtitleFontFile(f);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => fontInputRef.current?.click()}
                  >
                    {t('fx.subSelectFont')}
                  </button>
                  {subtitleFontFile && (
                    <>
                      <span className="pill mono">{subtitleFontFile.name}</span>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => setSubtitleFontFile(null)}
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
                <p className="field-hint">{t('fx.subFontHint')}</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
