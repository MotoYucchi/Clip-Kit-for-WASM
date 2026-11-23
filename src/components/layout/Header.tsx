import { useEffect, useRef, useState } from 'react';
import { computePerformanceTuning } from '../../engine/performanceTuner';
import { translate } from '../../i18n';
import { pwaInstallService } from '../../services/pwaInstallService';
import { useJobStore } from '../../store/useJobStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useUiStore } from '../../store/useUiStore';

export function Header() {
  const {
    lang,
    setLang,
    theme,
    setTheme,
    uiMode,
    setUiMode,
    device,
    setShortcutsOpen,
    setBatchModalOpen,
    showToast,
  } = useUiStore();
  const [canInstallPwa, setCanInstallPwa] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  useEffect(() => {
    const unsub = pwaInstallService.subscribe(setCanInstallPwa);
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      unsub();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const { wasmStatus, wasmMode } = useJobStore();
  const {
    source,
    config,
    past,
    future,
    undo,
    redo,
    resetConfig,
    clearSource,
    exportProjectJson,
    importProjectJson,
  } = useProjectStore();
  const jsonInputRef = useRef<HTMLInputElement | null>(null);

  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key);

  const tuning = computePerformanceTuning(
    device,
    config.speedProfile,
    wasmMode,
    config.enableParallelChunks
  );

  const wasmPillClass =
    wasmStatus === 'ready'
      ? 'pill pill-success'
      : wasmStatus === 'loading' || wasmStatus === 'running'
        ? 'pill pill-primary'
        : wasmStatus === 'error'
          ? 'pill pill-danger'
          : 'pill';

  const wasmLabelKey =
    wasmStatus === 'loading'
      ? 'wasm.loading'
      : wasmStatus === 'ready'
        ? 'wasm.ready'
        : wasmStatus === 'running'
          ? 'wasm.running'
          : wasmStatus === 'error'
            ? 'wasm.error'
            : 'wasm.idle';

  const handleSaveProject = () => {
    const json = exportProjectJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clipkit-project-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast(t('project.savedToast'));
  };

  const handleLoadProject = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const text = await files[0].text();
    const res = importProjectJson(text);
    if (res.ok) {
      showToast(t('project.loadedToast'));
    } else if (res.error) {
      showToast(res.error);
    }
  };

  return (
    <>
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="4" width="20" height="16" rx="2.5" />
                <line x1="7" y1="4" x2="7" y2="20" />
                <line x1="17" y1="4" x2="17" y2="20" />
                <polygon points="10.5,9 15.5,12 10.5,15" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <div className="brand-text">
              <h1 className="brand-title">{t('brand.title')}</h1>
              <p className="brand-subtitle">{t('brand.subtitle')}</p>
            </div>
          </div>

          <input
            ref={jsonInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              void handleLoadProject(e.target.files);
              e.target.value = '';
            }}
          />

          {/* Desktop Full Toolbar (>= 1120px) */}
          <div className="header-actions-desktop">
            <span className="pill pill-success" title={t('drop.privacyNote')}>
              <span className="status-dot" aria-hidden="true" />
              {t('header.clientOnly')}
            </span>

            <span className={wasmPillClass} aria-live="polite" title={`${device.cpuCores} cores / ~${device.deviceMemoryGB}GB RAM`}>
              <span className="status-dot" aria-hidden="true" />
              {t(wasmLabelKey)} · {tuning.badgeLabel}
            </span>

            {source && (
              <>
                <div className="segmented" role="group" aria-label="UI Mode">
                  <button
                    type="button"
                    className={`segmented-btn ${uiMode === 'simple' ? 'active' : ''}`}
                    onClick={() => setUiMode('simple')}
                  >
                    {t('header.modeSimple')}
                  </button>
                  <button
                    type="button"
                    className={`segmented-btn ${uiMode === 'advanced' ? 'active' : ''}`}
                    onClick={() => setUiMode('advanced')}
                  >
                    {t('header.modeAdvanced')}
                  </button>
                </div>

                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={past.length === 0}
                  onClick={undo}
                  title={`${t('header.undo')} (Ctrl+Z)`}
                >
                  ↶
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={future.length === 0}
                  onClick={redo}
                  title={`${t('header.redo')} (Ctrl+Shift+Z)`}
                >
                  ↷
                </button>

                <button type="button" className="btn btn-sm" onClick={handleSaveProject}>
                  {t('header.saveProject')}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => jsonInputRef.current?.click()}
                >
                  {t('header.loadProject')}
                </button>

                <button type="button" className="btn btn-sm" onClick={resetConfig}>
                  {t('header.resetConfig')}
                </button>
                <button type="button" className="btn btn-sm" onClick={clearSource}>
                  {t('header.changeFile')}
                </button>
              </>
            )}

            {isOffline && <span className="pill pill-info">{t('header.offline')}</span>}

            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setBatchModalOpen(true)}
            >
              {t('header.batch')}
            </button>

            {canInstallPwa && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => void pwaInstallService.promptInstall()}
              >
                {t('header.installPwa')}
              </button>
            )}

            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setShortcutsOpen(true)}
            >
              ?
            </button>

            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle color theme"
            >
              {theme === 'dark' ? t('header.themeLight') : t('header.themeDark')}
            </button>

            <select
              className="select-control lang-select"
              value={lang}
              onChange={(e) => setLang(e.target.value as 'ja' | 'en')}
              aria-label="Language"
            >
              <option value="ja">日本語</option>
              <option value="en">English</option>
            </select>
          </div>

          {/* Mobile & Tablet Single-Row Compact Bar (< 1120px) */}
          <div className="header-actions-compact">
            <span className={wasmPillClass} style={{ padding: '3px 8px', fontSize: '0.68rem' }}>
              <span className="status-dot" aria-hidden="true" />
              {tuning.badgeLabel}
            </span>

            {source && (
              <>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ minWidth: 38, padding: '4px 8px' }}
                  disabled={past.length === 0}
                  onClick={undo}
                  aria-label={t('header.undo')}
                >
                  ↶
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ minWidth: 38, padding: '4px 8px' }}
                  disabled={future.length === 0}
                  onClick={redo}
                  aria-label={t('header.redo')}
                >
                  ↷
                </button>
              </>
            )}

            <button
              type="button"
              className="btn btn-sm"
              style={{ minWidth: 42, padding: '4px 10px' }}
              onClick={() => setDrawerOpen(true)}
              aria-label={t('mobile.menu')}
            >
              ☰
            </button>
          </div>
        </div>
      </header>

      {/* Mobile / Tablet Slide-Over Overflow Drawer */}
      {drawerOpen && (
        <div
          className="drawer-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={t('mobile.menu')}
          onClick={() => setDrawerOpen(false)}
        >
          <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{t('brand.title')}</strong>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setDrawerOpen(false)}
              >
                ✕ {t('mobile.close')}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span className="pill pill-success">{t('header.clientOnly')}</span>
              <span className={wasmPillClass}>{tuning.badgeLabel}</span>
              {isOffline && <span className="pill pill-info">{t('header.offline')}</span>}
            </div>

            {source && (
              <div className="drawer-section">
                <span className="field-label">UI</span>
                <div className="segmented" style={{ width: '100%' }}>
                  <button
                    type="button"
                    style={{ flex: 1 }}
                    className={`segmented-btn ${uiMode === 'simple' ? 'active' : ''}`}
                    onClick={() => {
                      setUiMode('simple');
                      setDrawerOpen(false);
                    }}
                  >
                    {t('header.modeSimple')}
                  </button>
                  <button
                    type="button"
                    style={{ flex: 1 }}
                    className={`segmented-btn ${uiMode === 'advanced' ? 'active' : ''}`}
                    onClick={() => {
                      setUiMode('advanced');
                      setDrawerOpen(false);
                    }}
                  >
                    {t('header.modeAdvanced')}
                  </button>
                </div>

                <button
                  type="button"
                  className="btn btn-block"
                  onClick={() => {
                    clearSource();
                    setDrawerOpen(false);
                  }}
                >
                  {t('header.changeFile')}
                </button>
                <button
                  type="button"
                  className="btn btn-block"
                  onClick={() => {
                    resetConfig();
                    setDrawerOpen(false);
                  }}
                >
                  {t('header.resetConfig')}
                </button>
              </div>
            )}

            <div className="drawer-section">
              <button
                type="button"
                className="btn btn-block"
                onClick={() => {
                  setDrawerOpen(false);
                  setBatchModalOpen(true);
                }}
              >
                {t('header.batch')}
              </button>

              {source && (
                <>
                  <button
                    type="button"
                    className="btn btn-block"
                    onClick={() => {
                      handleSaveProject();
                      setDrawerOpen(false);
                    }}
                  >
                    {t('header.saveProject')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-block"
                    onClick={() => {
                      jsonInputRef.current?.click();
                      setDrawerOpen(false);
                    }}
                  >
                    {t('header.loadProject')}
                  </button>
                </>
              )}

              {canInstallPwa && (
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={() => {
                    void pwaInstallService.promptInstall();
                    setDrawerOpen(false);
                  }}
                >
                  {t('header.installPwa')}
                </button>
              )}
            </div>

            <div className="drawer-section">
              <div className="field-row">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                >
                  {theme === 'dark' ? t('header.themeLight') : t('header.themeDark')}
                </button>
                <select
                  className="select-control"
                  value={lang}
                  onChange={(e) => setLang(e.target.value as 'ja' | 'en')}
                  aria-label="Language"
                >
                  <option value="ja">日本語</option>
                  <option value="en">English</option>
                </select>
              </div>

              <a href="licenses.html" className="btn btn-block" style={{ textDecoration: 'none' }}>
                {t('footer.licenses')}
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
