import { useEffect, useRef, useState } from 'react';
import { getFeatureCapability } from '../../config/deviceLimits';
import { translate, type TranslationKey } from '../../i18n';
import { MicRecorderSession } from '../../services/recorderService';
import { extractWaveformPeaks } from '../../services/waveformService';
import { usePlaybackStore } from '../../store/usePlaybackStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useUiStore } from '../../store/useUiStore';
import type {
  AudioOverlayTrack,
  AudioTrackOutputMode,
  OriginalAudioHandling,
} from '../../types/edit';
import { WaveformBar } from '../timeline/WaveformBar';

const MOBILE_MAX_OVERLAY_TRACKS = 2;

export function MultiTrackAudioPanel() {
  const { lang, device, showToast } = useUiStore();
  const {
    source,
    config,
    audioTracks,
    updateConfig,
    addAudioTrack,
    updateAudioTrack,
    removeAudioTrack,
  } = useProjectStore();
  const { currentTime } = usePlaybackStore();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MicRecorderSession | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);

  const t = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(lang, key, params);

  useEffect(() => {
    if (!isRecording) return;
    const id = window.setInterval(() => setRecordSec((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [isRecording]);

  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
    };
  }, []);

  if (!source) return null;

  const heavyAudioCap = getFeatureCapability('multi_track_audio_heavy', device);
  const reachedMobileLimit =
    heavyAudioCap.status === 'disabled' && audioTracks.length >= MOBILE_MAX_OVERLAY_TRACKS;

  const createTrackFromFile = async (file: File, isMicRecording: boolean, fallbackDur = 0) => {
    const objectUrl = URL.createObjectURL(file);
    const { peaks, durationSec } = await extractWaveformPeaks(file, 96);
    const dur = durationSec && durationSec > 0 ? durationSec : Math.max(1, fallbackDur || 10);

    const track: AudioOverlayTrack = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: file.name,
      file,
      objectUrl,
      durationSec: Number(dur.toFixed(2)),
      isMicRecording,
      volume: 1,
      offsetSec: Number(currentTime.toFixed(2)),
      trimStartSec: 0,
      trimEndSec: Number(dur.toFixed(2)),
      fadeInSec: 0,
      fadeOutSec: 0,
      loop: false,
      muted: false,
      waveformPeaks: peaks,
    };

    addAudioTrack(track);
    if (config.taskType !== 'video') {
      updateConfig({ taskType: 'video' });
    }
    showToast(`+ ${file.name}`);
  };

  const handleAudioFilesPicked = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      if (
        heavyAudioCap.status === 'disabled' &&
        audioTracks.length + i >= MOBILE_MAX_OVERLAY_TRACKS
      ) {
        showToast(t('mt.mobileLimitWarn'));
        break;
      }
      await createTrackFromFile(files[i], false);
    }
  };

  const handleToggleMicRecord = async () => {
    if (isRecording) {
      try {
        const res = await recorderRef.current?.stop();
        setIsRecording(false);
        setRecordSec(0);
        if (res) {
          await createTrackFromFile(res.file, true, res.durationSec);
        }
      } catch (err) {
        setIsRecording(false);
        setRecordSec(0);
        showToast(err instanceof Error ? err.message : String(err));
      }
      return;
    }

    if (reachedMobileLimit) {
      showToast(t('mt.mobileLimitWarn'));
      return;
    }

    try {
      const session = new MicRecorderSession();
      recorderRef.current = session;
      await session.start();
      setRecordSec(0);
      setIsRecording(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('mt.micUnsupported'));
    }
  };

  const supportsSeparateTracks = config.container === 'mp4' || config.container === 'mkv';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <span className="field-label">{t('mt.heading')}</span>
      </div>

      {/* Add Audio / Mic Record Toolbar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg,.opus,.aac"
          multiple
          className="sr-only"
          onChange={(e) => {
            void handleAudioFilesPicked(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={reachedMobileLimit}
          onClick={() => fileInputRef.current?.click()}
        >
          {t('mt.addAudioFile')}
        </button>

        <button
          type="button"
          className={`btn btn-sm ${isRecording ? 'btn-danger' : ''}`}
          disabled={!device.supportsMediaRecorder || (!isRecording && reachedMobileLimit)}
          onClick={() => void handleToggleMicRecord()}
        >
          {isRecording
            ? `${t('mt.stopMic')} (${recordSec}s)`
            : t('mt.recordMic')}
        </button>
      </div>

      {!device.supportsMediaRecorder && (
        <p className="field-hint">{t('mt.micUnsupported')}</p>
      )}
      {reachedMobileLimit && (
        <div className="alert-banner alert-warning">
          <span>{t('mt.mobileLimitWarn')}</span>
        </div>
      )}

      {/* Global Multi-Track Options */}
      <div className="field-row">
        <div className="field-group">
          <label className="field-label" htmlFor="sel-orig-handling">
            {t('mt.origAudioHandling')}
          </label>
          <select
            id="sel-orig-handling"
            className="select-control"
            value={config.originalAudioHandling}
            onChange={(e) =>
              updateConfig({
                originalAudioHandling: e.target.value as OriginalAudioHandling,
              })
            }
          >
            <option value="mix">{t('mt.origMix')}</option>
            <option value="keep">{t('mt.origKeep')}</option>
            <option value="replace">{t('mt.origReplace')}</option>
          </select>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="sel-aout-mode">
            {t('mt.outputMode')}
          </label>
          <select
            id="sel-aout-mode"
            className="select-control"
            value={config.audioOutputMode}
            onChange={(e) =>
              updateConfig({
                audioOutputMode: e.target.value as AudioTrackOutputMode,
              })
            }
          >
            <option value="mix">{t('mt.outputMix')}</option>
            <option value="separate" disabled={!supportsSeparateTracks}>
              {t('mt.outputSeparate')}
            </option>
          </select>
        </div>
      </div>

      {config.originalAudioHandling !== 'replace' && source.metadata.hasAudio && (
        <div className="field-group">
          <div className="field-label">
            <span>{t('mt.origVolume')}</span>
            <span className="mono">{Math.round(config.originalAudioVolume * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            className="range-control"
            value={config.originalAudioVolume}
            onChange={(e) => updateConfig({ originalAudioVolume: Number(e.target.value) })}
          />
        </div>
      )}

      <div className="field-group">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={config.enableLoudnorm}
            onChange={(e) => updateConfig({ enableLoudnorm: e.target.checked })}
          />
          <span>{t('mt.loudnorm')}</span>
        </label>
        <p className="field-hint">{t('mt.loudnormHint')}</p>
      </div>

      {/* Added Audio Track Cards */}
      {audioTracks.length === 0 ? (
        <div className="alert-banner">
          <span>{t('mt.emptyTracks')}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {audioTracks.map((track, idx) => (
            <div
              key={track.id}
              style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                opacity: track.muted ? 0.55 : 1,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <strong className="mono" style={{ fontSize: '0.82rem', wordBreak: 'break-all' }}>
                    #{idx + 1} {track.name}
                  </strong>
                  <span className="pill" style={{ marginLeft: 6 }}>
                    {track.isMicRecording ? 'MIC' : 'BGM'} · {track.durationSec.toFixed(1)}s
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => updateAudioTrack(track.id, { muted: !track.muted })}
                  >
                    {t('mt.muteTrack')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => removeAudioTrack(track.id)}
                  >
                    {t('mt.removeTrack')}
                  </button>
                </div>
              </div>

              {track.waveformPeaks.length > 0 && (
                <div
                  style={{
                    background: 'var(--bg-input)',
                    borderRadius: 6,
                    padding: '4px 6px',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <WaveformBar peaks={track.waveformPeaks} color="var(--accent-success)" height={30} />
                </div>
              )}

              <audio src={track.objectUrl} controls style={{ width: '100%', height: 32 }} />

              <div className="field-group">
                <div className="field-label">
                  <span>{t('mt.volume')}</span>
                  <span className="mono">{Math.round(track.volume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  className="range-control"
                  value={track.volume}
                  onChange={(e) =>
                    updateAudioTrack(track.id, { volume: Number(e.target.value) })
                  }
                />
              </div>

              <div className="field-row">
                <div className="field-group">
                  <label className="field-label">{t('mt.offset')}</label>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    className="input-control mono"
                    value={track.offsetSec}
                    onChange={(e) =>
                      updateAudioTrack(track.id, {
                        offsetSec: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">{t('mt.trimStart')}</label>
                  <input
                    type="number"
                    min={0}
                    max={Math.max(0, track.trimEndSec - 0.1)}
                    step={0.1}
                    className="input-control mono"
                    value={track.trimStartSec}
                    onChange={(e) =>
                      updateAudioTrack(track.id, {
                        trimStartSec: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                </div>
              </div>

              <div className="field-row" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                <div className="field-group">
                  <label className="field-label">{t('mt.trimEnd')}</label>
                  <input
                    type="number"
                    min={track.trimStartSec + 0.1}
                    max={track.durationSec}
                    step={0.1}
                    className="input-control mono"
                    value={track.trimEndSec}
                    onChange={(e) =>
                      updateAudioTrack(track.id, {
                        trimEndSec: Math.max(track.trimStartSec + 0.1, Number(e.target.value) || track.durationSec),
                      })
                    }
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">{t('mt.fadeIn')}</label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    step={0.2}
                    className="input-control mono"
                    value={track.fadeInSec}
                    onChange={(e) =>
                      updateAudioTrack(track.id, {
                        fadeInSec: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">{t('mt.fadeOut')}</label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    step={0.2}
                    className="input-control mono"
                    value={track.fadeOutSec}
                    onChange={(e) =>
                      updateAudioTrack(track.id, {
                        fadeOutSec: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                </div>
              </div>

              <label className="checkbox-row" style={{ minHeight: 32 }}>
                <input
                  type="checkbox"
                  checked={track.loop}
                  onChange={(e) => updateAudioTrack(track.id, { loop: e.target.checked })}
                />
                <span>{t('mt.loop')}</span>
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
