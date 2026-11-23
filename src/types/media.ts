export interface AudioStreamInfo {
  /** Global stream index in container (e.g. 1) */
  streamIndex: number;
  /** Audio-relative stream index (0:a:0 -> 0, 0:a:1 -> 1) */
  audioIndex: number;
  codec: string;
  sampleRate: number | null;
  channels: number | null;
  channelLayout: string | null;
  bitrateKbps: number | null;
  language: string | null;
  title: string | null;
}

export interface MediaMetadata {
  fileName: string;
  fileSize: number;
  mimeType: string;
  container: string;
  durationSec: number;
  bitrateKbps: number | null;
  hasVideo: boolean;
  hasAudio: boolean;
  isAudioOnly: boolean;
  /** Raw coded width before rotation metadata */
  codedWidth: number;
  /** Raw coded height before rotation metadata */
  codedHeight: number;
  /** Display width after applying rotation metadata */
  width: number;
  /** Display height after applying rotation metadata */
  height: number;
  fps: number | null;
  isVfrSuspected: boolean;
  videoCodec: string | null;
  pixelFormat: string | null;
  /** Clockwise rotation metadata from phone videos (0, 90, 180, 270) */
  rotation: 0 | 90 | 180 | 270;
  isHdr: boolean;
  colorTransfer: string | null;
  colorPrimaries: string | null;
  audioStreams: AudioStreamInfo[];
  /** Whether the browser <video> element can decode this video directly */
  canBrowserPlay: boolean;
  probeSource: 'ffmpeg' | 'browser' | 'hybrid';
}

export interface MediaSourceItem {
  id: string;
  file: File;
  objectUrl: string;
  metadata: MediaMetadata;
  addedAt: number;
}
