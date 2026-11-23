import { create } from 'zustand';
import { resolveCodecCompatibility } from '../config/formats';
import { createDefaultEditConfig } from '../config/presets';
import {
  clearRecoverySnapshot,
  loadRecoverySnapshot,
  saveRecoverySnapshot,
  type RecoverySnapshot,
} from '../services/recoveryService';
import type {
  AudioOverlayTrack,
  ClipSegment,
  EditConfig,
  ProjectJsonExport,
} from '../types/edit';
import type { MediaMetadata, MediaSourceItem } from '../types/media';
import { clamp } from '../utils/formatters';

interface HistoryEntry {
  config: EditConfig;
  clips: ClipSegment[];
}

interface ProjectState {
  /** Primary video/audio source (always sources[0] ?? null) */
  source: MediaSourceItem | null;
  /** All loaded sources (for multi-file concatenation) */
  sources: MediaSourceItem[];
  primaryWaveformPeaks: number[];
  clips: ClipSegment[];
  selectedClipId: string | null;
  audioTracks: AudioOverlayTrack[];
  watermarkFile: File | null;
  watermarkPreviewUrl: string | null;
  subtitleFile: File | null;
  subtitleFontFile: File | null;
  config: EditConfig;
  isProbing: boolean;
  compatNoticeKeys: string[];
  pendingRecovery: RecoverySnapshot | null;
  past: HistoryEntry[];
  future: HistoryEntry[];

  setSource: (source: MediaSourceItem) => void;
  addAdditionalSource: (source: MediaSourceItem) => void;
  updateSourceMetadata: (metadata: MediaMetadata, sourceId?: string) => void;
  setPrimaryWaveformPeaks: (peaks: number[]) => void;
  setProbing: (probing: boolean) => void;
  clearSource: () => void;

  // Phase 3 overlay & subtitle files
  setWatermarkFile: (file: File | null) => void;
  setSubtitleFile: (file: File | null) => void;
  setSubtitleFontFile: (file: File | null) => void;

  // Clip editing (single & multi-clip)
  selectClip: (clipId: string) => void;
  updateTrimRange: (startSec: number, endSec: number, clipId?: string) => void;
  splitClipAtTime: (clipId: string, timeSec: number) => void;
  duplicateClip: (clipId: string) => void;
  removeClip: (clipId: string) => void;
  moveClip: (clipId: string, direction: -1 | 1) => void;

  // Multi-track audio overlay (BGM / Mic recordings)
  addAudioTrack: (track: AudioOverlayTrack) => void;
  updateAudioTrack: (trackId: string, patch: Partial<AudioOverlayTrack>) => void;
  removeAudioTrack: (trackId: string) => void;

  // Config & History
  updateConfig: (patch: Partial<EditConfig>) => void;
  resetConfig: () => void;
  undo: () => void;
  redo: () => void;

  // Project JSON Save / Load (excludes binary video files)
  exportProjectJson: () => string;
  importProjectJson: (rawJson: string) => { ok: boolean; error?: string };

  // Session Recovery
  restoreRecovery: () => void;
  dismissRecovery: () => void;
}

const MAX_HISTORY = 40;
let recoveryTimer: number | null = null;
let clipCounter = 1;

function nextClipId(): string {
  clipCounter += 1;
  return `clip-${Date.now()}-${clipCounter}`;
}

function scheduleRecoverySave(
  source: MediaSourceItem | null,
  clips: ClipSegment[],
  config: EditConfig
) {
  if (typeof window === 'undefined' || !source) return;
  if (recoveryTimer !== null) {
    window.clearTimeout(recoveryTimer);
  }
  recoveryTimer = window.setTimeout(() => {
    const primaryClip = clips[0];
    saveRecoverySnapshot({
      savedAt: Date.now(),
      lastFileName: source.metadata.fileName,
      trimStartSec: primaryClip?.startSec ?? 0,
      trimEndSec: primaryClip?.endSec ?? source.metadata.durationSec,
      config,
    });
  }, 500);
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  source: null,
  sources: [],
  primaryWaveformPeaks: [],
  clips: [],
  selectedClipId: null,
  audioTracks: [],
  watermarkFile: null,
  watermarkPreviewUrl: null,
  subtitleFile: null,
  subtitleFontFile: null,
  config: createDefaultEditConfig(),
  isProbing: false,
  compatNoticeKeys: [],
  pendingRecovery: typeof window !== 'undefined' ? loadRecoverySnapshot() : null,
  past: [],
  future: [],

  setSource: (source) => {
    const prevSources = get().sources;
    for (const prev of prevSources) {
      if (prev.objectUrl !== source.objectUrl) {
        URL.revokeObjectURL(prev.objectUrl);
      }
    }
    for (const tr of get().audioTracks) {
      URL.revokeObjectURL(tr.objectUrl);
    }

    const duration = Math.max(0, source.metadata.durationSec);
    const clip: ClipSegment = {
      id: 'clip-0',
      sourceId: source.id,
      startSec: 0,
      endSec: duration,
      label: source.metadata.fileName,
    };

    const nextConfig: EditConfig = {
      ...createDefaultEditConfig(),
      taskType: source.metadata.isAudioOnly ? 'audio-extract' : 'video',
      customWidth: source.metadata.width || 1280,
      customHeight: source.metadata.height || 720,
      muteRangeEndSec: Math.min(5, duration || 5),
    };

    set({
      source,
      sources: [source],
      primaryWaveformPeaks: [],
      clips: [clip],
      selectedClipId: clip.id,
      audioTracks: [],
      config: nextConfig,
      compatNoticeKeys: [],
      past: [],
      future: [],
    });
  },

  addAdditionalSource: (newSource) => {
    const { sources, clips, config, past } = get();
    const duration = Math.max(0.1, newSource.metadata.durationSec);
    const newClip: ClipSegment = {
      id: nextClipId(),
      sourceId: newSource.id,
      startSec: 0,
      endSec: duration,
      label: newSource.metadata.fileName,
    };
    const nextClips = [...clips, newClip];
    set({
      sources: [...sources, newSource],
      clips: nextClips,
      selectedClipId: newClip.id,
      past: [...past, { config, clips }].slice(-MAX_HISTORY),
      future: [],
    });
  },

  updateSourceMetadata: (metadata, sourceId) => {
    const { source, sources, clips, config } = get();
    if (!source) return;
    const targetId = sourceId ?? source.id;
    const targetSource = sources.find((s) => s.id === targetId);
    if (!targetSource) return;

    const updatedSources = sources.map((s) =>
      s.id === targetId ? { ...s, metadata } : s
    );
    const updatedPrimary = updatedSources[0] ?? null;
    const duration = Math.max(0, metadata.durationSec);

    const updatedClips = clips.map((clip) => {
      if (clip.sourceId !== targetId) return clip;
      const shouldExpandEnd =
        clip.endSec <= 0 || Math.abs(clip.endSec - targetSource.metadata.durationSec) < 0.2;
      return {
        ...clip,
        startSec: clamp(clip.startSec, 0, Math.max(0, duration - 0.1)),
        endSec: shouldExpandEnd ? duration : clamp(clip.endSec, 0.1, duration),
      };
    });

    const nextConfig: EditConfig =
      targetId === source.id
        ? {
            ...config,
            taskType: metadata.isAudioOnly ? 'audio-extract' : config.taskType,
            customWidth:
              config.resolutionPreset === 'custom'
                ? config.customWidth
                : metadata.width || config.customWidth,
            customHeight:
              config.resolutionPreset === 'custom'
                ? config.customHeight
                : metadata.height || config.customHeight,
          }
        : config;

    set({
      source: updatedPrimary,
      sources: updatedSources,
      clips: updatedClips,
      config: nextConfig,
    });
  },

  setPrimaryWaveformPeaks: (primaryWaveformPeaks) => set({ primaryWaveformPeaks }),

  setProbing: (isProbing) => set({ isProbing }),

  clearSource: () => {
    for (const prev of get().sources) {
      URL.revokeObjectURL(prev.objectUrl);
    }
    for (const tr of get().audioTracks) {
      URL.revokeObjectURL(tr.objectUrl);
    }
    set({
      source: null,
      sources: [],
      primaryWaveformPeaks: [],
      clips: [],
      selectedClipId: null,
      audioTracks: [],
      config: createDefaultEditConfig(),
      compatNoticeKeys: [],
      past: [],
      future: [],
    });
  },

  selectClip: (selectedClipId) => set({ selectedClipId }),

  updateTrimRange: (startSec, endSec, clipId) => {
    const { source, sources, clips, selectedClipId, config, past } = get();
    if (!source || clips.length === 0) return;

    const targetClipId = clipId ?? selectedClipId ?? clips[0].id;
    const targetClip = clips.find((c) => c.id === targetClipId) ?? clips[0];
    const clipSource = sources.find((s) => s.id === targetClip.sourceId) ?? source;

    const maxDur = Math.max(0.1, clipSource.metadata.durationSec);
    const safeStart = clamp(startSec, 0, Math.max(0, maxDur - 0.05));
    const safeEnd = clamp(endSec, safeStart + 0.05, maxDur);

    const nextClips = clips.map((c) =>
      c.id === targetClip.id ? { ...c, startSec: safeStart, endSec: safeEnd } : c
    );
    const nextPast = [...past, { config, clips }].slice(-MAX_HISTORY);
    set({
      clips: nextClips,
      past: nextPast,
      future: [],
    });
    scheduleRecoverySave(source, nextClips, config);
  },

  splitClipAtTime: (clipId, timeSec) => {
    const { source, clips, config, past } = get();
    const idx = clips.findIndex((c) => c.id === clipId);
    if (idx === -1) return;
    const target = clips[idx];
    const splitPoint = clamp(timeSec, target.startSec + 0.1, target.endSec - 0.1);
    if (splitPoint <= target.startSec + 0.05 || splitPoint >= target.endSec - 0.05) {
      return;
    }

    const firstHalf: ClipSegment = { ...target, endSec: Number(splitPoint.toFixed(2)) };
    const secondHalf: ClipSegment = {
      ...target,
      id: nextClipId(),
      startSec: Number(splitPoint.toFixed(2)),
    };

    const nextClips = [...clips.slice(0, idx), firstHalf, secondHalf, ...clips.slice(idx + 1)];
    set({
      clips: nextClips,
      selectedClipId: secondHalf.id,
      config: { ...config, trimEnabled: true },
      past: [...past, { config, clips }].slice(-MAX_HISTORY),
      future: [],
    });
    scheduleRecoverySave(source, nextClips, config);
  },

  duplicateClip: (clipId) => {
    const { source, clips, config, past } = get();
    const idx = clips.findIndex((c) => c.id === clipId);
    if (idx === -1) return;
    const copy: ClipSegment = { ...clips[idx], id: nextClipId() };
    const nextClips = [...clips.slice(0, idx + 1), copy, ...clips.slice(idx + 1)];
    set({
      clips: nextClips,
      selectedClipId: copy.id,
      config: { ...config, trimEnabled: true },
      past: [...past, { config, clips }].slice(-MAX_HISTORY),
      future: [],
    });
    scheduleRecoverySave(source, nextClips, config);
  },

  removeClip: (clipId) => {
    const { source, clips, selectedClipId, config, past } = get();
    if (clips.length <= 1) return;
    const nextClips = clips.filter((c) => c.id !== clipId);
    const nextSelected =
      selectedClipId === clipId ? (nextClips[0]?.id ?? null) : selectedClipId;
    set({
      clips: nextClips,
      selectedClipId: nextSelected,
      past: [...past, { config, clips }].slice(-MAX_HISTORY),
      future: [],
    });
    scheduleRecoverySave(source, nextClips, config);
  },

  moveClip: (clipId, direction) => {
    const { source, clips, config, past } = get();
    const idx = clips.findIndex((c) => c.id === clipId);
    const targetIdx = idx + direction;
    if (idx === -1 || targetIdx < 0 || targetIdx >= clips.length) return;
    const nextClips = [...clips];
    const [moved] = nextClips.splice(idx, 1);
    nextClips.splice(targetIdx, 0, moved);
    set({
      clips: nextClips,
      past: [...past, { config, clips }].slice(-MAX_HISTORY),
      future: [],
    });
    scheduleRecoverySave(source, nextClips, config);
  },

  addAudioTrack: (track) =>
    set((state) => ({
      audioTracks: [...state.audioTracks, track],
    })),

  updateAudioTrack: (trackId, patch) =>
    set((state) => ({
      audioTracks: state.audioTracks.map((tr) =>
        tr.id === trackId ? { ...tr, ...patch } : tr
      ),
    })),

  removeAudioTrack: (trackId) =>
    set((state) => {
      const target = state.audioTracks.find((tr) => tr.id === trackId);
      if (target) URL.revokeObjectURL(target.objectUrl);
      return {
        audioTracks: state.audioTracks.filter((tr) => tr.id !== trackId),
      };
    }),

  setWatermarkFile: (file) => {
    const prevUrl = get().watermarkPreviewUrl;
    if (prevUrl) URL.revokeObjectURL(prevUrl);
    if (!file) {
      set((state) => ({
        watermarkFile: null,
        watermarkPreviewUrl: null,
        config: { ...state.config, watermark: { ...state.config.watermark, enabled: false } },
      }));
      return;
    }
    const url = URL.createObjectURL(file);
    set((state) => ({
      watermarkFile: file,
      watermarkPreviewUrl: url,
      config: { ...state.config, watermark: { ...state.config.watermark, enabled: true } },
    }));
  },

  setSubtitleFile: (file) =>
    set((state) => ({
      subtitleFile: file,
      config: {
        ...state.config,
        subtitleHandling: file
          ? state.config.subtitleHandling === 'strip' || state.config.subtitleHandling === 'keep'
            ? 'embedExternal'
            : state.config.subtitleHandling
          : 'strip',
      },
    })),

  setSubtitleFontFile: (subtitleFontFile) => set({ subtitleFontFile }),

  updateConfig: (patch) => {
    const { source, clips, config, past } = get();
    const merged: EditConfig = {
      ...config,
      ...patch,
      crop: patch.crop ? { ...config.crop, ...patch.crop } : config.crop,
      textOverlay: patch.textOverlay
        ? { ...config.textOverlay, ...patch.textOverlay }
        : config.textOverlay,
      watermark: patch.watermark
        ? { ...config.watermark, ...patch.watermark }
        : config.watermark,
    };

    const compat = resolveCodecCompatibility(
      merged.container,
      merged.videoCodec,
      merged.audioCodec
    );
    merged.videoCodec = compat.videoCodec;
    merged.audioCodec = compat.audioCodec;

    const nextPast = [...past, { config, clips }].slice(-MAX_HISTORY);
    set({
      config: merged,
      compatNoticeKeys: compat.warnings,
      past: nextPast,
      future: [],
    });
    scheduleRecoverySave(source, clips, merged);
  },

  resetConfig: () => {
    const { source, clips, config, past } = get();
    const duration = source?.metadata.durationSec ?? 0;
    const resetClips = source
      ? [
          {
            id: 'clip-0',
            sourceId: source.id,
            startSec: 0,
            endSec: duration,
            label: source.metadata.fileName,
          },
        ]
      : [];
    const nextConfig: EditConfig = {
      ...createDefaultEditConfig(),
      taskType: source?.metadata.isAudioOnly ? 'audio-extract' : 'video',
      customWidth: source?.metadata.width || 1280,
      customHeight: source?.metadata.height || 720,
    };
    set({
      config: nextConfig,
      clips: resetClips,
      selectedClipId: resetClips[0]?.id ?? null,
      compatNoticeKeys: [],
      past: [...past, { config, clips }].slice(-MAX_HISTORY),
      future: [],
    });
  },

  undo: () => {
    const { past, future, config, clips } = get();
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    set({
      config: previous.config,
      clips: previous.clips,
      selectedClipId: previous.clips[0]?.id ?? null,
      past: past.slice(0, -1),
      future: [{ config, clips }, ...future].slice(0, MAX_HISTORY),
    });
  },

  redo: () => {
    const { past, future, config, clips } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      config: next.config,
      clips: next.clips,
      selectedClipId: next.clips[0]?.id ?? null,
      past: [...past, { config, clips }].slice(-MAX_HISTORY),
      future: future.slice(1),
    });
  },

  exportProjectJson: () => {
    const { sources, clips, audioTracks, config } = get();
    const payload: ProjectJsonExport = {
      schemaVersion: 3,
      app: 'Clip-Kit-for-WASM',
      exportedAt: new Date().toISOString(),
      config,
      clips: clips.map((c) => {
        const src = sources.find((s) => s.id === c.sourceId);
        return {
          sourceFileName: src?.metadata.fileName ?? '',
          startSec: c.startSec,
          endSec: c.endSec,
        };
      }),
      audioTracksMeta: audioTracks.map((tr) => ({
        name: tr.name,
        volume: tr.volume,
        offsetSec: tr.offsetSec,
        trimStartSec: tr.trimStartSec,
        trimEndSec: tr.trimEndSec,
        fadeInSec: tr.fadeInSec,
        fadeOutSec: tr.fadeOutSec,
        loop: tr.loop,
        muted: tr.muted,
      })),
    };
    return JSON.stringify(payload, null, 2);
  },

  importProjectJson: (rawJson) => {
    try {
      const parsed = JSON.parse(rawJson) as Partial<ProjectJsonExport>;
      if (!parsed || parsed.app !== 'Clip-Kit-for-WASM' || !parsed.config) {
        return { ok: false, error: 'Clip-Kit-for-WASM の有効なプロジェクト JSON ではありません。' };
      }

      const defaults = createDefaultEditConfig();
      const nextConfig: EditConfig = {
        ...defaults,
        ...parsed.config,
        crop: { ...defaults.crop, ...(parsed.config.crop || {}) },
        textOverlay: { ...defaults.textOverlay, ...(parsed.config.textOverlay || {}) },
        watermark: { ...defaults.watermark, ...(parsed.config.watermark || {}) },
      };

      const { source, clips, config, past } = get();
      let nextClips = clips;
      if (source && Array.isArray(parsed.clips) && parsed.clips.length > 0) {
        const dur = Math.max(0.1, source.metadata.durationSec);
        nextClips = parsed.clips.map((c, idx) => ({
          id: idx === 0 ? 'clip-0' : nextClipId(),
          sourceId: source.id,
          startSec: clamp(Number(c.startSec) || 0, 0, Math.max(0, dur - 0.05)),
          endSec: clamp(Number(c.endSec) || dur, 0.05, dur),
          label: c.sourceFileName || source.metadata.fileName,
        }));
      }

      set({
        config: nextConfig,
        clips: nextClips,
        selectedClipId: nextClips[0]?.id ?? null,
        past: [...past, { config, clips }].slice(-MAX_HISTORY),
        future: [],
      });
      return { ok: true };
    } catch {
      return { ok: false, error: 'JSON の解析に失敗しました。ファイル内容を確認してください。' };
    }
  },

  restoreRecovery: () => {
    const { pendingRecovery, source, clips } = get();
    if (!pendingRecovery) return;

    const defaults = createDefaultEditConfig();
    const restoredConfig: EditConfig = {
      ...defaults,
      ...pendingRecovery.config,
      crop: {
        ...defaults.crop,
        ...(pendingRecovery.config.crop || {}),
      },
      textOverlay: {
        ...defaults.textOverlay,
        ...(pendingRecovery.config.textOverlay || {}),
      },
      watermark: {
        ...defaults.watermark,
        ...(pendingRecovery.config.watermark || {}),
      },
    };

    const nextClips =
      source && clips.length > 0
        ? [
            {
              ...clips[0],
              startSec: clamp(
                pendingRecovery.trimStartSec,
                0,
                Math.max(0, source.metadata.durationSec - 0.05)
              ),
              endSec: clamp(
                pendingRecovery.trimEndSec,
                0.05,
                Math.max(0.05, source.metadata.durationSec)
              ),
            },
          ]
        : clips;

    set({
      config: restoredConfig,
      clips: nextClips,
      pendingRecovery: null,
    });
  },

  dismissRecovery: () => {
    clearRecoverySnapshot();
    set({ pendingRecovery: null });
  },
}));
