import { DEVICE_LIMITS, getFeatureCapability } from '../../config/deviceLimits';
import { AUDIO_EXTRACT_SPECS, CONTAINER_SPECS } from '../../config/formats';
import {
  ASPECT_RATIO_PRESETS,
  COMPRESSION_PRESETS,
  RESOLUTION_PRESET_HEIGHTS,
  SPEED_PRESETS,
  USE_CASE_PRESETS,
} from '../../config/presets';
import { computeTargetVideoBitrateKbps } from '../../engine/commandBuilder';
import { buildFullFilterGraph, computeOutputDimensions } from '../../engine/filterGraphBuilder';
import { evaluateParallelChunkEligibility } from '../../engine/parallelEncoder';
import { computePerformanceTuning } from '../../engine/performanceTuner';
import { translate, type TranslationKey } from '../../i18n';
import { useJobStore } from '../../store/useJobStore';
import { usePlaybackStore } from '../../store/usePlaybackStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useUiStore, type ControlTab } from '../../store/useUiStore';
import type {
  AspectMode,
  AspectPreset,
  AudioCodec,
  AudioDenoiseLevel,
  AudioExtractFormat,
  CompressionPreset,
  FpsPreset,
  MuteMode,
  OutputContainer,
  RateControlMode,
  ResolutionPreset,
  RotationDegrees,
  ScaleAlgorithm,
  SpeedProfile,
  SpeedScope,
  UseCasePresetId,
  VideoCodec,
  VideoDenoiseLevel,
} from '../../types/edit';
import { evaluateWebCodecsEligibility } from '../../services/webCodecsService';
import { AutoSubtitlePanel } from './AutoSubtitlePanel';
import { EffectsPanel } from './EffectsPanel';
import { MultiTrackAudioPanel } from './MultiTrackAudioPanel';

const TABS: { id: ControlTab; labelKey: TranslationKey; videoOnly?: boolean }[] = [
  { id: 'output', labelKey: 'tab.output' },
  { id: 'trim', labelKey: 'tab.trim' },
  { id: 'resize', labelKey: 'tab.resize', videoOnly: true },
  { id: 'speed', labelKey: 'tab.speed' },
  { id: 'transform', labelKey: 'tab.transform', videoOnly: true },
  { id: 'effects', labelKey: 'tab.effects', videoOnly: true },
  { id: 'autosub', labelKey: 'tab.autosub' },
  { id: 'audio', labelKey: 'tab.audio' },
  { id: 'multitrack', labelKey: 'tab.multitrack', videoOnly: true },
  { id: 'compat', labelKey: 'tab.compat', videoOnly: true },
  { id: 'snapshot', labelKey: 'tab.snapshot', videoOnly: true },
];

export function SettingsPanels({ hideTabBar = false }: { hideTabBar?: boolean } = {}) {
  const { lang, device, activeTab, setActiveTab } = useUiStore();
  const { wasmMode } = useJobStore();
  const {
    source,
    clips,
    selectedClipId,
    audioTracks,
    config,
    compatNoticeKeys,
    updateConfig,
    updateTrimRange,
  } = useProjectStore();
  const { currentTime } = usePlaybackStore();

  const t = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(lang, key, params);

  if (!source) return null;

  const { metadata } = source;
  const activeClip = clips.find((c) => c.id === selectedClipId) ?? clips[0];
  const isAudioOnly = metadata.isAudioOnly;
  const visibleTabs = TABS.filter((tab) => !(isAudioOnly && tab.videoOnly));
  const safeTab = visibleTabs.some((tab) => tab.id === activeTab) ? activeTab : 'output';

  const cap4k = getFeatureCapability('export_4k', device);
  const capTwoPass = getFeatureCapability('two_pass', device);
  const capH265 = getFeatureCapability('codec_h265', device);
  const capAv1 = getFeatureCapability('codec_av1', device);
  const capBlur = getFeatureCapability('blur_background', device);
  const capReverse = getFeatureCapability('reverse_long_video', device);
  const limits = DEVICE_LIMITS[device.tier];

  const outDims = computeOutputDimensions(metadata, config);
  const containerSpec = CONTAINER_SPECS[config.container];

  const graphSummary = buildFullFilterGraph({
    primaryMetadata: metadata,
    clips,
    selectedClipId,
    audioTracks,
    config,
  });

  const computedTargetKbps =
    config.rateControlMode === 'targetSize'
      ? computeTargetVideoBitrateKbps(
          config.targetSizeMB,
          graphSummary.effectiveDurationSec,
          config.audioBitrateKbps,
          metadata.hasAudio && config.muteMode !== 'all'
        )
      : null;

  const handleUseCaseChange = (presetId: UseCasePresetId) => {
    if (presetId === 'none') {
      updateConfig({ useCasePreset: 'none' });
      return;
    }
    const spec = USE_CASE_PRESETS.find((p) => p.id === presetId);
    if (!spec) return;
    const patch = { ...spec.patch };
    // Auto-enable 2-pass for Discord target size presets on PC/Tablet
    if (patch.rateControlMode === 'targetSize' && capTwoPass.status !== 'disabled') {
      patch.enableTwoPass = true;
    }
    updateConfig(patch);
  };

  const perfTuning = computePerformanceTuning(
    device,
    config.speedProfile,
    wasmMode,
    config.enableParallelChunks
  );
  const parallelCheck = evaluateParallelChunkEligibility(
    metadata,
    config,
    clips,
    audioTracks,
    perfTuning
  );

  return (
    <section className={hideTabBar ? '' : 'panel'} aria-label="Editing Settings">
      {/* Tab Navigation (hidden inside mobile bottom sheet because MobileToolDock handles tabs) */}
      {!hideTabBar && (
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
              {tab.id === 'multitrack' && audioTracks.length > 0 ? ` (${audioTracks.length})` : ''}
            </button>
          ))}
        </div>
      )}

      {/* Auto-adjustment warnings */}
      {compatNoticeKeys.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: hideTabBar ? 0 : 10 }}>
          {compatNoticeKeys.map((k, idx) => (
            <div key={idx} className="alert-banner alert-info" role="status">
              <span>{t(k as TranslationKey)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: hideTabBar ? 4 : 14 }}>
        {/* ================================================================
            TAB 1: OUTPUT FORMAT, USE-CASE PRESETS, CODEC & RATE CONTROL
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
                {/* Platform / Use-Case Presets (YouTube, TikTok, Instagram, X, Discord 10MB/25MB) */}
                <div className="field-group">
                  <label className="field-label" htmlFor="sel-usecase">
                    {t('output.useCaseHeading')}
                  </label>
                  <select
                    id="sel-usecase"
                    className="select-control"
                    value={config.useCasePreset}
                    onChange={(e) => handleUseCaseChange(e.target.value as UseCasePresetId)}
                  >
                    <option value="none">{t('output.useCaseNone')}</option>
                    {USE_CASE_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label} — {lang === 'ja' ? p.descJa : p.descEn}
                      </option>
                    ))}
                  </select>
                </div>

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
                      disabled={Boolean(containerSpec.isAnimatedImage)}
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

                {/* Animated GIF / WebP Controls */}
                {containerSpec.isAnimatedImage && (
                  <div
                    className="field-group"
                    style={{
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      padding: 12,
                    }}
                  >
                    <span className="field-label">{t('anim.heading')}</span>
                    <div className="field-row">
                      <div className="field-group">
                        <label className="field-label" htmlFor="anim-fps">
                          {t('anim.fps')}
                        </label>
                        <input
                          id="anim-fps"
                          type="number"
                          min={5}
                          max={24}
                          step={1}
                          className="input-control mono"
                          value={config.animatedFps}
                          onChange={(e) =>
                            updateConfig({ animatedFps: Math.max(5, Math.min(24, Number(e.target.value) || 12)) })
                          }
                        />
                      </div>
                      <div className="field-group">
                        <label className="field-label" htmlFor="anim-width">
                          {t('anim.maxWidth')}
                        </label>
                        <input
                          id="anim-width"
                          type="number"
                          min={0}
                          max={1280}
                          step={40}
                          className="input-control mono"
                          value={config.animatedWidth}
                          onChange={(e) =>
                            updateConfig({ animatedWidth: Math.max(0, Number(e.target.value) || 0) })
                          }
                        />
                      </div>
                    </div>
                    <div className="field-row">
                      <div className="field-group">
                        <label className="field-label" htmlFor="anim-loop">
                          {t('anim.loop')}
                        </label>
                        <input
                          id="anim-loop"
                          type="number"
                          min={0}
                          max={100}
                          className="input-control mono"
                          value={config.animatedLoop}
                          onChange={(e) =>
                            updateConfig({ animatedLoop: Math.max(0, Number(e.target.value) || 0) })
                          }
                        />
                      </div>
                      {config.container === 'webp' && (
                        <div className="field-group">
                          <label className="field-label" htmlFor="anim-webpq">
                            {t('anim.webpQuality')}
                          </label>
                          <input
                            id="anim-webpq"
                            type="number"
                            min={30}
                            max={95}
                            className="input-control mono"
                            value={config.webpQuality}
                            onChange={(e) =>
                              updateConfig({
                                webpQuality: Math.max(30, Math.min(95, Number(e.target.value) || 75)),
                              })
                            }
                          />
                        </div>
                      )}
                    </div>
                    <p className="field-hint">{t('anim.hint')}</p>
                  </div>
                )}

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

                {/* Rate Control Mode Switcher */}
                <div className="field-group">
                  <span className="field-label">{t('output.rateModeHeading')}</span>
                  <div className="segmented" style={{ width: '100%' }}>
                    {(
                      [
                        ['preset', 'output.ratePreset'],
                        ['crf', 'output.rateCrf'],
                        ['bitrate', 'output.rateBitrate'],
                        ['targetSize', 'output.rateTargetSize'],
                      ] as Array<[RateControlMode, TranslationKey]>
                    ).map(([mode, labelKey]) => (
                      <button
                        key={mode}
                        type="button"
                        style={{ flex: 1, padding: '6px 6px' }}
                        className={`segmented-btn ${config.rateControlMode === mode ? 'active' : ''}`}
                        onClick={() =>
                          updateConfig({
                            rateControlMode: mode,
                            useCustomCrf: mode === 'crf',
                          })
                        }
                      >
                        {t(labelKey)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mode 1: Preset */}
                {config.rateControlMode === 'preset' && (
                  <div className="preset-grid">
                    {(Object.keys(COMPRESSION_PRESETS) as CompressionPreset[]).map((presetId) => {
                      const spec = COMPRESSION_PRESETS[presetId];
                      return (
                        <button
                          key={presetId}
                          type="button"
                          className={`preset-card ${
                            config.compressionPreset === presetId ? 'active' : ''
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
                )}

                {/* Mode 2: CRF */}
                {config.rateControlMode === 'crf' && (
                  <div className="field-group">
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
                      onChange={(e) =>
                        updateConfig({ customCrf: Number(e.target.value), useCustomCrf: true })
                      }
                    />
                    <p className="field-hint">{t('output.crfHint')}</p>
                  </div>
                )}

                {/* Mode 3: Video Bitrate */}
                {config.rateControlMode === 'bitrate' && (
                  <div className="field-group">
                    <label className="field-label" htmlFor="inp-vbitrate">
                      <span>{t('output.targetBitrateKbps')}</span>
                      <span className="mono">{config.targetVideoBitrateKbps} kbps</span>
                    </label>
                    <input
                      id="inp-vbitrate"
                      type="number"
                      min={150}
                      max={30000}
                      step={100}
                      className="input-control mono"
                      value={config.targetVideoBitrateKbps}
                      onChange={(e) =>
                        updateConfig({
                          targetVideoBitrateKbps: Math.max(150, Number(e.target.value) || 1000),
                        })
                      }
                    />
                  </div>
                )}

                {/* Mode 4: Target File Size (e.g. Discord 10MB / 25MB) */}
                {config.rateControlMode === 'targetSize' && (
                  <div className="field-group">
                    <label className="field-label" htmlFor="inp-targetmb">
                      <span>{t('output.targetSizeMB')}</span>
                      <span className="mono">{config.targetSizeMB} MB</span>
                    </label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {[8, 9.5, 24, 50, 100].map((mb) => (
                        <button
                          key={mb}
                          type="button"
                          className={`btn btn-sm mono ${Math.abs(config.targetSizeMB - mb) < 0.05 ? 'btn-primary' : ''}`}
                          onClick={() => updateConfig({ targetSizeMB: mb })}
                        >
                          {mb} MB
                        </button>
                      ))}
                    </div>
                    <input
                      id="inp-targetmb"
                      type="number"
                      min={1}
                      max={4000}
                      step={0.5}
                      className="input-control mono"
                      value={config.targetSizeMB}
                      onChange={(e) =>
                        updateConfig({
                          targetSizeMB: Math.max(1, Number(e.target.value) || 10),
                        })
                      }
                    />
                    {computedTargetKbps !== null && (
                      <div className="alert-banner alert-info">
                        <span>{t('output.computedVideoBitrate')}</span>
                        <strong className="mono">{computedTargetKbps} kbps</strong>
                      </div>
                    )}
                  </div>
                )}

                {/* 2-Pass Toggle (for Bitrate / Target Size) */}
                {(config.rateControlMode === 'bitrate' ||
                  config.rateControlMode === 'targetSize') && (
                  <div className="field-group">
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={config.enableTwoPass && capTwoPass.status !== 'disabled'}
                        disabled={capTwoPass.status === 'disabled'}
                        onChange={(e) => updateConfig({ enableTwoPass: e.target.checked })}
                      />
                      <span>{t('output.enableTwoPass')}</span>
                    </label>
                    {capTwoPass.status === 'disabled' && capTwoPass.reasonKey ? (
                      <p className="field-hint">{t(capTwoPass.reasonKey as TranslationKey)}</p>
                    ) : (
                      <p className="field-hint">{t('output.twoPassHint')}</p>
                    )}
                  </div>
                )}
                {/* WebCodecs Hardware Acceleration Toggle */}
                {!containerSpec.isAnimatedImage && (() => {
                  const hwCheck = evaluateWebCodecsEligibility(
                    metadata,
                    config,
                    clips,
                    audioTracks,
                    device.supportsWebCodecs
                  );
                  return (
                    <div
                      className="field-group"
                      style={{
                        background: 'var(--bg-surface-elevated)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        padding: 10,
                      }}
                    >
                      <div className="field-label">
                        <span>{t('hw.heading')}</span>
                        <span className={`pill ${device.supportsWebCodecs ? 'pill-info' : ''}`}>
                          {device.supportsWebCodecs
                            ? t('hw.supportedBadge')
                            : t('hw.unsupportedBadge')}
                        </span>
                      </div>
                      <label className="checkbox-row" style={{ minHeight: 34 }}>
                        <input
                          type="checkbox"
                          checked={config.useWebCodecsHw && device.supportsWebCodecs}
                          disabled={!device.supportsWebCodecs}
                          onChange={(e) => updateConfig({ useWebCodecsHw: e.target.checked })}
                        />
                        <span>{t('hw.enable')}</span>
                      </label>
                      {config.useWebCodecsHw && device.supportsWebCodecs && (
                        <p className="field-hint">
                          {hwCheck.eligible
                            ? t('hw.activeFastPath')
                            : `${t('hw.fallbackPrefix')}${hwCheck.reasonKey ? t(hwCheck.reasonKey as TranslationKey) : ''}`}
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Hardware-Adaptive Speed & Parallel Chunk Worker Tuning */}
                {!containerSpec.isAnimatedImage && (
                  <div
                    className="field-group"
                    style={{
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: 10,
                    }}
                  >
                    <div className="field-label">
                      <span>{t('perf.heading')}</span>
                      <span
                        className={`pill ${
                          parallelCheck.eligible
                            ? 'pill-success'
                            : perfTuning.ffmpegThreads > 1
                              ? 'pill-info'
                              : ''
                        }`}
                      >
                        {perfTuning.badgeLabel}
                      </span>
                    </div>

                    <div className="field-group">
                      <label className="field-label" htmlFor="sel-speed-profile">
                        {t('perf.profile')}
                      </label>
                      <select
                        id="sel-speed-profile"
                        className="select-control"
                        value={config.speedProfile}
                        onChange={(e) =>
                          updateConfig({ speedProfile: e.target.value as SpeedProfile })
                        }
                      >
                        <option value="auto">{t('perf.auto')}</option>
                        <option value="fastest">{t('perf.fastest')}</option>
                        <option value="balanced">{t('perf.balanced')}</option>
                        <option value="quality">{t('perf.quality')}</option>
                      </select>
                    </div>

                    <label className="checkbox-row" style={{ minHeight: 34 }}>
                      <input
                        type="checkbox"
                        checked={config.enableParallelChunks}
                        onChange={(e) =>
                          updateConfig({ enableParallelChunks: e.target.checked })
                        }
                      />
                      <span>{t('perf.parallelChunks')}</span>
                    </label>
                    <p className="field-hint">
                      {perfTuning.parallelWorkers > 1
                        ? t('perf.parallelHint', { workers: perfTuning.parallelWorkers })
                        : t('perf.parallelSingleHint')}
                    </p>
                  </div>
                )}
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
        {safeTab === 'trim' && activeClip && (
          <>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={config.trimEnabled || clips.length > 1}
                disabled={clips.length > 1}
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
                  max={Math.max(0, activeClip.endSec - 0.1)}
                  step={0.1}
                  className="input-control mono"
                  value={Number(activeClip.startSec.toFixed(2))}
                  onChange={(e) => {
                    updateConfig({ trimEnabled: true });
                    updateTrimRange(Number(e.target.value), activeClip.endSec, activeClip.id);
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
                  min={activeClip.startSec + 0.1}
                  max={Number(metadata.durationSec.toFixed(2))}
                  step={0.1}
                  className="input-control mono"
                  value={Number(activeClip.endSec.toFixed(2))}
                  onChange={(e) => {
                    updateConfig({ trimEnabled: true });
                    updateTrimRange(activeClip.startSec, Number(e.target.value), activeClip.id);
                  }}
                />
              </div>
            </div>

            {clips.length === 1 && (
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
            )}
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
                {(
                  Object.keys(RESOLUTION_PRESET_HEIGHTS) as Array<
                    keyof typeof RESOLUTION_PRESET_HEIGHTS
                  >
                ).map((key) => (
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
                ))}
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
                      onChange={(e) =>
                        updateConfig({ customHeight: Number(e.target.value) || 360 })
                      }
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

            <hr
              style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '2px 0' }}
            />

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
                {(
                  Object.keys(ASPECT_RATIO_PRESETS) as Array<keyof typeof ASPECT_RATIO_PRESETS>
                ).map((key) => (
                  <option key={key} value={key}>
                    {ASPECT_RATIO_PRESETS[key].label}
                  </option>
                ))}
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
              <span className="field-label">{t('speed.scope')}</span>
              <div className="segmented" style={{ width: '100%' }}>
                {(
                  [
                    ['all', 'speed.scopeAll'],
                    ['selectedClip', 'speed.scopeSelected'],
                  ] as Array<[SpeedScope, TranslationKey]>
                ).map(([scope, labelKey]) => (
                  <button
                    key={scope}
                    type="button"
                    style={{ flex: 1 }}
                    className={`segmented-btn ${config.speedScope === scope ? 'active' : ''}`}
                    onClick={() => updateConfig({ speedScope: scope })}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>
            </div>

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

            <hr
              style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '2px 0' }}
            />

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={config.crop.enabled}
                onChange={(e) =>
                  updateConfig({ crop: { ...config.crop, enabled: e.target.checked } })
                }
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
                        updateConfig({
                          crop: { ...config.crop, heightPct: Number(e.target.value) },
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

            <hr
              style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '2px 0' }}
            />

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
            TAB 5.5: EFFECTS, TEXT TELOP, WATERMARK, TRANSITIONS & SUBTITLES
           ================================================================ */}
        {safeTab === 'effects' && <EffectsPanel />}

        {safeTab === 'autosub' && <AutoSubtitlePanel />}

        {/* ================================================================
            TAB 7: MULTI-TRACK AUDIO (BGM / MIC RECORDING / MIX / LOUDNORM)
           ================================================================ */}
        {safeTab === 'multitrack' && <MultiTrackAudioPanel />}

        {/* ================================================================
            TAB 8: FRAME RATE, VFR->CFR, HDR->SDR, DEINTERLACE & DENOISE
           ================================================================ */}
        {safeTab === 'compat' && (
          <>
            <div className="field-group">
              <label className="field-label" htmlFor="sel-fps">
                {t('compat.fpsPreset')}
              </label>
              <select
                id="sel-fps"
                className="select-control"
                value={config.fpsPreset}
                onChange={(e) => updateConfig({ fpsPreset: e.target.value as FpsPreset })}
              >
                <option value="original">{t('compat.fpsOriginal')}</option>
                <option value="24">24 fps (シネマ)</option>
                <option value="25">25 fps (PAL)</option>
                <option value="30">30 fps (標準)</option>
                <option value="60">60 fps (滑らか)</option>
                <option value="custom">{t('compat.fpsCustom')}</option>
              </select>
            </div>

            {config.fpsPreset === 'custom' && (
              <div className="field-group">
                <label className="field-label" htmlFor="inp-cfps">
                  FPS (5–120)
                </label>
                <input
                  id="inp-cfps"
                  type="number"
                  min={5}
                  max={120}
                  step={1}
                  className="input-control mono"
                  value={config.customFps}
                  onChange={(e) => updateConfig({ customFps: Number(e.target.value) || 30 })}
                />
              </div>
            )}

            <div className="field-group">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={config.convertVfrToCfr}
                  onChange={(e) => updateConfig({ convertVfrToCfr: e.target.checked })}
                />
                <span>{t('compat.vfrToCfr')}</span>
              </label>
              <p className="field-hint">{t('compat.vfrToCfrHint')}</p>
            </div>

            <div className="field-group">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={config.convertHdrToSdr}
                  onChange={(e) => updateConfig({ convertHdrToSdr: e.target.checked })}
                />
                <span>{t('compat.hdrToSdr')}</span>
              </label>
              <p className="field-hint">{t('compat.hdrToSdrHint')}</p>
            </div>

            <div className="field-group">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={config.deinterlace}
                  onChange={(e) => updateConfig({ deinterlace: e.target.checked })}
                />
                <span>{t('compat.deinterlace')}</span>
              </label>
              <p className="field-hint">{t('compat.deinterlaceHint')}</p>
            </div>

            <div className="field-row">
              <div className="field-group">
                <label className="field-label" htmlFor="sel-vdenoise">
                  {t('compat.videoDenoise')}
                </label>
                <select
                  id="sel-vdenoise"
                  className="select-control"
                  value={config.videoDenoise}
                  onChange={(e) =>
                    updateConfig({ videoDenoise: e.target.value as VideoDenoiseLevel })
                  }
                >
                  <option value="none">{t('compat.denoiseNone')}</option>
                  <option value="light">{t('compat.denoiseLight')}</option>
                  <option value="medium">{t('compat.denoiseMedium')}</option>
                  <option value="strong">{t('compat.denoiseStrong')}</option>
                </select>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="sel-adenoise">
                  {t('compat.audioDenoise')}
                </label>
                <select
                  id="sel-adenoise"
                  className="select-control"
                  value={config.audioDenoise}
                  onChange={(e) =>
                    updateConfig({ audioDenoise: e.target.value as AudioDenoiseLevel })
                  }
                >
                  <option value="none">{t('compat.denoiseNone')}</option>
                  <option value="light">{t('compat.denoiseLight')}</option>
                  <option value="strong">{t('compat.denoiseStrong')}</option>
                </select>
              </div>
            </div>
          </>
        )}

        {/* ================================================================
            TAB 9: SNAPSHOT EXPORT
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
