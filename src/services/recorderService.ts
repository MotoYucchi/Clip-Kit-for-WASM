export interface RecordingResult {
  file: File;
  durationSec: number;
  mimeType: string;
}

const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

function pickSupportedMimeType(): string {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return '';
  }
  for (const mime of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return '';
}

function extensionForMime(mime: string): string {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

/**
 * ブラウザのマイクから録音する MediaRecorder ラッパー。
 * 録音フォーマットはブラウザ依存（WebM/MP4/Ogg 等）だが、書き出し時に FFmpeg.wasm が統一変換する。
 */
export class MicRecorderSession {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      throw new Error('このブラウザではマイク録音（MediaRecorder）に対応していません。');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = pickSupportedMimeType();
    this.chunks = [];
    this.recorder = mimeType
      ? new MediaRecorder(this.stream, { mimeType })
      : new MediaRecorder(this.stream);

    this.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    this.startedAt = performance.now();
    this.recorder.start(250);
  }

  stop(): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      const recorder = this.recorder;
      if (!recorder || recorder.state === 'inactive') {
        this.cleanup();
        reject(new Error('録音が開始されていません。'));
        return;
      }

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const ext = extensionForMime(mimeType);
        const blob = new Blob(this.chunks, { type: mimeType });
        const durationSec = Math.max(0.2, (performance.now() - this.startedAt) / 1000);
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(11, 19);
        const file = new File([blob], `mic_${stamp}.${ext}`, { type: mimeType });
        this.cleanup();
        resolve({ file, durationSec, mimeType });
      };

      recorder.onerror = () => {
        this.cleanup();
        reject(new Error('録音中にエラーが発生しました。'));
      };

      recorder.stop();
    });
  }

  cancel(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
    }
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
  }
}
