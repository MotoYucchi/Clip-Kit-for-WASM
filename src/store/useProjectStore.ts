import { create } from 'zustand';
import { resolveCodecCompatibility } from '../config/formats';
import { createDefaultEditConfig } from '../config/presets';
import {
  clearRecoverySnapshot,
  loadRecoverySnapshot,
  saveRecoverySnapshot,
  type RecoverySnapshot,
} from '../services/recoveryService';
import type { ClipSegment, EditConfig } from '../types/edit';
import type { MediaMetadata, MediaSourceItem } from '../types/media';
import { clamp } from '../utils/formatters';

interface HistoryEntry {
  config: EditConfig;
  clips: ClipSegment[];
}

interface ProjectState {
  source: MediaSourceItem | null;
  clips: ClipSegment[];
  config: EditConfig;
  isProbing: boolean;
  compatNoticeKeys: string[];
  pendingRecovery: RecoverySnapshot | null;
  past: HistoryEntry[];
  future: HistoryEntry[];

  setSource: (source: MediaSourceItem) => void;
  updateSourceMetadata: (metadata: MediaMetadata) => void;
  setProbing: (probing: boolean) => void;
  clearSource: () => void;

  updateConfig: (patch: Partial<EditConfig>) => void;
  updateTrimRange: (startSec: number, endSec: number) => void;
  resetConfig: () => void;

  undo: () => void;
  redo: () => void;

  restoreRecovery: () => void;
  dismissRecovery: () => void;
}

const MAX_HISTORY = 40;
let recoveryTimer: number | null = null;

function scheduleRecoverySave(source: MediaSourceItem | null, clips: ClipSegment[], config: EditConfig) {
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
  clips: [],
  config: createDefaultEditConfig(),
  isProbing: false,
  compatNoticeKeys: [],
  pendingRecovery: typeof window !== 'undefined' ? loadRecoverySnapshot() : null,
  past: [],
  future: [],

  setSource: (source) => {
    const prev = get().source;
    if (prev && prev.objectUrl !== source.objectUrl) {
      URL.revokeObjectURL(prev.objectUrl);
    }

    const duration = Math.max(0, source.metadata.durationSec);
    const clip: ClipSegment = {
      id: 'clip-0',
      sourceId: source.id,
      startSec: 0,
      endSec: duration,
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
      clips: [clip],
      config: nextConfig,
      compatNoticeKeys: [],
      past: [],
      future: [],
    });
  },

  updateSourceMetadata: (metadata) => {
    const { source, clips, config } = get();
    if (!source) return;

    const updatedSource: MediaSourceItem = { ...source, metadata };
    const duration = Math.max(0, metadata.durationSec);
    const updatedClips = clips.map((clip, idx) => {
      if (idx !== 0) return clip;
      const shouldExpandEnd = clip.endSec <= 0 || Math.abs(clip.endSec - source.metadata.durationSec) < 0.2;
      return {
        ...clip,
        startSec: clamp(clip.startSec, 0, Math.max(0, duration - 0.1)),
        endSec: shouldExpandEnd ? duration : clamp(clip.endSec, 0.1, duration),
      };
    });

    const nextConfig: EditConfig = {
      ...config,
      taskType: metadata.isAudioOnly ? 'audio-extract' : config.taskType,
      customWidth: config.resolutionPreset === 'custom' ? config.customWidth : (metadata.width || config.customWidth),
      customHeight: config.resolutionPreset === 'custom' ? config.customHeight : (metadata.height || config.customHeight),
    };

    set({
      source: updatedSource,
      clips: updatedClips,
      config: nextConfig,
    });
  },

  setProbing: (isProbing) => set({ isProbing }),

  clearSource: () => {
    const prev = get().source;
    if (prev) {
      URL.revokeObjectURL(prev.objectUrl);
    }
    set({
      source: null,
      clips: [],
      config: createDefaultEditConfig(),
      compatNoticeKeys: [],
      past: [],
      future: [],
    });
  },

  updateConfig: (patch) => {
    const { source, clips, config, past } = get();
    const merged: EditConfig = {
      ...config,
      ...patch,
      crop: patch.crop ? { ...config.crop, ...patch.crop } : config.crop,
    };

    // Enforce container <-> codec compatibility
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

  updateTrimRange: (startSec, endSec) => {
    const { source, clips, config, past } = get();
    if (!source || clips.length === 0) return;

    const maxDur = Math.max(0.1, source.metadata.durationSec);
    const safeStart = clamp(startSec, 0, Math.max(0, maxDur - 0.05));
    const safeEnd = clamp(endSec, safeStart + 0.05, maxDur);

    const nextClips = clips.map((c, idx) =>
      idx === 0 ? { ...c, startSec: safeStart, endSec: safeEnd } : c
    );
    const nextPast = [...past, { config, clips }].slice(-MAX_HISTORY);
    set({
      clips: nextClips,
      past: nextPast,
      future: [],
    });
    scheduleRecoverySave(source, nextClips, config);
  },

  resetConfig: () => {
    const { source, clips, config, past } = get();
    const duration = source?.metadata.durationSec ?? 0;
    const resetClips = source
      ? [{ id: 'clip-0', sourceId: source.id, startSec: 0, endSec: duration }]
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
      past: [...past, { config, clips }].slice(-MAX_HISTORY),
      future: future.slice(1),
    });
  },

  restoreRecovery: () => {
    const { pendingRecovery, source, clips } = get();
    if (!pendingRecovery) return;

    const restoredConfig: EditConfig = {
      ...createDefaultEditConfig(),
      ...pendingRecovery.config,
      crop: {
        ...createDefaultEditConfig().crop,
        ...(pendingRecovery.config.crop || {}),
      },
    };

    const nextClips =
      source && clips.length > 0
        ? [
            {
              ...clips[0],
              startSec: clamp(pendingRecovery.trimStartSec, 0, Math.max(0, source.metadata.durationSec - 0.05)),
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
