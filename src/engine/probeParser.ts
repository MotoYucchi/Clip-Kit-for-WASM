import type { AudioStreamInfo, MediaMetadata } from '../types/media';
import { getExtension } from '../utils/formatters';

function parseDurationToSeconds(raw: string): number {
  const m = raw.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function normalizeRotation(deg: number): 0 | 90 | 180 | 270 {
  const normalized = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized;
  }
  return 0;
}

/**
 * FFmpeg stderr ログ（`ffmpeg -i input` 実行結果）から詳細メタデータを抽出する。
 * 回転メタデータ（iPhone 縦動画の displaymatrix / rotate）、HDR、VFR 兆候、複数音声トラックに対応。
 */
export function parseFFmpegProbeLog(
  logs: string[],
  fallback: Partial<MediaMetadata> & { fileName: string; fileSize: number; mimeType: string }
): MediaMetadata {
  const text = logs.join('\n');

  // Duration & Bitrate
  let durationSec = fallback.durationSec ?? 0;
  const durMatch = text.match(/Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/);
  if (durMatch) {
    durationSec = parseDurationToSeconds(durMatch[1]);
  }

  let bitrateKbps = fallback.bitrateKbps ?? null;
  const brMatch = text.match(/bitrate:\s*(\d+)\s*kb\/s/i);
  if (brMatch) {
    bitrateKbps = Number(brMatch[1]);
  }

  // Container format
  let container = fallback.container || getExtension(fallback.fileName) || 'unknown';
  const inputMatch = text.match(/Input #0,\s*([^,\s]+)/);
  if (inputMatch) {
    container = inputMatch[1].toLowerCase();
  }

  // Video stream parsing
  const videoLineMatch = text.match(/Stream #0:(\d+)[^\n]*?:\s*Video:\s*([^\n]+)/);
  let hasVideo = Boolean(videoLineMatch);
  let videoCodec: string | null = null;
  let pixelFormat: string | null = null;
  let codedWidth = fallback.codedWidth ?? fallback.width ?? 0;
  let codedHeight = fallback.codedHeight ?? fallback.height ?? 0;
  let fps: number | null = fallback.fps ?? null;
  let isVfrSuspected = false;
  let isHdr = false;
  let colorTransfer: string | null = null;
  let colorPrimaries: string | null = null;

  if (videoLineMatch) {
    const vInfo = videoLineMatch[2];
    const codecMatch = vInfo.match(/^([a-zA-Z0-9_]+)/);
    if (codecMatch) {
      videoCodec = codecMatch[1].toLowerCase();
    }

    // Ignore attached album artwork (mjpeg/png attached pic) in audio-only files
    if (/attached pic/i.test(vInfo)) {
      hasVideo = false;
      videoCodec = null;
    } else {
      const dimMatch = vInfo.match(/,\s*(\d{2,5})x(\d{2,5})(?:\s|\[|,)/);
      if (dimMatch) {
        codedWidth = Number(dimMatch[1]);
        codedHeight = Number(dimMatch[2]);
      }

      const fpsMatch = vInfo.match(/(\d+(?:\.\d+)?)\s*fps/);
      if (fpsMatch) {
        fps = Number(fpsMatch[1]);
      }

      const tbrMatch = vInfo.match(/(\d+(?:\.\d+)?)\s*tbr/);
      if (fps && tbrMatch) {
        const tbr = Number(tbrMatch[1]);
        if (Math.abs(tbr - fps) > 0.5) {
          isVfrSuspected = true;
        }
      }
      // Common iPhone / mobile non-standard decimal fps indicator
      if (fps && ![23.98, 24, 25, 29.97, 30, 50, 59.94, 60, 120].some((std) => Math.abs(std - fps!) < 0.08)) {
        isVfrSuspected = true;
      }

      const pixMatch = vInfo.match(/,\s*(yuv[a-z0-9_]+|rgb[a-z0-9_]+|gbr[a-z0-9_]+|nv12|p010le)/i);
      if (pixMatch) {
        pixelFormat = pixMatch[1].toLowerCase();
      }

      // HDR detection (BT.2020 / PQ smpte2084 / HLG arib-std-b67 / Dolby Vision / 10-bit)
      if (/smpte2084/i.test(vInfo)) {
        colorTransfer = 'smpte2084 (PQ)';
        isHdr = true;
      } else if (/arib-std-b67/i.test(vInfo)) {
        colorTransfer = 'arib-std-b67 (HLG)';
        isHdr = true;
      }
      if (/bt2020/i.test(vInfo)) {
        colorPrimaries = 'bt2020';
        isHdr = true;
      }
      if (/DOVI|Dolby Vision/i.test(text)) {
        isHdr = true;
      }
    }
  }

  // Rotation metadata detection (rotate tag or displaymatrix)
  let rotation: 0 | 90 | 180 | 270 = 0;
  const rotateTagMatch = text.match(/rotate\s*:\s*(-?\d+)/i);
  const displayMatrixMatch = text.match(/displaymatrix:\s*rotation of\s*(-?\d+(?:\.\d+)?)\s*degrees/i);
  if (rotateTagMatch) {
    rotation = normalizeRotation(Number(rotateTagMatch[1]));
  } else if (displayMatrixMatch) {
    // FFmpeg displaymatrix reports counter-clockwise rotation needed; -90 means 90deg CW portrait video
    rotation = normalizeRotation(-Number(displayMatrixMatch[1]));
  }

  const swapDims = rotation === 90 || rotation === 270;
  const width = hasVideo ? (swapDims ? codedHeight : codedWidth) : 0;
  const height = hasVideo ? (swapDims ? codedWidth : codedHeight) : 0;

  // Audio streams parsing
  const audioStreams: AudioStreamInfo[] = [];
  const lines = text.split('\n');
  let audioIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(
      /Stream #0:(\d+)(?:\[[^\]]+\])?(?:\(([^)]+)\))?(?:\[[^\]]+\])?:\s*Audio:\s*(.+)/
    );
    if (!m) continue;
    const streamIndex = Number(m[1]);
    const lang = m[2] && m[2] !== 'und' ? m[2] : null;
    const info = m[3];

    const codecMatch = info.match(/^([a-zA-Z0-9_]+)/);
    const rateMatch = info.match(/(\d+)\s*Hz/i);
    const brStreamMatch = info.match(/(\d+)\s*kb\/s/i);
    let channels: number | null = null;
    let channelLayout: string | null = null;
    if (/\bmono\b/i.test(info)) {
      channels = 1;
      channelLayout = 'mono';
    } else if (/\bstereo\b/i.test(info)) {
      channels = 2;
      channelLayout = 'stereo';
    } else if (/5\.1/i.test(info)) {
      channels = 6;
      channelLayout = '5.1';
    } else if (/7\.1/i.test(info)) {
      channels = 8;
      channelLayout = '7.1';
    } else {
      const chMatch = info.match(/(\d+)\s*channels/i);
      if (chMatch) {
        channels = Number(chMatch[1]);
        channelLayout = `${channels}ch`;
      }
    }

    // Look ahead a few lines for stream title metadata
    let title: string | null = null;
    for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
      if (/Stream #0:/.test(lines[j])) break;
      const titleMatch = lines[j].match(/title\s*:\s*(.+)/i);
      if (titleMatch) {
        title = titleMatch[1].trim();
        break;
      }
    }

    audioStreams.push({
      streamIndex,
      audioIndex,
      codec: codecMatch ? codecMatch[1].toLowerCase() : 'unknown',
      sampleRate: rateMatch ? Number(rateMatch[1]) : null,
      channels,
      channelLayout,
      bitrateKbps: brStreamMatch ? Number(brStreamMatch[1]) : null,
      language: lang,
      title,
    });
    audioIndex++;
  }

  const hasAudio = audioStreams.length > 0;
  const isAudioOnly = !hasVideo && hasAudio;

  return {
    fileName: fallback.fileName,
    fileSize: fallback.fileSize,
    mimeType: fallback.mimeType,
    container,
    durationSec,
    bitrateKbps,
    hasVideo,
    hasAudio,
    isAudioOnly,
    codedWidth,
    codedHeight,
    width,
    height,
    fps,
    isVfrSuspected,
    videoCodec,
    pixelFormat,
    rotation,
    isHdr,
    colorTransfer,
    colorPrimaries,
    audioStreams,
    canBrowserPlay: fallback.canBrowserPlay ?? true,
    probeSource: 'ffmpeg',
  };
}

/**
 * ブラウザの <video>/<audio> 要素で即座に取得できる軽量メタデータを抽出する。
 * WASM ロード前でも即時にプレビューと基本メタ情報を表示するために使用。
 */
export function probeViaBrowserElement(file: File, objectUrl: string): Promise<MediaMetadata> {
  const ext = getExtension(file.name);
  const isLikelyAudio =
    file.type.startsWith('audio/') ||
    ['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus', 'wma'].includes(ext);

  return new Promise((resolve) => {
    const el = document.createElement(isLikelyAudio ? 'audio' : 'video');
    el.preload = 'metadata';
    el.muted = true;

    let settled = false;
    const finish = (canPlay: boolean) => {
      if (settled) return;
      settled = true;
      const durationSec = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
      const width = !isLikelyAudio && el instanceof HTMLVideoElement ? el.videoWidth : 0;
      const height = !isLikelyAudio && el instanceof HTMLVideoElement ? el.videoHeight : 0;
      const hasVideo = !isLikelyAudio && (width > 0 || !canPlay);
      el.removeAttribute('src');
      el.load();

      resolve({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || '',
        container: ext || 'unknown',
        durationSec,
        bitrateKbps: durationSec > 0 ? Math.round((file.size * 8) / durationSec / 1000) : null,
        hasVideo,
        hasAudio: true,
        isAudioOnly: isLikelyAudio,
        codedWidth: width,
        codedHeight: height,
        width,
        height,
        fps: null,
        isVfrSuspected: false,
        videoCodec: null,
        pixelFormat: null,
        rotation: 0,
        isHdr: false,
        colorTransfer: null,
        colorPrimaries: null,
        audioStreams: [
          {
            streamIndex: 1,
            audioIndex: 0,
            codec: 'unknown',
            sampleRate: null,
            channels: null,
            channelLayout: null,
            bitrateKbps: null,
            language: null,
            title: null,
          },
        ],
        canBrowserPlay: canPlay && (isLikelyAudio || width > 0),
        probeSource: 'browser',
      });
    };

    const timer = window.setTimeout(() => finish(false), 4500);
    el.onloadedmetadata = () => {
      window.clearTimeout(timer);
      finish(true);
    };
    el.onerror = () => {
      window.clearTimeout(timer);
      finish(false);
    };
    el.src = objectUrl;
  });
}
