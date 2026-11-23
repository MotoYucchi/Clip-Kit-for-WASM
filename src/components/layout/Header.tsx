import { translate } from '../../i18n';
import { useJobStore } from '../../store/useJobStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useUiStore } from '../../store/useUiStore';

export function Header() {
  const { lang, setLang, theme, setTheme, uiMode, setUiMode, device } = useUiStore();
  const { wasmStatus, wasmMode } = useJobStore();
  const { source, resetConfig, clearSource } = useProjectStore();
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

  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

          <span className="pill" title={`${device.cpuCores} cores / ~${device.deviceMemoryGB}GB RAM`}>
            {tierLabel}
          </span>

          {source && (
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
          )}

          {source && (
            <>
              <button
                type="button"
                className="btn btn-sm"
                onClick={resetConfig}
                title={t('header.resetConfig')}
              >
                {t('header.resetConfig')}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={clearSource}
              >
                {t('header.changeFile')}
              </button>
            </>
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
