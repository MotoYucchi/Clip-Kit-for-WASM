import { translate } from '../../i18n';
import { useUiStore } from '../../store/useUiStore';

export function NoticeStrip() {
  const { lang } = useUiStore();
  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key);

  return (
    <aside className="notice-strip" aria-label="Notice">
      <div className="notice-strip-text">
        <span className="notice-pill">{t('notice.badge')}</span>
        <span>{t('notice.text')}</span>
      </div>
      <a href="licenses.html" className="footer-link">
        {t('notice.link')}
      </a>
    </aside>
  );
}

export function Footer() {
  const { lang } = useUiStore();
  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key);

  return (
    <footer className="app-footer">
      <div className="footer-inner">
        <span>
          WASM Clip Kit <strong>by MotoYucchi</strong> &mdash; Powered by FFmpeg.wasm
        </span>
        <div className="footer-links">
          <span>{t('footer.privacy')}</span>
          <a href="licenses.html" className="footer-link">
            {t('footer.licenses')}
          </a>
          <a
            href="https://github.com/MotoYucchi/Clip-Kit-for-WASM"
            className="footer-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
