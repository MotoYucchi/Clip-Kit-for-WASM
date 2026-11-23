import { translate } from '../../i18n';
import { useUiStore } from '../../store/useUiStore';

export function ShortcutsModal() {
  const { lang, shortcutsOpen, setShortcutsOpen } = useUiStore();
  if (!shortcutsOpen) return null;

  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key);

  const items: Array<{ keys: string; desc: string }> = [
    { keys: 'Space', desc: t('shortcuts.playPause') },
    { keys: 'J / K / L', desc: t('shortcuts.jkl') },
    { keys: 'I / O', desc: t('shortcuts.io') },
    { keys: '← / →', desc: t('shortcuts.arrows') },
    { keys: 'S', desc: t('shortcuts.split') },
    { keys: 'Ctrl+Z / Ctrl+Shift+Z', desc: t('shortcuts.undoRedo') },
    { keys: '?', desc: t('shortcuts.help') },
  ];

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
      onClick={() => setShortcutsOpen(false)}
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header" style={{ marginBottom: 0 }}>
          <h2 id="shortcuts-modal-title" className="panel-title">
            {t('shortcuts.title')}
          </h2>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setShortcutsOpen(false)}
          >
            {t('shortcuts.close')}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item) => (
            <div
              key={item.keys}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                padding: '8px 10px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <span style={{ fontSize: '0.86rem' }}>{item.desc}</span>
              <kbd
                className="mono"
                style={{
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-strong)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                }}
              >
                {item.keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
