import type { ReactNode } from 'react';
import { translate, type TranslationKey } from '../../i18n';
import { useJobStore } from '../../store/useJobStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useUiStore, type ControlTab } from '../../store/useUiStore';

interface DockItem {
  id: ControlTab;
  labelKey: TranslationKey;
  videoOnly?: boolean;
  icon: ReactNode;
}

const DOCK_ITEMS: DockItem[] = [
  {
    id: 'output',
    labelKey: 'mobile.dock.output',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
  },
  {
    id: 'trim',
    labelKey: 'mobile.dock.trim',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <line x1="20" y1="4" x2="8.12" y2="15.88" />
        <line x1="14.47" y1="14.48" x2="20" y2="20" />
      </svg>
    ),
  },
  {
    id: 'resize',
    labelKey: 'mobile.dock.resize',
    videoOnly: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 9h3v3M17 15h-3v-3" />
      </svg>
    ),
  },
  {
    id: 'speed',
    labelKey: 'mobile.dock.speed',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 19 22 12 13 5 13 19" />
        <polygon points="2 19 11 12 2 5 2 19" />
      </svg>
    ),
  },
  {
    id: 'transform',
    labelKey: 'mobile.dock.transform',
    videoOnly: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 2v6h-6" />
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M3 22v-6h6" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      </svg>
    ),
  },
  {
    id: 'effects',
    labelKey: 'mobile.dock.effects',
    videoOnly: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
  {
    id: 'multitrack',
    labelKey: 'mobile.dock.multitrack',
    videoOnly: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    ),
  },
  {
    id: 'autosub',
    labelKey: 'mobile.dock.autosub',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <line x1="6" y1="13" x2="14" y2="13" />
        <line x1="6" y1="17" x2="18" y2="17" />
      </svg>
    ),
  },
  {
    id: 'audio',
    labelKey: 'mobile.dock.audio',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      </svg>
    ),
  },
  {
    id: 'compat',
    labelKey: 'mobile.dock.compat',
    videoOnly: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
  {
    id: 'snapshot',
    labelKey: 'mobile.dock.snapshot',
    videoOnly: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
  },
];

interface MobileToolDockProps {
  onExecute: () => void;
}

export function MobileToolDock({ onExecute }: MobileToolDockProps) {
  const { lang, activeTab, mobileSheetOpen, setActiveTab, setMobileSheetOpen } = useUiStore();
  const { source, config } = useProjectStore();
  const { wasmStatus } = useJobStore();

  if (!source) return null;

  const t = (key: TranslationKey) => translate(lang, key);
  const isBusy = wasmStatus === 'loading' || wasmStatus === 'running';
  const isAudioOnly = source.metadata.isAudioOnly;
  const visibleItems = DOCK_ITEMS.filter((item) => !(isAudioOnly && item.videoOnly));

  const handleItemClick = (id: ControlTab) => {
    if (mobileSheetOpen && activeTab === id) {
      setMobileSheetOpen(false);
    } else {
      setActiveTab(id);
      setMobileSheetOpen(true);
    }
  };

  const ctaLabel =
    config.taskType === 'audio-extract'
      ? t('export.runAudioBtn')
      : config.taskType === 'snapshot'
        ? t('export.runSnapshotBtn')
        : t('export.runBtn');

  return (
    <nav className="mobile-tool-dock" aria-label="Mobile editing tools">
      <div className="mobile-dock-scroll">
        {visibleItems.map((item) => {
          const isActive = mobileSheetOpen && activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`mobile-dock-item ${isActive ? 'active' : ''}`}
              aria-pressed={isActive}
              onClick={() => handleItemClick(item.id)}
            >
              {item.icon}
              <span>{t(item.labelKey)}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="btn btn-primary mobile-dock-cta"
        disabled={isBusy}
        onClick={onExecute}
      >
        {ctaLabel}
      </button>
    </nav>
  );
}
