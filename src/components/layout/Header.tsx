import { useEffect, useRef, useState } from 'react';
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

  const tierLabel = t(
    device.tier === 'mobile'
      ? 'device.mobile'
      : device.tier === 'tablet'
        ? 'device.tablet'
        : 'device.pc'
  );

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

        <div className="header-actions">
          <span className="pill pill-success" title={t('drop.privacyNote')}>
            <span className="status-dot" aria-hidden="true" />
            {t('header.clientOnly')}
          </span>

          <span className={wasmPillClass} aria-live="polite">
            <span className="status-dot" aria-hidden="true" />
            {t(wasmLabelKey)} · {wasmMode === 'mt' ? 'MT' : 'ST'}
          </span>

          <span
            className="pill"
            title={`${device.cpuCores} cores / ~${device.deviceMemoryGB}GB RAM`}
          >
            {tierLabel}
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
                ↶ {t('header.undo')}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={future.length === 0}
                onClick={redo}
                title={`${t('header.redo')} (Ctrl+Shift+Z)`}
              >
                ↷ {t('header.redo')}
              </button>

              <button type="button" className="btn btn-sm" onClick={handleSaveProject}>
                {t('header.saveProject')}
              </button>
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
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => jsonInputRef.current?.click()}
              >
                {t('header.loadProject')}
              </button>

              <button
                type="button"
                className="btn btn-sm"
                onClick={resetConfig}
                title={t('header.resetConfig')}
              >
                {t('header.resetConfig')}
              </button>
              <button type="button" className="btn btn-sm" onClick={clearSource}>
                {t('header.changeFile')}
              </button>
            </>
          )}

          {isOffline && (
            <span className="pill pill-info">{t('header.offline')}</span>
          )}

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

          {device.tier !== 'mobile' && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setShortcutsOpen(true)}
            >
              {t('header.shortcuts')}
            </button>
          )}

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
      </div>
    </header>
  );
}
