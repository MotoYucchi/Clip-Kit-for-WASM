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

describe('Phase 2: Multi-Clip, Multi-Track Audio, 2-Pass, CFR & HDR->SDR', () => {
  const dummyVideoFile = new File([], 'main.mp4', { type: 'video/mp4' });
  const dummyVideoFile2 = new File([], 'extra.mov', { type: 'video/quicktime' });
  const dummyBgmFile = new File([], 'bgm.mp3', { type: 'audio/mpeg' });

  const source1 = {
    id: 'src-1',
    file: dummyVideoFile,
    objectUrl: '',
    metadata: SAMPLE_VIDEO_META,
    addedAt: 1,
  };
  const source2 = {
    id: 'src-2',
    file: dummyVideoFile2,
    objectUrl: '',
    metadata: { ...SAMPLE_VIDEO_META, fileName: 'extra.mov', width: 1280, height: 720, durationSec: 20 },
    addedAt: 2,
  };

  it('concatenates multiple clips from different files with automatic normalization', async () => {
    const { buildFullFFmpegCommand } = await import('../commandBuilder');
    const clips: ClipSegment[] = [
      { id: 'c1', sourceId: 'src-1', startSec: 2, endSec: 12 },
      { id: 'c2', sourceId: 'src-2', startSec: 0, endSec: 10 },
    ];
    const plan = buildFullFFmpegCommand({
      primarySource: source1,
      sources: [source1, source2],
      clips,
      audioTracks: [],
      config: createDefaultEditConfig(),
    });

    expect(plan.inputs).toHaveLength(2);
    expect(plan.args).toContain('-filter_complex');
    const fc = plan.args[plan.args.indexOf('-filter_complex') + 1];
    expect(fc).toContain('concat=n=2:v=1:a=1[vcat][acat]');
    expect(fc).toContain('aresample=48000');
  });

  it('mixes BGM track with offset, fade, loop, volume, and loudnorm', async () => {
    const { buildFullFFmpegCommand } = await import('../commandBuilder');
    const bgmTrack = {
      id: 'aud-1',
      name: 'bgm.mp3',
      file: dummyBgmFile,
      objectUrl: '',
      durationSec: 15,
      isMicRecording: false,
      volume: 0.6,
      offsetSec: 2.5,
      trimStartSec: 1,
      trimEndSec: 14,
      fadeInSec: 1.5,
      fadeOutSec: 2,
      loop: true,
      muted: false,
      waveformPeaks: [],
    };
    const plan = buildFullFFmpegCommand({
      primarySource: source1,
      sources: [source1],
      clips: [FULL_CLIP],
      audioTracks: [bgmTrack],
      config: {
        ...createDefaultEditConfig(),
        originalAudioHandling: 'mix',
        audioOutputMode: 'mix',
        enableLoudnorm: true,
      },
    });

    expect(plan.inputs).toHaveLength(2);
    const fc = plan.args[plan.args.indexOf('-filter_complex') + 1];
    expect(fc).toContain('aloop=loop=-1');
    expect(fc).toContain('afade=t=in');
    expect(fc).toContain('afade=t=out');
    expect(fc).toContain('adelay=2500|2500');
    expect(fc).toContain('amix=inputs=2');
    expect(fc).toContain('loudnorm=I=-16');
  });

  it('keeps separate audio tracks in MP4/MKV when audioOutputMode is separate', async () => {
    const { buildFullFFmpegCommand } = await import('../commandBuilder');
    const bgmTrack = {
      id: 'aud-1',
      name: 'Narration',
      file: dummyBgmFile,
      objectUrl: '',
      durationSec: 15,
      isMicRecording: true,
      volume: 1,
      offsetSec: 0,
      trimStartSec: 0,
      trimEndSec: 15,
      fadeInSec: 0,
      fadeOutSec: 0,
      loop: false,
      muted: false,
      waveformPeaks: [],
    };
    const plan = buildFullFFmpegCommand({
      primarySource: source1,
      sources: [source1],
      clips: [FULL_CLIP],
      audioTracks: [bgmTrack],
      config: {
        ...createDefaultEditConfig(),
        container: 'mkv',
        originalAudioHandling: 'keep',
        audioOutputMode: 'separate',
      },
    });

    expect(plan.args).toContain('[orig_a]');
    expect(plan.args).toContain('[bgm_0]');
    expect(plan.args).toContain('-metadata:s:a:1');
    expect(plan.args).toContain('title=Narration');
  });

  it('generates 2-pass command and target video bitrate for Discord 10MB target size', async () => {
    const { buildFullFFmpegCommand, computeTargetVideoBitrateKbps } = await import('../commandBuilder');
    const kbps = computeTargetVideoBitrateKbps(9.5, 60, 96, true);
    expect(kbps).toBeGreaterThan(900);
    expect(kbps).toBeLessThan(1300);

    const plan = buildFullFFmpegCommand({
      primarySource: source1,
      sources: [source1],
      clips: [FULL_CLIP],
      audioTracks: [],
      config: {
        ...createDefaultEditConfig(),
        rateControlMode: 'targetSize',
        targetSizeMB: 9.5,
        audioBitrateKbps: 96,
        enableTwoPass: true,
      },
    });

    expect(plan.usedTwoPass).toBe(true);
    expect(plan.pass1Args).not.toBeNull();
    expect(plan.pass1Args).toContain('-pass');
    expect(plan.pass1Args).toContain('1');
    expect(plan.args).toContain('-pass');
    expect(plan.args).toContain('2');
    expect(plan.args).toContain('-b:v');
  });

  it('applies VFR->CFR (-vsync cfr + fps) and HDR->SDR tone mapping (zscale + tonemap)', async () => {
    const { buildFullFFmpegCommand } = await import('../commandBuilder');
    const plan = buildFullFFmpegCommand({
      primarySource: source1,
      sources: [source1],
      clips: [FULL_CLIP],
      audioTracks: [],
      config: {
        ...createDefaultEditConfig(),
        fpsPreset: '30',
        convertVfrToCfr: true,
        convertHdrToSdr: true,
      },
    });

    expect(plan.args).toContain('-vsync');
    expect(plan.args).toContain('cfr');
    const vf = plan.args[plan.args.indexOf('-vf') + 1];
    expect(vf).toContain('tonemap=tonemap=hable:desat=0');
    expect(vf).toContain('fps=30');
  });
});
