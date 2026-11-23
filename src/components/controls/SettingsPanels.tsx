import { DEVICE_LIMITS, getFeatureCapability } from '../../config/deviceLimits';
import { AUDIO_EXTRACT_SPECS, CONTAINER_SPECS } from '../../config/formats';
import {
  ASPECT_RATIO_PRESETS,
  COMPRESSION_PRESETS,
  RESOLUTION_PRESET_HEIGHTS,
  SPEED_PRESETS,
} from '../../config/presets';
import { computeOutputDimensions } from '../../engine/filterGraphBuilder';
import { translate, type TranslationKey } from '../../i18n';
import { usePlaybackStore } from '../../store/usePlaybackStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useUiStore, type ControlTab } from '../../store/useUiStore';
import type {
  AspectMode,
  AspectPreset,
  AudioCodec,
  AudioExtractFormat,
  CompressionPreset,
  MuteMode,
  OutputContainer,
  ResolutionPreset,
  RotationDegrees,
  ScaleAlgorithm,
  VideoCodec,
} from '../../types/edit';

const TABS: { id: ControlTab; labelKey: TranslationKey; videoOnly?: boolean }[] = [
  { id: 'output', labelKey: 'tab.output' },
  { id: 'trim', labelKey: 'tab.trim' },
  { id: 'resize', labelKey: 'tab.resize', videoOnly: true },
  { id: 'speed', labelKey: 'tab.speed' },
  { id: 'transform', labelKey: 'tab.transform', videoOnly: true },
  { id: 'audio', labelKey: 'tab.audio' },
  { id: 'snapshot', labelKey: 'tab.snapshot', videoOnly: true },
];

export function SettingsPanels() {
  const { lang, device, activeTab, setActiveTab } = useUiStore();
  const { source, clips, config, compatNoticeKeys, updateConfig, updateTrimRange } =
    useProjectStore();
  const { currentTime } = usePlaybackStore();

  const t = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(lang, key, params);

  if (!source) return null;

  const { metadata } = source;
  const clip = clips[0];
  const isAudioOnly = metadata.isAudioOnly;
  const visibleTabs = TABS.filter((tab) => !(isAudioOnly && tab.videoOnly));
  const safeTab = visibleTabs.some((tab) => tab.id === activeTab) ? activeTab : 'output';

  const cap4k = getFeatureCapability('export_4k', device);
  const capH265 = getFeatureCapability('codec_h265', device);
  const capAv1 = getFeatureCapability('codec_av1', device);
  const capBlur = getFeatureCapability('blur_background', device);
  const capReverse = getFeatureCapability('reverse_long_video', device);
  const limits = DEVICE_LIMITS[device.tier];

  const outDims = computeOutputDimensions(metadata, config);
  const containerSpec = CONTAINER_SPECS[config.container];

  return (
    <section className="panel" aria-label="Editing Settings">
      {/* Tab Navigation */}
      <div className="tabs-bar" role="tablist" aria-label="Tool categories">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={safeTab === tab.id}
            className={`tab-btn ${safeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Auto-adjustment warnings */}
      {compatNoticeKeys.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {compatNoticeKeys.map((k, idx) => (
            <div key={idx} className="alert-banner alert-info" role="status">
              <span>{t(k as TranslationKey)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
        {/* ================================================================
            TAB 1: OUTPUT FORMAT, CODEC & COMPRESSION
           ================================================================ */}
        {safeTab === 'output' && (
          <>
            <div className="field-group">
              <span className="field-label">{t('output.taskType')}</span>
              <div className="segmented" style={{ width: '100%' }}>
                {!isAudioOnly && (
                  <button
                    type="button"
                    style={{ flex: 1 }}
                    className={`segmented-btn ${config.taskType === 'video' ? 'active' : ''}`}
                    onClick={() => updateConfig({ taskType: 'video' })}
                  >
                    {t('output.taskVideo')}
                  </button>
                )}
                <button
                  type="button"
                  style={{ flex: 1 }}
                  className={`segmented-btn ${config.taskType === 'audio-extract' ? 'active' : ''}`}
                  onClick={() => updateConfig({ taskType: 'audio-extract' })}
                >
                  {t('output.taskAudio')}
                </button>
                {!isAudioOnly && (
                  <button
                    type="button"
                    style={{ flex: 1 }}
                    className={`segmented-btn ${config.taskType === 'snapshot' ? 'active' : ''}`}
                    onClick={() => updateConfig({ taskType: 'snapshot' })}
                  >
                    {t('output.taskSnapshot')}
                  </button>
                )}
              </div>
            </div>

            {config.taskType === 'video' && (
              <>
                <div className="field-row">
                  <div className="field-group">
                    <label className="field-label" htmlFor="sel-container">
                      {t('output.container')}
                    </label>
                    <select
                      id="sel-container"
                      className="select-control"
                      value={config.container}
                      onChange={(e) =>
                        updateConfig({ container: e.target.value as OutputContainer })
                      }
                    >
                      {Object.values(CONTAINER_SPECS).map((spec) => (
                        <option key={spec.id} value={spec.id}>
                          {spec.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field-group">
                    <label className="field-label" htmlFor="sel-vcodec">
                      {t('output.videoCodec')}
                    </label>
                    <select
                      id="sel-vcodec"
                      className="select-control"
                      value={config.videoCodec}
                      onChange={(e) => updateConfig({ videoCodec: e.target.value as VideoCodec })}
                    >
                      <option value="h264" disabled={!containerSpec.allowedVideoCodecs.includes('h264')}>
                        H.264 (libx264)
                      </option>
                      <option
                        value="h265"
                        disabled={
                          !containerSpec.allowedVideoCodecs.includes('h265') ||
                          capH265.status === 'disabled'
                        }
                      >
                        H.265 / HEVC (libx265)
                      </option>
                      <option value="vp9" disabled={!containerSpec.allowedVideoCodecs.includes('vp9')}>
                        VP9 (libvpx-vp9)
                      </option>
                      <option value="av1" disabled={capAv1.status === 'disabled'}>
                        AV1 ({lang === 'ja' ? '非対応' : 'Unavailable'})
                      </option>
                      <option value="copy">{t('output.codecCopy')}</option>
                    </select>
                  </div>
                </div>

                {/* Device/Core Codec Reason Notes */}
                {capH265.status !== 'supported' && capH265.reasonKey && (
                  <p className="field-hint">
                    H.265: {t(capH265.reasonKey as TranslationKey, { mem: device.deviceMemoryGB })}
                  </p>
                )}
                {capAv1.reasonKey && (
                  <p className="field-hint">
                    AV1: {t(capAv1.reasonKey as TranslationKey)}
                  </p>
                )}

                <div className="field-row">
                  <div className="field-group">
                    <label className="field-label" htmlFor="sel-acodec">
                      {t('output.audioCodec')}
                    </label>
                    <select
                      id="sel-acodec"
                      className="select-control"
                      value={config.audioCodec}
                      onChange={(e) => updateConfig({ audioCodec: e.target.value as AudioCodec })}
                    >
                      <option value="aac" disabled={!containerSpec.allowedAudioCodecs.includes('aac')}>
                        AAC
                      </option>
                      <option value="mp3" disabled={!containerSpec.allowedAudioCodecs.includes('mp3')}>
                        MP3
                      </option>
                      <option value="opus" disabled={!containerSpec.allowedAudioCodecs.includes('opus')}>
                        Opus
                      </option>
                      <option value="copy">{t('output.codecCopy')}</option>
                    </select>
                  </div>

                  <div className="field-group">
                    <label className="field-label" htmlFor="sel-abitrate">
                      {t('output.audioBitrate')}
                    </label>
                    <select
                      id="sel-abitrate"
                      className="select-control mono"
                      value={config.audioBitrateKbps}
                      disabled={config.audioCodec === 'copy' || config.muteMode === 'all'}
                      onChange={(e) => updateConfig({ audioBitrateKbps: Number(e.target.value) })}
                    >
                      {[64, 96, 128, 192, 256, 320].map((kbps) => (
                        <option key={kbps} value={kbps}>
                          {kbps} kbps
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Compression Presets */}
                <div className="field-group">
                  <span className="field-label">{t('output.compression')}</span>
                  <div className="preset-grid">
                    {(Object.keys(COMPRESSION_PRESETS) as CompressionPreset[]).map((presetId) => {
                      const spec = COMPRESSION_PRESETS[presetId];
                      return (
                        <button
                          key={presetId}
                          type="button"
                          className={`preset-card ${
                            !config.useCustomCrf && config.compressionPreset === presetId ? 'active' : ''
                          }`}
                          onClick={() =>
                            updateConfig({
                              compressionPreset: presetId,
                              useCustomCrf: false,
                              audioBitrateKbps: spec.audioBitrateKbps,
                            })
                          }
                        >
                          <span className="preset-card-title">
                            {t(spec.labelKey as TranslationKey)}
                          </span>
                          <span className="preset-card-desc">
                            {t(spec.descKey as TranslationKey)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom CRF */}
                <div className="field-group">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={config.useCustomCrf}
                      onChange={(e) => updateConfig({ useCustomCrf: e.target.checked })}
                    />
                    <span>{t('output.customCrf')}</span>
                  </label>
                  {config.useCustomCrf && (
                    <>
                      <div className="field-label">
                        <span>CRF</span>
                        <span className="mono">{config.customCrf}</span>
                      </div>
                      <input
                        type="range"
                        min={16}
                        max={40}
                        step={1}
                        className="range-control"
                        value={config.customCrf}
                        onChange={(e) => updateConfig({ customCrf: Number(e.target.value) })}
                      />
                      <p className="field-hint">{t('output.crfHint')}</p>
                    </>
                  )}
                </div>
              </>
            )}

            {/* Strip Metadata */}
            <div className="field-group">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={config.stripMetadata}
                  onChange={(e) => updateConfig({ stripMetadata: e.target.checked })}
                />
                <span>{t('output.stripMetadata')}</span>
              </label>
              <p className="field-hint">{t('output.stripMetadataHint')}</p>
            </div>
          </>
        )}

        {/* ================================================================
            TAB 2: TRIM / CUT
           ================================================================ */}
        {safeTab === 'trim' && clip && (
          <>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={config.trimEnabled}
                onChange={(e) => updateConfig({ trimEnabled: e.target.checked })}
              />
              <span>{t('timeline.enableTrim')}</span>
            </label>

            <div className="field-row">
              <div className="field-group">
                <label className="field-label" htmlFor="panel-trim-start">
                  {t('timeline.start')} (s)
                </label>
                <input
                  id="panel-trim-start"
                  type="number"
                  min={0}
                  max={Math.max(0, clip.endSec - 0.1)}
                  step={0.1}
                  className="input-control mono"
                  value={Number(clip.startSec.toFixed(2))}
                  onChange={(e) => {
                    updateConfig({ trimEnabled: true });
                    updateTrimRange(Number(e.target.value), clip.endSec);
                  }}
                />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="panel-trim-end">
                  {t('timeline.end')} (s)
                </label>
                <input
                  id="panel-trim-end"
                  type="number"
                  min={clip.startSec + 0.1}
                  max={Number(metadata.durationSec.toFixed(2))}
                  step={0.1}
                  className="input-control mono"
                  value={Number(clip.endSec.toFixed(2))}
                  onChange={(e) => {
                    updateConfig({ trimEnabled: true });
                    updateTrimRange(clip.startSec, Number(e.target.value));
                  }}
                />
              </div>
            </div>

            <div className="field-group">
              <span className="field-label">{t('timeline.cutMode')}</span>
              <div className="preset-grid">
                <button
                  type="button"
                  className={`preset-card ${config.cutMode === 'fast' ? 'active' : ''}`}
                  onClick={() => updateConfig({ cutMode: 'fast', trimEnabled: true })}
                >
                  <span className="preset-card-title">{t('timeline.cutFast')}</span>
                  <span className="preset-card-desc">{t('timeline.cutFastHint')}</span>
                </button>
                <button
                  type="button"
                  className={`preset-card ${config.cutMode === 'accurate' ? 'active' : ''}`}
                  onClick={() => updateConfig({ cutMode: 'accurate', trimEnabled: true })}
                >
                  <span className="preset-card-title">{t('timeline.cutAccurate')}</span>
                  <span className="preset-card-desc">{t('timeline.cutAccurateHint')}</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* ================================================================
            TAB 3: RESIZE & ASPECT RATIO (3 MODES)
           ================================================================ */}
        {safeTab === 'resize' && (
          <>
            <div className="field-group">
              <label className="field-label" htmlFor="sel-res">
                {t('resize.preset')}
              </label>
              <select
                id="sel-res"
                className="select-control"
                value={config.resolutionPreset}
                onChange={(e) =>
                  updateConfig({ resolutionPreset: e.target.value as ResolutionPreset })
                }
              >
                <option value="original">{t('resize.original')}</option>
                {(Object.keys(RESOLUTION_PRESET_HEIGHTS) as Array<keyof typeof RESOLUTION_PRESET_HEIGHTS>).map(
                  (key) => (
                    <option
                      key={key}
                      value={key}
                      disabled={key === '4k' && cap4k.status === 'disabled'}
                    >
                      {RESOLUTION_PRESET_HEIGHTS[key].label}
                      {key === '4k' && cap4k.status === 'disabled'
                        ? lang === 'ja'
                          ? ' (この端末では非対応)'
                          : ' (Unavailable on this device)'
                        : ''}
                    </option>
                  )
                )}
                <option value="scale">{t('resize.scaleOption')}</option>
                <option value="custom">{t('resize.customOption')}</option>
              </select>
              {cap4k.status !== 'supported' && cap4k.reasonKey && (
                <p className="field-hint">
                  4K: {t(cap4k.reasonKey as TranslationKey, { mem: device.deviceMemoryGB })}
                </p>
              )}
            </div>

            {config.resolutionPreset === 'scale' && (
              <div className="field-group">
                <div className="field-label">
                  <span>{t('resize.scalePercent')}</span>
                  <span className="mono">{config.scalePercent}%</span>
                </div>
                <input
                  type="range"
                  min={25}
                  max={400}
                  step={5}
                  className="range-control"
                  value={config.scalePercent}
                  onChange={(e) => updateConfig({ scalePercent: Number(e.target.value) })}
                />
              </div>
            )}

            {config.resolutionPreset === 'custom' && (
              <>
                <div className="field-row">
                  <div className="field-group">
                    <label className="field-label" htmlFor="inp-cw">
                      {t('resize.width')}
                    </label>
                    <input
                      id="inp-cw"
                      type="number"
                      min={64}
                      max={cap4k.status === 'disabled' ? 1920 : 3840}
                      step={2}
                      className="input-control mono"
                      value={config.customWidth}
                      onChange={(e) => updateConfig({ customWidth: Number(e.target.value) || 640 })}
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label" htmlFor="inp-ch">
                      {t('resize.height')}
                    </label>
                    <input
                      id="inp-ch"
                      type="number"
                      min={64}
                      max={cap4k.status === 'disabled' ? 1920 : 2160}
                      step={2}
                      disabled={config.keepAspectRatio}
                      className="input-control mono"
                      value={config.keepAspectRatio ? outDims.height : config.customHeight}
                      onChange={(e) => updateConfig({ customHeight: Number(e.target.value) || 360 })}
                    />
                  </div>
                </div>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={config.keepAspectRatio}
                    onChange={(e) => updateConfig({ keepAspectRatio: e.target.checked })}
                  />
                  <span>{t('resize.keepAspect')}</span>
                </label>
              </>
            )}

            <div className="field-group">
              <label className="field-label" htmlFor="sel-algo">
                {t('resize.algorithm')}
              </label>
              <select
                id="sel-algo"
                className="select-control"
                value={config.scaleAlgorithm}
                onChange={(e) =>
                  updateConfig({ scaleAlgorithm: e.target.value as ScaleAlgorithm })
                }
              >
                <option value="lanczos">Lanczos (シャープ・高品質)</option>
                <option value="bicubic">Bicubic (標準・滑らか)</option>
              </select>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '2px 0' }} />

            {/* Aspect Ratio */}
            <div className="field-group">
              <label className="field-label" htmlFor="sel-aspect">
                {t('aspect.preset')}
              </label>
              <select
                id="sel-aspect"
                className="select-control"
                value={config.aspectPreset}
                onChange={(e) => updateConfig({ aspectPreset: e.target.value as AspectPreset })}
              >
                <option value="original">{t('aspect.original')}</option>
                {(Object.keys(ASPECT_RATIO_PRESETS) as Array<keyof typeof ASPECT_RATIO_PRESETS>).map(
                  (key) => (
                    <option key={key} value={key}>
                      {ASPECT_RATIO_PRESETS[key].label}
                    </option>
                  )
                )}
                <option value="custom">{t('aspect.custom')}</option>
              </select>
            </div>

            {config.aspectPreset === 'custom' && (
              <div className="field-row">
                <div className="field-group">
                  <label className="field-label" htmlFor="inp-aw">
                    W
                  </label>
                  <input
                    id="inp-aw"
                    type="number"
                    min={1}
                    max={100}
                    className="input-control mono"
                    value={config.customAspectW}
                    onChange={(e) => updateConfig({ customAspectW: Number(e.target.value) || 16 })}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="inp-ah">
                    H
                  </label>
                  <input
                    id="inp-ah"
                    type="number"
                    min={1}
                    max={100}
                    className="input-control mono"
                    value={config.customAspectH}
                    onChange={(e) => updateConfig({ customAspectH: Number(e.target.value) || 9 })}
                  />
                </div>
              </div>
            )}

            {config.aspectPreset !== 'original' && (
              <>
                <div className="field-group">
                  <span className="field-label">{t('aspect.mode')}</span>
                  <div className="preset-grid" style={{ gridTemplateColumns: '1fr' }}>
                    {(['stretch', 'letterbox', 'blur'] as AspectMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        className={`preset-card ${config.aspectMode === mode ? 'active' : ''}`}
                        onClick={() => updateConfig({ aspectMode: mode })}
                      >
                        <span className="preset-card-title">
                          {mode === 'stretch'
                            ? t('aspect.modeStretch')
                            : mode === 'letterbox'
                              ? t('aspect.modeLetterbox')
                              : t('aspect.modeBlur')}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {config.aspectMode === 'letterbox' && (
                  <div className="field-group">
                    <label className="field-label" htmlFor="inp-padcolor">
                      <span>{t('aspect.letterboxColor')}</span>
                      <span className="mono">{config.letterboxColor}</span>
                    </label>
                    <input
                      id="inp-padcolor"
                      type="color"
                      className="input-control"
                      style={{ padding: 4, height: 44 }}
                      value={config.letterboxColor}
                      onChange={(e) => updateConfig({ letterboxColor: e.target.value })}
                    />
                  </div>
                )}

                {config.aspectMode === 'blur' && (
                  <>
                    {capBlur.status === 'warn' && capBlur.reasonKey && (
                      <div className="alert-banner alert-warning">
                        <span>{t(capBlur.reasonKey as TranslationKey)}</span>
                      </div>
                    )}
                    <div className="field-group">
                      <div className="field-label">
                        <span>{t('aspect.blurStrength')}</span>
                        <span className="mono">{config.blurStrength}</span>
                      </div>
                      <input
                        type="range"
                        min={5}
                        max={40}
                        step={1}
                        className="range-control"
                        value={config.blurStrength}
                        onChange={(e) => updateConfig({ blurStrength: Number(e.target.value) })}
                      />
                    </div>
                    <div className="field-group">
                      <span className="field-label">{t('aspect.blurBrightness')}</span>
                      <div className="segmented" style={{ width: '100%' }}>
                        <button
                          type="button"
                          style={{ flex: 1 }}
                          className={`segmented-btn ${config.blurBrightness === 'darker' ? 'active' : ''}`}
                          onClick={() => updateConfig({ blurBrightness: 'darker' })}
                        >
                          {t('aspect.blurDarker')}
                        </button>
                        <button
                          type="button"
                          style={{ flex: 1 }}
                          className={`segmented-btn ${config.blurBrightness === 'normal' ? 'active' : ''}`}
                          onClick={() => updateConfig({ blurBrightness: 'normal' })}
                        >
                          {t('aspect.blurNormal')}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            <div className="alert-banner alert-info">
              <span>{t('resize.resultSize')}</span>
              <strong className="mono">
                {outDims.width} × {outDims.height} px
              </strong>
            </div>
          </>
        )}

        {/* ================================================================
            TAB 4: SPEED & REVERSE
           ================================================================ */}
        {safeTab === 'speed' && (
          <>
            <div className="field-group">
              <span className="field-label">{t('speed.presets')}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {SPEED_PRESETS.map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    className={`btn btn-sm mono ${Math.abs(config.speed - spd) < 0.01 ? 'btn-primary' : ''}`}
                    onClick={() => updateConfig({ speed: spd })}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>

            <div className="field-group">
              <div className="field-label">
                <span>{t('speed.custom')}</span>
                <span className="mono">{config.speed.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.25}
                max={4}
                step={0.05}
                className="range-control"
                value={config.speed}
                onChange={(e) => updateConfig({ speed: Number(e.target.value) })}
              />
              <p className="field-hint">{t('speed.pitchNote')}</p>
            </div>

            <div className="field-group">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={config.reverse}
                  onChange={(e) => updateConfig({ reverse: e.target.checked })}
                />
                <span>{t('speed.reverse')}</span>
              </label>
              <p className="field-hint">{t('speed.reverseHint')}</p>
              {config.reverse && capReverse.reasonKey && (
                <div className="alert-banner alert-warning">
                  <span>
                    {t(capReverse.reasonKey as TranslationKey, {
                      sec: limits.maxReverseDurationSec,
                    })}
                  </span>
                </div>
              )}
            </div>
          </>
        )}

        {/* ================================================================
            TAB 5: ROTATE, FLIP & CROP
           ================================================================ */}
        {safeTab === 'transform' && (
          <>
            <div className="field-group">
              <span className="field-label">{t('transform.rotation')}</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {([0, 90, 180, 270] as RotationDegrees[]).map((deg) => (
                  <button
                    key={deg}
                    type="button"
                    className={`btn btn-sm mono ${config.rotation === deg ? 'btn-primary' : ''}`}
                    onClick={() => updateConfig({ rotation: deg })}
                  >
                    {deg}°
                  </button>
                ))}
              </div>
            </div>

            <div className="field-row">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={config.flipHorizontal}
                  onChange={(e) => updateConfig({ flipHorizontal: e.target.checked })}
                />
                <span>{t('transform.flipH')}</span>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={config.flipVertical}
                  onChange={(e) => updateConfig({ flipVertical: e.target.checked })}
                />
                <span>{t('transform.flipV')}</span>
              </label>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '2px 0' }} />

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={config.crop.enabled}
                onChange={(e) => updateConfig({ crop: { ...config.crop, enabled: e.target.checked } })}
              />
              <span>{t('transform.cropEnable')}</span>
            </label>

            {config.crop.enabled && (
              <>
                <div className="field-row">
                  <div className="field-group">
                    <div className="field-label">
                      <span>{t('transform.cropX')}</span>
                      <span className="mono">{config.crop.xPct}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={90}
                      value={config.crop.xPct}
                      className="range-control"
                      onChange={(e) => {
                        const xPct = Number(e.target.value);
                        updateConfig({
                          crop: {
                            ...config.crop,
                            xPct,
                            widthPct: Math.min(config.crop.widthPct, 100 - xPct),
                          },
                        });
                      }}
                    />
                  </div>
                  <div className="field-group">
                    <div className="field-label">
                      <span>{t('transform.cropY')}</span>
                      <span className="mono">{config.crop.yPct}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={90}
                      value={config.crop.yPct}
                      className="range-control"
                      onChange={(e) => {
                        const yPct = Number(e.target.value);
                        updateConfig({
                          crop: {
                            ...config.crop,
                            yPct,
                            heightPct: Math.min(config.crop.heightPct, 100 - yPct),
                          },
                        });
                      }}
                    />
                  </div>
                </div>

                <div className="field-row">
                  <div className="field-group">
                    <div className="field-label">
                      <span>{t('transform.cropW')}</span>
                      <span className="mono">{config.crop.widthPct}%</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={100 - config.crop.xPct}
                      value={config.crop.widthPct}
                      className="range-control"
                      onChange={(e) =>
                        updateConfig({ crop: { ...config.crop, widthPct: Number(e.target.value) } })
                      }
                    />
                  </div>
                  <div className="field-group">
                    <div className="field-label">
                      <span>{t('transform.cropH')}</span>
                      <span className="mono">{config.crop.heightPct}%</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={100 - config.crop.yPct}
                      value={config.crop.heightPct}
                      className="range-control"
                      onChange={(e) =>
                        updateConfig({ crop: { ...config.crop, heightPct: Number(e.target.value) } })
                      }
                    />
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() =>
                    updateConfig({
                      crop: { enabled: true, xPct: 0, yPct: 0, widthPct: 100, heightPct: 100 },
                    })
                  }
                >
                  {t('transform.cropReset')}
                </button>
              </>
            )}
          </>
        )}

        {/* ================================================================
            TAB 6: AUDIO EXTRACTION & MUTE
           ================================================================ */}
        {safeTab === 'audio' && (
          <>
            {!isAudioOnly && (
              <div className="field-group">
                <span className="field-label">{t('audio.muteHeading')}</span>
                <select
                  className="select-control"
                  value={config.muteMode}
                  onChange={(e) => updateConfig({ muteMode: e.target.value as MuteMode })}
                >
                  <option value="none">{t('audio.muteNone')}</option>
                  <option value="all">{t('audio.muteAll')}</option>
                  <option value="range">{t('audio.muteRange')}</option>
                  <option value="removeTrack" disabled={metadata.audioStreams.length <= 1}>
                    {t('audio.muteRemoveTrack')}
                  </option>
                </select>
              </div>
            )}

            {config.muteMode === 'range' && (
              <div className="field-row">
                <div className="field-group">
                  <label className="field-label" htmlFor="mute-s">
                    {t('audio.rangeStart')}
                  </label>
                  <input
                    id="mute-s"
                    type="number"
                    min={0}
                    max={metadata.durationSec}
                    step={0.1}
                    className="input-control mono"
                    value={config.muteRangeStartSec}
                    onChange={(e) =>
                      updateConfig({ muteRangeStartSec: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="mute-e">
                    {t('audio.rangeEnd')}
                  </label>
                  <input
                    id="mute-e"
                    type="number"
                    min={0}
                    max={metadata.durationSec}
                    step={0.1}
                    className="input-control mono"
                    value={config.muteRangeEndSec}
                    onChange={(e) =>
                      updateConfig({ muteRangeEndSec: Math.max(0, Number(e.target.value) || 0) })
                    }
                  />
                </div>
              </div>
            )}

            {config.muteMode === 'removeTrack' && (
              <div className="field-group">
                {metadata.audioStreams.length <= 1 ? (
                  <p className="field-hint">{t('audio.noMultiTrack')}</p>
                ) : (
                  metadata.audioStreams.map((stream) => {
                    const removed = config.removedAudioIndices.includes(stream.audioIndex);
                    return (
                      <label key={stream.audioIndex} className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={removed}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...config.removedAudioIndices, stream.audioIndex]
                              : config.removedAudioIndices.filter((i) => i !== stream.audioIndex);
                            updateConfig({ removedAudioIndices: next });
                          }}
                        />
                        <span className="mono">
                          Track #{stream.audioIndex + 1}: {stream.codec}
                          {stream.language ? ` (${stream.language})` : ''}
                          {stream.title ? ` — ${stream.title}` : ''}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            )}

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '2px 0' }} />

            {/* Audio Extraction Section */}
            <div className="field-group">
              <div className="panel-header" style={{ marginBottom: 4 }}>
                <span className="field-label">{t('audio.extractHeading')}</span>
                {config.taskType !== 'audio-extract' && (
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => updateConfig({ taskType: 'audio-extract' })}
                  >
                    {t('audio.extractSwitch')}
                  </button>
                )}
              </div>

              <div className="field-row">
                <div className="field-group">
                  <label className="field-label" htmlFor="sel-aext">
                    {t('audio.extractFormat')}
                  </label>
                  <select
                    id="sel-aext"
                    className="select-control"
                    value={config.audioExtractFormat}
                    onChange={(e) => {
                      const fmt = e.target.value as AudioExtractFormat;
                      updateConfig({
                        taskType: 'audio-extract',
                        audioExtractFormat: fmt,
                        audioExtractBitrateKbps: AUDIO_EXTRACT_SPECS[fmt].defaultBitrateKbps,
                      });
                    }}
                  >
                    {Object.values(AUDIO_EXTRACT_SPECS).map((spec) => (
                      <option key={spec.id} value={spec.id}>
                        {spec.label}
                      </option>
                    ))}
                  </select>
                </div>

                {AUDIO_EXTRACT_SPECS[config.audioExtractFormat].supportsBitrate && (
                  <div className="field-group">
                    <label className="field-label" htmlFor="sel-aext-br">
                      {t('audio.extractBitrate')}
                    </label>
                    <select
                      id="sel-aext-br"
                      className="select-control mono"
                      value={config.audioExtractBitrateKbps}
                      onChange={(e) =>
                        updateConfig({
                          taskType: 'audio-extract',
                          audioExtractBitrateKbps: Number(e.target.value),
                        })
                      }
                    >
                      {[96, 128, 192, 256, 320].map((kbps) => (
                        <option key={kbps} value={kbps}>
                          {kbps} kbps
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {metadata.audioStreams.length > 0 && (
                <div className="field-group">
                  <label className="field-label" htmlFor="sel-atrack">
                    {t('audio.extractTrack')}
                  </label>
                  <select
                    id="sel-atrack"
                    className="select-control"
                    value={config.audioExtractTrackIndex}
                    onChange={(e) =>
                      updateConfig({
                        taskType: 'audio-extract',
                        audioExtractTrackIndex: Number(e.target.value),
                      })
                    }
                  >
                    {metadata.audioStreams.map((stream) => (
                      <option key={stream.audioIndex} value={stream.audioIndex}>
                        Track #{stream.audioIndex + 1} · {stream.codec.toUpperCase()}
                        {stream.channelLayout ? ` · ${stream.channelLayout}` : ''}
                        {stream.language ? ` (${stream.language})` : ''}
                        {stream.title ? ` — ${stream.title}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </>
        )}

        {/* ================================================================
            TAB 7: SNAPSHOT EXPORT
           ================================================================ */}
        {safeTab === 'snapshot' && (
          <>
            <div className="panel-header" style={{ marginBottom: 4 }}>
              <span className="field-label">{t('snapshot.heading')}</span>
              {config.taskType !== 'snapshot' && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => updateConfig({ taskType: 'snapshot' })}
                >
                  {t('snapshot.switch')}
                </button>
              )}
            </div>

            <div className="field-row">
              <div className="field-group">
                <label className="field-label" htmlFor="sel-snapfmt">
                  {t('snapshot.format')}
                </label>
                <select
                  id="sel-snapfmt"
                  className="select-control"
                  value={config.snapshotFormat}
                  onChange={(e) =>
                    updateConfig({
                      taskType: 'snapshot',
                      snapshotFormat: e.target.value as 'png' | 'jpeg',
                    })
                  }
                >
                  <option value="png">PNG (ロスレス)</option>
                  <option value="jpeg">JPEG (軽量)</option>
                </select>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="inp-snaptime">
                  {t('snapshot.time')}
                </label>
                <input
                  id="inp-snaptime"
                  type="number"
                  min={0}
                  max={Number(metadata.durationSec.toFixed(2))}
                  step={0.05}
                  className="input-control mono"
                  value={config.snapshotTimeSec}
                  onChange={(e) =>
                    updateConfig({
                      taskType: 'snapshot',
                      snapshotTimeSec: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                />
              </div>
            </div>

            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                updateConfig({
                  taskType: 'snapshot',
                  snapshotTimeSec: Number(currentTime.toFixed(2)),
                })
              }
            >
              {t('snapshot.useCurrent')} ({currentTime.toFixed(2)}s)
            </button>

            {config.snapshotFormat === 'jpeg' && (
              <div className="field-group">
                <div className="field-label">
                  <span>{t('snapshot.jpegQuality')}</span>
                  <span className="mono">{config.snapshotQuality}</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={12}
                  step={1}
                  className="range-control"
                  value={config.snapshotQuality}
                  onChange={(e) =>
                    updateConfig({
                      taskType: 'snapshot',
                      snapshotQuality: Number(e.target.value),
                    })
                  }
                />
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
