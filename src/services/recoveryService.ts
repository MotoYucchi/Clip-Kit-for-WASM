import type { EditConfig } from '../types/edit';

const STORAGE_KEY = 'clipkit_recovery_v1';

export interface RecoverySnapshot {
  savedAt: number;
  lastFileName: string;
  trimStartSec: number;
  trimEndSec: number;
  config: EditConfig;
}

export function saveRecoverySnapshot(snapshot: RecoverySnapshot): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

export function loadRecoverySnapshot(): RecoverySnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RecoverySnapshot;
    if (!parsed || typeof parsed !== 'object' || !parsed.config) {
      return null;
    }
    // Discard snapshots older than 7 days
    if (Date.now() - parsed.savedAt > 7 * 24 * 60 * 60 * 1000) {
      clearRecoverySnapshot();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearRecoverySnapshot(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}
