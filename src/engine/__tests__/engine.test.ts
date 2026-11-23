import { describe, expect, it } from 'vitest';
import { getFeatureCapability } from '../../config/deviceLimits';
import { resolveCodecCompatibility } from '../../config/formats';
import { createDefaultEditConfig } from '../../config/presets';
import type { DeviceProfile } from '../../types/device';
import type { ClipSegment } from '../../types/edit';
import type { MediaMetadata } from '../../types/media';
import { buildFFmpegCommand } from '../commandBuilder';
import { buildAtempoFilters, buildFilterGraph } from '../filterGraphBuilder';
import { parseFFmpegProbeLog } from '../probeParser';
import { estimateOutputSize } from '../sizeEstimator';

const SAMPLE_VIDEO_META: MediaMetadata = {
  fileName: 'sample_iphone.mov',
  fileSize: 50 * 1024 * 1024,
  mimeType: 'video/quicktime',
  container: 'mov',
  durationSec: 60,
  bitrateKbps: 6800,
  hasVideo: true,
  hasAudio: true,
  isAudioOnly: false,
  codedWidth: 1920,
  codedHeight: 1080,
  width: 1080,
  height: 1920,
  fps: 30,
  isVfrSuspected: false,
  videoCodec: 'hevc',
  pixelFormat: 'yuv420p10le',
  rotation: 90,
  isHdr: true,
  colorTransfer: 'arib-std-b67 (HLG)',
  colorPrimaries: 'bt2020',
  audioStreams: [
    {
      streamIndex: 1,
      audioIndex: 0,
      codec: 'aac',
      sampleRate: 48000,
      channels: 2,
      channelLayout: 'stereo',
      bitrateKbps: 128,
      language: 'jpn',
      title: 'Main Mic',
    },
    {
      streamIndex: 2,
      audioIndex: 1,
      codec: 'aac',
      sampleRate: 48000,
      channels: 2,
      channelLayout: 'stereo',
      bitrateKbps: 128,
      language: 'eng',
      title: 'Commentary',
    },
  ],
  canBrowserPlay: true,
  probeSource: 'ffmpeg',
};

const FULL_CLIP: ClipSegment = {
  id: 'clip-0',
  sourceId: 'src-1',
  startSec: 0,
  endSec: 60,
};

describe('probeParser', () => {
  it('parses iPhone HEVC HDR rotated video and multiple audio tracks from FFmpeg stderr', () => {
    const logs = [
      'Input #0, mov,mp4,m4a,3gp,3g2,mj2, from \'/input/IMG_1234.MOV\':',
      '  Duration: 00:01:05.50, start: 0.000000, bitrate: 15230 kb/s',
      '  Stream #0:0[0x1](und): Video: hevc (Main 10) (hvc1 / 0x31637668), yuv420p10le(tv, bt2020nc/bt2020/arib-std-b67), 1920x1080, 14900 kb/s, 29.87 fps, 30 tbr, 600 tbn',
      '    Side data:',
      '      displaymatrix: rotation of -90.00 degrees',
      '  Stream #0:1[0x2](jpn): Audio: aac (LC), 48000 Hz, stereo, fltp, 128 kb/s',
      '    Metadata:',
      '      title           : Main Audio',
      '  Stream #0:2[0x3](eng): Audio: opus, 48000 Hz, mono, fltp, 96 kb/s',
    ];

    const meta = parseFFmpegProbeLog(logs, {
      fileName: 'IMG_1234.MOV',
      fileSize: 120_000_000,
      mimeType: 'video/quicktime',
    });

    expect(meta.durationSec).toBeCloseTo(65.5, 2);
    expect(meta.videoCodec).toBe('hevc');
    expect(meta.rotation).toBe(90);
    expect(meta.codedWidth).toBe(1920);
    expect(meta.codedHeight).toBe(1080);
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
    expect(meta.isHdr).toBe(true);
    expect(meta.isVfrSuspected).toBe(true);
    expect(meta.audioStreams).toHaveLength(2);
    expect(meta.audioStreams[0].title).toBe('Main Audio');
    expect(meta.audioStreams[1].codec).toBe('opus');
    expect(meta.audioStreams[1].channels).toBe(1);
  });
});

describe('filterGraphBuilder & atempo', () => {
  it('chains atempo filters safely outside [0.5, 2.0]', () => {
    expect(buildAtempoFilters(1)).toEqual([]);
    expect(buildAtempoFilters(0.25)).toEqual(['atempo=0.5', 'atempo=0.5']);
    expect(buildAtempoFilters(4)).toEqual(['atempo=2.0', 'atempo=2.0']);
    expect(buildAtempoFilters(3)).toEqual(['atempo=2.0', 'atempo=1.5']);
  });

  it('generates split -> scale+crop+boxblur -> overlay graph for blur background aspect mode', () => {
    const config = {
      ...createDefaultEditConfig(),
      aspectPreset: '16:9' as const,
      aspectMode: 'blur' as const,
      blurStrength: 20,
      blurBrightness: 'darker' as const,
    };
    const graph = buildFilterGraph(SAMPLE_VIDEO_META, config, FULL_CLIP);

    expect(graph.useFilterComplex).toBe(true);
    expect(graph.filterComplex).toContain('split=2[bg_src][fg_src]');
    expect(graph.filterComplex).toContain('boxblur=20:2');
    expect(graph.filterComplex).toContain('overlay=(W-w)/2:(H-h)/2');
    expect(graph.outputDimensions).toEqual({ width: 1920, height: 1080 });
  });

  it('generates pad filter with custom color for letterbox aspect mode', () => {
    const config = {
      ...createDefaultEditConfig(),
      aspectPreset: '1:1' as const,
      aspectMode: 'letterbox' as const,
      letterboxColor: '#112233',
    };
    const graph = buildFilterGraph(SAMPLE_VIDEO_META, config, FULL_CLIP);

    expect(graph.useFilterComplex).toBe(false);
    expect(graph.videoFilters.join(',')).toContain('pad=1920:1920:(ow-iw)/2:(oh-ih)/2:color=0x112233');
  });
});

describe('commandBuilder & codec compatibility', () => {
  it('auto-corrects invalid webm + h264/aac combination to vp9 + opus', () => {
    const res = resolveCodecCompatibility('webm', 'h264', 'aac');
    expect(res.adjusted).toBe(true);
    expect(res.videoCodec).toBe('vp9');
    expect(res.audioCodec).toBe('opus');
  });

  it('uses fast stream copy when trim fast mode has no filters', () => {
    const config = {
      ...createDefaultEditConfig(),
      trimEnabled: true,
      cutMode: 'fast' as const,
      stripMetadata: true,
    };
    const clip = { ...FULL_CLIP, startSec: 5, endSec: 20 };
    const plan = buildFFmpegCommand('__INPUT__', SAMPLE_VIDEO_META, config, clip);

    expect(plan.usedStreamCopy).toBe(true);
    expect(plan.args).toContain('-c:v');
    expect(plan.args).toContain('copy');
    expect(plan.args).toContain('-map_metadata');
    expect(plan.args).toContain('-1');
  });

  it('clears rotate metadata when re-encoding rotated iPhone video', () => {
    const config = {
      ...createDefaultEditConfig(),
      resolutionPreset: '720p' as const,
    };
    const plan = buildFFmpegCommand('__INPUT__', SAMPLE_VIDEO_META, config, FULL_CLIP);

    expect(plan.usedStreamCopy).toBe(false);
    expect(plan.args).toContain('-metadata:s:v:0');
    expect(plan.args).toContain('rotate=0');
  });

  it('builds audio extraction command for selected audio track', () => {
    const config = {
      ...createDefaultEditConfig(),
      taskType: 'audio-extract' as const,
      audioExtractFormat: 'flac' as const,
      audioExtractTrackIndex: 1,
    };
    const plan = buildFFmpegCommand('__INPUT__', SAMPLE_VIDEO_META, config, FULL_CLIP);

    expect(plan.args).toContain('-vn');
    expect(plan.args).toContain('0:a:1');
    expect(plan.args).toContain('flac');
    expect(plan.downloadFileName.endsWith('.flac')).toBe(true);
  });

  it('builds PNG snapshot export command at specified timestamp', () => {
    const config = {
      ...createDefaultEditConfig(),
      taskType: 'snapshot' as const,
      snapshotFormat: 'png' as const,
      snapshotTimeSec: 12.5,
    };
    const plan = buildFFmpegCommand('__INPUT__', SAMPLE_VIDEO_META, config, FULL_CLIP);

    expect(plan.args).toContain('-ss');
    expect(plan.args).toContain('12.500');
    expect(plan.args).toContain('-frames:v');
    expect(plan.mimeType).toBe('image/png');
  });
});

describe('sizeEstimator & deviceLimits', () => {
  it('estimates smaller sizes for stronger compression presets', () => {
    const high = estimateOutputSize(
      SAMPLE_VIDEO_META,
      { ...createDefaultEditConfig(), compressionPreset: 'high' },
      FULL_CLIP
    );
    const minimal = estimateOutputSize(
      SAMPLE_VIDEO_META,
      { ...createDefaultEditConfig(), compressionPreset: 'minimal' },
      FULL_CLIP
    );

    expect(minimal.estimatedBytes).toBeLessThan(high.estimatedBytes);
  });

  it('disables 4K, 2-pass, H.265, and AV1 on mobile with reason keys', () => {
    const mobileProfile: DeviceProfile = {
      tier: 'mobile',
      isIOS: true,
      isSafari: true,
      isTouch: true,
      deviceMemoryGB: 4,
      isMemoryEstimated: true,
      cpuCores: 6,
      supportsSharedArrayBuffer: false,
      isCrossOriginIsolated: false,
      supportsWebShareFiles: true,
      supportsWakeLock: true,
      supportsMediaRecorder: true,
      screenShortSide: 390,
    };

    expect(getFeatureCapability('export_4k', mobileProfile).status).toBe('disabled');
    expect(getFeatureCapability('two_pass', mobileProfile).status).toBe('disabled');
    expect(getFeatureCapability('codec_h265', mobileProfile).status).toBe('disabled');
    expect(getFeatureCapability('codec_av1', mobileProfile).status).toBe('disabled');
  });
});
