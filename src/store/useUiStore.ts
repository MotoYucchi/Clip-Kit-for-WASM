import { create } from 'zustand';
import { detectInitialLanguage, persistLanguage, type Language } from '../i18n';
import { detectDeviceProfile } from '../services/deviceDetector';
import type { DeviceProfile } from '../types/device';

export type UiMode = 'simple' | 'advanced';
export type ThemeMode = 'dark' | 'light';
export type ControlTab =
  | 'output'
  | 'trim'
  | 'resize'
  | 'speed'
  | 'transform'
  | 'effects'
  | 'audio'
  | 'multitrack'
  | 'compat'
  | 'snapshot';

const THEME_KEY = 'clipkit_theme';

function loadInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Ignore
  }
  return 'dark';
}

interface UiState {
  device: DeviceProfile;
  lang: Language;
  theme: ThemeMode;
  uiMode: UiMode;
  activeTab: ControlTab;
  mobileSheetOpen: boolean;
  shortcutsOpen: boolean;
  batchModalOpen: boolean;
  toastMessage: string | null;

  setLang: (lang: Language) => void;
  setTheme: (theme: ThemeMode) => void;
  setUiMode: (mode: UiMode) => void;
  setActiveTab: (tab: ControlTab) => void;
  setMobileSheetOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setBatchModalOpen: (open: boolean) => void;
  showToast: (message: string) => void;
  refreshDevice: () => void;
}

let toastTimer: number | null = null;
const initialDevice = detectDeviceProfile();
const initialTheme = loadInitialTheme();

if (typeof document !== 'undefined') {
  document.documentElement.dataset.theme = initialTheme;
}

export const useUiStore = create<UiState>((set) => ({
  device: initialDevice,
  lang: detectInitialLanguage(),
  theme: initialTheme,
  uiMode: initialDevice.tier === 'mobile' ? 'simple' : 'advanced',
  activeTab: 'output',
  mobileSheetOpen: false,
  shortcutsOpen: false,
  batchModalOpen: false,
  toastMessage: null,

  setLang: (lang) => {
    persistLanguage(lang);
    set({ lang });
  },

  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Ignore
    }
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = theme;
    }
    set({ theme });
  },

  setUiMode: (uiMode) => set({ uiMode }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setMobileSheetOpen: (mobileSheetOpen) => set({ mobileSheetOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setBatchModalOpen: (batchModalOpen) => set({ batchModalOpen }),

  showToast: (toastMessage) => {
    if (typeof window !== 'undefined' && toastTimer !== null) {
      window.clearTimeout(toastTimer);
    }
    set({ toastMessage });
    if (typeof window !== 'undefined') {
      toastTimer = window.setTimeout(() => set({ toastMessage: null }), 3800);
    }
  },

  refreshDevice: () => set({ device: detectDeviceProfile() }),
}));
