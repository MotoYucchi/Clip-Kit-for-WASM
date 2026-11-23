import type {
  AudioCodec,
  AudioExtractFormat,
  OutputContainer,
  VideoCodec,
} from '../types/edit';

export interface ContainerSpec {
  id: OutputContainer;
  label: string;
  extension: string;
  mimeType: string;
  isAnimatedImage?: boolean;
  allowedVideoCodecs: VideoCodec[];
  allowedAudioCodecs: AudioCodec[];
  defaultVideoCodec: VideoCodec;
  defaultAudioCodec: AudioCodec;
}

export const CONTAINER_SPECS: Record<OutputContainer, ContainerSpec> = {
  mp4: {
    id: 'mp4',
    label: 'MP4 (.mp4)',
    extension: 'mp4',
    mimeType: 'video/mp4',
    allowedVideoCodecs: ['h264', 'h265', 'copy'],
    allowedAudioCodecs: ['aac', 'mp3', 'opus', 'copy'],
    defaultVideoCodec: 'h264',
    defaultAudioCodec: 'aac',
  },
  webm: {
    id: 'webm',
    label: 'WebM (.webm)',
    extension: 'webm',
    mimeType: 'video/webm',
    allowedVideoCodecs: ['vp9', 'av1', 'copy'],
    allowedAudioCodecs: ['opus', 'copy'],
    defaultVideoCodec: 'vp9',
    defaultAudioCodec: 'opus',
  },
  mkv: {
    id: 'mkv',
    label: 'MKV (.mkv)',
    extension: 'mkv',
    mimeType: 'video/x-matroska',
    allowedVideoCodecs: ['h264', 'h265', 'vp9', 'av1', 'copy'],
    allowedAudioCodecs: ['aac', 'mp3', 'opus', 'copy'],
    defaultVideoCodec: 'h264',
    defaultAudioCodec: 'aac',
  },
  mov: {
    id: 'mov',
    label: 'MOV (.mov)',
    extension: 'mov',
    mimeType: 'video/quicktime',
    allowedVideoCodecs: ['h264', 'h265', 'copy'],
    allowedAudioCodecs: ['aac', 'mp3', 'copy'],
    defaultVideoCodec: 'h264',
    defaultAudioCodec: 'aac',
  },
  gif: {
    id: 'gif',
    label: 'GIF アニメ (.gif)',
    extension: 'gif',
    mimeType: 'image/gif',
    isAnimatedImage: true,
    allowedVideoCodecs: ['h264'],
    allowedAudioCodecs: ['aac'],
    defaultVideoCodec: 'h264',
    defaultAudioCodec: 'aac',
  },
  webp: {
    id: 'webp',
    label: 'アニメ WebP (.webp)',
    extension: 'webp',
    mimeType: 'image/webp',
    isAnimatedImage: true,
    allowedVideoCodecs: ['h264'],
    allowedAudioCodecs: ['aac'],
    defaultVideoCodec: 'h264',
    defaultAudioCodec: 'aac',
  },
};

export interface AudioExtractSpec {
  id: AudioExtractFormat;
  label: string;
  extension: string;
  mimeType: string;
  ffmpegCodec: string;
  supportsBitrate: boolean;
  defaultBitrateKbps: number;
}

export const AUDIO_EXTRACT_SPECS: Record<AudioExtractFormat, AudioExtractSpec> = {
  mp3: {
    id: 'mp3',
    label: 'MP3 (.mp3)',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    ffmpegCodec: 'libmp3lame',
    supportsBitrate: true,
    defaultBitrateKbps: 192,
  },
  m4a: {
    id: 'm4a',
    label: 'AAC (.m4a)',
    extension: 'm4a',
    mimeType: 'audio/mp4',
    ffmpegCodec: 'aac',
    supportsBitrate: true,
    defaultBitrateKbps: 192,
  },
  wav: {
    id: 'wav',
    label: 'WAV (.wav)',
    extension: 'wav',
    mimeType: 'audio/wav',
    ffmpegCodec: 'pcm_s16le',
    supportsBitrate: false,
    defaultBitrateKbps: 1411,
  },
  flac: {
    id: 'flac',
    label: 'FLAC (.flac)',
    extension: 'flac',
    mimeType: 'audio/flac',
    ffmpegCodec: 'flac',
    supportsBitrate: false,
    defaultBitrateKbps: 900,
  },
  opus: {
    id: 'opus',
    label: 'Opus (.opus)',
    extension: 'opus',
    mimeType: 'audio/opus',
    ffmpegCodec: 'libopus',
    supportsBitrate: true,
    defaultBitrateKbps: 128,
  },
};

export const ACCEPTED_MEDIA_EXTENSIONS = [
  '.mp4',
  '.mov',
  '.avi',
  '.webm',
  '.mkv',
  '.mpg',
  '.mpeg',
  '.flv',
  '.3gp',
  '.m4v',
  '.ts',
  '.mts',
  '.m2ts',
  '.wmv',
  '.ogv',
  '.mp3',
  '.m4a',
  '.aac',
  '.wav',
  '.flac',
  '.ogg',
  '.opus',
  '.wma',
] as const;

export const FILE_INPUT_ACCEPT = `video/*,audio/*,${ACCEPTED_MEDIA_EXTENSIONS.join(',')}`;

export interface CodecCompatResult {
  videoCodec: VideoCodec;
  audioCodec: AudioCodec;
  adjusted: boolean;
  warnings: string[];
}

export function resolveCodecCompatibility(
  container: OutputContainer,
  videoCodec: VideoCodec,
  audioCodec: AudioCodec
): CodecCompatResult {
  const spec = CONTAINER_SPECS[container];
  if (spec.isAnimatedImage) {
    return {
      videoCodec: spec.defaultVideoCodec,
      audioCodec: spec.defaultAudioCodec,
      adjusted: false,
      warnings: [],
    };
  }

  let resolvedVideo = videoCodec;
  let resolvedAudio = audioCodec;
  const warnings: string[] = [];

  if (!spec.allowedVideoCodecs.includes(resolvedVideo)) {
    resolvedVideo = spec.defaultVideoCodec;
    warnings.push('compat.videoAutoAdjusted');
  }

  if (!spec.allowedAudioCodecs.includes(resolvedAudio)) {
    resolvedAudio = spec.defaultAudioCodec;
    warnings.push('compat.audioAutoAdjusted');
  }

  return {
    videoCodec: resolvedVideo,
    audioCodec: resolvedAudio,
    adjusted: warnings.length > 0,
    warnings,
  };
}
