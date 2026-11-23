import { useEffect, useRef, useState } from 'react';
import { translate, type TranslationKey } from '../../i18n';
import {
  buildSrtContent,
  detectVoiceSegmentsOffline,
  LiveSpeechCaptioner,
} from '../../services/autoSubtitleService';
import { saveExportedBlob } from '../../services/exportService';
import { usePlaybackStore } from '../../store/usePlaybackStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useUiStore } from '../../store/useUiStore';
import { formatTimecode } from '../../utils/formatters';

export function AutoSubtitlePanel() {
  const { lang, device, showToast } = useUiStore();
  const {
    source,
    subtitleCues,
    setSubtitleCues,
    addSubtitleCue,
    updateSubtitleCue,
    removeSubtitleCue,
    applyCuesToSubtitleFile,
  } = useProjectStore();
  const { currentTime, requestSeek } = usePlaybackStore();

  const [vadRunning, setVadRunning] = useState(false);
  const [speechActive, setSpeechActive] = useState(false);
  const [speechLang, setSpeechLang] = useState<'ja-JP' | 'en-US'>(lang === 'ja' ? 'ja-JP' : 'en-US');
  const [interimText, setInterimText] = useState('');
  const captionerRef = useRef<LiveSpeechCaptioner | null>(null);

  const t = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(lang, key, params);

  useEffect(() => {
    return () => {
      captionerRef.current?.stop();
    };
  }, []);

  if (!source) return null;

  const handleRunVad = async () => {
    setVadRunning(true);
    try {
      const cues = await detectVoiceSegmentsOffline(source.file, {
        placeholderPrefix: lang === 'ja' ? '字幕' : 'Caption',
      });
      setSubtitleCues(cues);
      showToast(`${cues.length} 件の音声区間を検出しました`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    } finally {
      setVadRunning(false);
    }
  };

  const handleToggleSpeech = () => {
    if (speechActive) {
      captionerRef.current?.stop();
      setSpeechActive(false);
      setInterimText('');
      return;
    }

    try {
      const cap = new LiveSpeechCaptioner();
      captionerRef.current = cap;
      cap.start({
        lang: speechLang,
        getCurrentTimeSec: () => usePlaybackStore.getState().currentTime,
        onCue: (cue) => addSubtitleCue(cue),
        onInterim: (txt) => setInterimText(txt),
        onError: (msg) => {
          setSpeechActive(false);
          showToast(msg);
        },
        onStop: () => {
          setSpeechActive(false);
          setInterimText('');
        },
      });
      setSpeechActive(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  const handleApply = (mode: 'embedExternal' | 'burnIn') => {
    const file = applyCuesToSubtitleFile(mode);
    if (file) {
      showToast(t('autosub.appliedToast', { count: subtitleCues.length }));
    }
  };

  const handleDownloadSrt = async () => {
    if (subtitleCues.length === 0) return;
    const srtText = buildSrtContent(subtitleCues);
    const blob = new Blob([srtText], { type: 'text/plain;charset=utf-8' });
    await saveExportedBlob(blob, 'auto_subtitles.srt', device, false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <span className="field-label">{t('autosub.heading')}</span>

      {/* Offline VAD */}
      <div
        style={{
          background: 'var(--bg-surface-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={vadRunning}
          onClick={() => void handleRunVad()}
        >
          {vadRunning ? t('autosub.vadRunning') : t('autosub.vadBtn')}
        </button>
        <p className="field-hint">{t('autosub.vadHint')}</p>
      </div>

      {/* Live Web Speech API */}
      <div
        style={{
          background: 'var(--bg-surface-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            className="select-control"
            style={{ width: 'auto', minWidth: 130 }}
            value={speechLang}
            onChange={(e) => setSpeechLang(e.target.value as 'ja-JP' | 'en-US')}
            aria-label={t('autosub.speechLang')}
          >
            <option value="ja-JP">日本語 (ja-JP)</option>
            <option value="en-US">English (en-US)</option>
          </select>
          <button
            type="button"
            className={`btn btn-sm ${speechActive ? 'btn-danger' : ''}`}
            disabled={!device.supportsSpeechRecognition}
            onClick={handleToggleSpeech}
          >
            {speechActive ? t('autosub.speechStop') : t('autosub.speechStart')}
          </button>
        </div>
        {interimText && (
          <div className="alert-banner alert-info">
            <span>{interimText}</span>
          </div>
        )}
        <p className="field-hint">{t('autosub.speechHint')}</p>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() =>
            addSubtitleCue({
              id: `man-${Date.now()}`,
              startSec: Number(currentTime.toFixed(2)),
              endSec: Number(Math.min(source.metadata.durationSec || currentTime + 3, currentTime + 3).toFixed(2)),
              text: '',
            })
          }
        >
          {t('autosub.addManual')}
        </button>

        {subtitleCues.length > 0 && (
          <>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => handleApply('embedExternal')}
            >
              {t('autosub.applyEmbed')}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => handleApply('burnIn')}
            >
              {t('autosub.applyBurnIn')}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void handleDownloadSrt()}
            >
              {t('autosub.downloadSrt')}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => setSubtitleCues([])}
            >
              {t('autosub.clearAll')}
            </button>
          </>
        )}
      </div>

      {/* Editable Cue List */}
      {subtitleCues.length === 0 ? (
        <div className="alert-banner">
          <span>{t('autosub.empty')}</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
          {subtitleCues.map((cue, idx) => (
            <div
              key={cue.id}
              style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-sm mono"
                  style={{ minHeight: 28, padding: '2px 8px', fontSize: '0.72rem' }}
                  onClick={() => requestSeek(cue.startSec)}
                >
                  #{idx + 1} {formatTimecode(cue.startSec, false)}
                </button>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  className="input-control mono"
                  style={{ width: 76, minHeight: 30, padding: '3px 6px', fontSize: '0.76rem' }}
                  value={cue.startSec}
                  onChange={(e) =>
                    updateSubtitleCue(cue.id, { startSec: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
                <span>→</span>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  className="input-control mono"
                  style={{ width: 76, minHeight: 30, padding: '3px 6px', fontSize: '0.76rem' }}
                  value={cue.endSec}
                  onChange={(e) =>
                    updateSubtitleCue(cue.id, {
                      endSec: Math.max(cue.startSec + 0.1, Number(e.target.value) || cue.startSec + 1),
                    })
                  }
                />
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  style={{ minHeight: 28, padding: '2px 8px', marginLeft: 'auto', fontSize: '0.72rem' }}
                  onClick={() => removeSubtitleCue(cue.id)}
                >
                  ✕
                </button>
              </div>
              <input
                type="text"
                className="input-control"
                style={{ minHeight: 34, padding: '5px 8px', fontSize: '0.84rem' }}
                value={cue.text}
                placeholder="字幕テキスト..."
                onChange={(e) => updateSubtitleCue(cue.id, { text: e.target.value })}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
