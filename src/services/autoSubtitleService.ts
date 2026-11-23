import type { SubtitleCue } from '../types/edit';

export function formatSrtTimestamp(sec: number): string {
  const safeMs = Math.max(0, Math.round(sec * 1000));
  const hh = String(Math.floor(safeMs / 3_600_000)).padStart(2, '0');
  const mm = String(Math.floor((safeMs % 3_600_000) / 60_000)).padStart(2, '0');
  const ss = String(Math.floor((safeMs % 60_000) / 1000)).padStart(2, '0');
  const ms = String(safeMs % 1000).padStart(3, '0');
  return `${hh}:${mm}:${ss},${ms}`;
}

export function buildSrtContent(cues: SubtitleCue[]): string {
  const sorted = [...cues]
    .filter((c) => c.endSec > c.startSec)
    .sort((a, b) => a.startSec - b.startSec);

  return sorted
    .map(
      (cue, idx) =>
        `${idx + 1}\n${formatSrtTimestamp(cue.startSec)} --> ${formatSrtTimestamp(cue.endSec)}\n${cue.text.trim() || '...'}\n`
    )
    .join('\n');
}

export function parseSrtContent(raw: string): SubtitleCue[] {
  const blocks = raw.replace(/\r\n/g, '\n').trim().split(/\n\n+/);
  const cues: SubtitleCue[] = [];

  const toSec = (ts: string): number => {
    const m = ts.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!m) return 0;
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
  };

  blocks.forEach((block, idx) => {
    const lines = block.split('\n').map((l) => l.trim());
    const timeIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeIdx === -1) return;
    const [startRaw, endRaw] = lines[timeIdx].split('-->').map((s) => s.trim());
    const text = lines.slice(timeIdx + 1).join('\n');
    const startSec = toSec(startRaw);
    const endSec = Math.max(startSec + 0.2, toSec(endRaw));
    cues.push({
      id: `cue-${idx + 1}-${Math.round(startSec * 100)}`,
      startSec: Number(startSec.toFixed(2)),
      endSec: Number(endSec.toFixed(2)),
      text,
    });
  });

  return cues;
}

/**
 * 完全オフライン VAD（Voice Activity Detection）で発話区間を自動検出し、タイムスタンプ付き字幕キューを生成する。
 * 音声は一切外部送信せず、Web Audio API の RMS エネルギー解析のみで完結する。
 */
export async function detectVoiceSegmentsOffline(
  file: File,
  options: {
    sensitivity?: number; // 0.5 (low) .. 2.0 (high), default 1.0
    minSpeechSec?: number;
    minSilenceSec?: number;
    placeholderPrefix?: string;
  } = {}
): Promise<SubtitleCue[]> {
  const {
    sensitivity = 1.0,
    minSpeechSec = 0.45,
    minSilenceSec = 0.45,
    placeholderPrefix = '字幕',
  } = options;

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    throw new Error('Web Audio API が利用できません。');
  }

  const ctx = new AudioCtx();
  try {
    const buf = await file.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(buf.slice(0));
    const samples = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const windowSec = 0.05; // 50ms analysis window
    const windowSamples = Math.max(1, Math.floor(sampleRate * windowSec));
    const rmsValues: number[] = [];

    for (let i = 0; i < samples.length; i += windowSamples) {
      const end = Math.min(samples.length, i + windowSamples);
      let sumSq = 0;
      for (let j = i; j < end; j++) {
        sumSq += samples[j] * samples[j];
      }
      rmsValues.push(Math.sqrt(sumSq / Math.max(1, end - i)));
    }

    if (rmsValues.length === 0) return [];

    // Compute adaptive noise floor + threshold
    const sortedRms = [...rmsValues].sort((a, b) => a - b);
    const noiseFloor = sortedRms[Math.floor(sortedRms.length * 0.25)] ?? 0.005;
    const peak95 = sortedRms[Math.floor(sortedRms.length * 0.95)] ?? 0.1;
    const threshold = Math.max(
      0.012,
      (noiseFloor + (peak95 - noiseFloor) * 0.18) / Math.max(0.4, sensitivity)
    );

    const rawSegments: Array<{ start: number; end: number }> = [];
    let inSpeech = false;
    let speechStart = 0;
    let silenceCount = 0;
    const silenceWindowsNeeded = Math.max(1, Math.round(minSilenceSec / windowSec));

    for (let i = 0; i < rmsValues.length; i++) {
      const isActive = rmsValues[i] >= threshold;
      if (isActive) {
        if (!inSpeech) {
          inSpeech = true;
          speechStart = i * windowSec;
        }
        silenceCount = 0;
      } else if (inSpeech) {
        silenceCount++;
        if (silenceCount >= silenceWindowsNeeded) {
          const speechEnd = (i - silenceCount + 1) * windowSec;
          if (speechEnd - speechStart >= minSpeechSec) {
            rawSegments.push({ start: speechStart, end: speechEnd });
          }
          inSpeech = false;
          silenceCount = 0;
        }
      }
    }

    if (inSpeech) {
      const speechEnd = rmsValues.length * windowSec;
      if (speechEnd - speechStart >= minSpeechSec) {
        rawSegments.push({ start: speechStart, end: speechEnd });
      }
    }

    return rawSegments.map((seg, idx) => ({
      id: `vad-${Date.now()}-${idx}`,
      startSec: Number(seg.start.toFixed(2)),
      endSec: Number(seg.end.toFixed(2)),
      text: `${placeholderPrefix} ${idx + 1}`,
    }));
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

/**
 * Web Speech API（SpeechRecognition）を利用したリアルタイム自動文字起こしセッション。
 */
export class LiveSpeechCaptioner {
  private recognition: SpeechRecognitionLike | null = null;
  private active = false;

  start(opts: {
    lang: string;
    getCurrentTimeSec: () => number;
    onCue: (cue: SubtitleCue) => void;
    onInterim?: (text: string) => void;
    onError?: (message: string) => void;
    onStop?: () => void;
  }): void {
    const Ctor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .webkitSpeechRecognition;

    if (!Ctor) {
      throw new Error('このブラウザは Web Speech API 音声認識に対応していません。');
    }

    const rec = new Ctor();
    rec.lang = opts.lang;
    rec.continuous = true;
    rec.interimResults = true;

    let cueStartSec = opts.getCurrentTimeSec();
    let processedCount = 0;

    rec.onresult = (event) => {
      const results = event.results;
      for (let i = processedCount; i < results.length; i++) {
        const res = results[i];
        const transcript = res[0]?.transcript?.trim() || '';
        if (!transcript) continue;
        if (res.isFinal) {
          const endSec = Math.max(cueStartSec + 0.6, opts.getCurrentTimeSec());
          opts.onCue({
            id: `sr-${Date.now()}-${i}`,
            startSec: Number(cueStartSec.toFixed(2)),
            endSec: Number(endSec.toFixed(2)),
            text: transcript,
          });
          processedCount = i + 1;
          cueStartSec = endSec;
          opts.onInterim?.('');
        } else {
          opts.onInterim?.(transcript);
        }
      }
    };

    rec.onerror = (ev) => {
      opts.onError?.(ev.error || 'Speech recognition error');
    };

    rec.onend = () => {
      if (this.active) {
        this.active = false;
        opts.onStop?.();
      }
    };

    this.recognition = rec;
    this.active = true;
    rec.start();
  }

  stop(): void {
    this.active = false;
    try {
      this.recognition?.stop();
    } catch {
      // Ignore
    }
    this.recognition = null;
  }
}
