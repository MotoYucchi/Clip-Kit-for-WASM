import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { detectInitialLanguage, persistLanguage, translate, type Language } from './i18n';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';

function LicensesPage() {
  const [lang, setLangState] = useState<Language>(detectInitialLanguage);
  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key);

  const handleLangChange = (next: Language) => {
    persistLanguage(next);
    setLangState(next);
  };

  return (
    <div className="app-shell">
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
              <h1 className="brand-title">{t('brand.licensesTitle')}</h1>
              <p className="brand-subtitle">WASM Clip Kit by MotoYucchi</p>
            </div>
          </div>

          <div className="header-actions">
            <select
              className="select-control lang-select"
              value={lang}
              onChange={(e) => handleLangChange(e.target.value as Language)}
              aria-label="Language"
            >
              <option value="ja">日本語</option>
              <option value="en">English</option>
            </select>
            <a href="index.html" className="btn btn-sm">
              ← {t('header.backToApp')}
            </a>
          </div>
        </div>
      </header>

      <main className="app-main">
        {/* Privacy & Storage */}
        <section className="panel" aria-labelledby="privacy-heading">
          <div className="panel-header">
            <h2 id="privacy-heading" className="panel-title">
              {t('licenses.privacyHeading')}
            </h2>
          </div>
          <div className="legal-prose">
            <ul>
              <li dangerouslySetInnerHTML={{ __html: t('licenses.privacy1') }} />
              <li dangerouslySetInnerHTML={{ __html: t('licenses.privacy2') }} />
              <li dangerouslySetInnerHTML={{ __html: t('licenses.privacy3') }} />
              <li dangerouslySetInnerHTML={{ __html: t('licenses.privacy4') }} />
            </ul>
          </div>
        </section>

        {/* Device & Performance Notice */}
        <section className="panel" aria-labelledby="notice-heading">
          <div className="panel-header">
            <h2 id="notice-heading" className="panel-title">
              {t('licenses.noticeHeading')}
            </h2>
          </div>
          <div className="legal-prose">
            <ul>
              <li dangerouslySetInnerHTML={{ __html: t('licenses.notice1') }} />
              <li dangerouslySetInnerHTML={{ __html: t('licenses.notice2') }} />
              <li dangerouslySetInnerHTML={{ __html: t('licenses.notice3') }} />
            </ul>
          </div>
        </section>

        {/* Third-Party Licenses (Music Converter unified card format) */}
        <section className="panel" aria-labelledby="licenses-heading">
          <div className="panel-header">
            <h2 id="licenses-heading" className="panel-title">
              {t('licenses.libsHeading')}
            </h2>
          </div>

          <div className="license-cards">
            <article className="license-card">
              <div className="license-card-head">
                <h3>WASM Clip Kit</h3>
                <span className="track-badge">MIT License</span>
              </div>
              <p className="license-desc">Copyright (c) 2026 MotoYucchi</p>
              <p className="license-meta">
                Repository:{' '}
                <a
                  href="https://github.com/MotoYucchi/Clip-Kit-for-WASM"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  github.com/MotoYucchi/Clip-Kit-for-WASM
                </a>
              </p>
            </article>

            <article className="license-card">
              <div className="license-card-head">
                <h3>@ffmpeg/ffmpeg &amp; @ffmpeg/util</h3>
                <span className="track-badge">MIT License</span>
              </div>
              <p className="license-desc">
                Browser WebAssembly worker wrapper and utilities for FFmpeg (v0.12.15 / v0.12.2).
              </p>
              <p className="license-meta">
                Repository:{' '}
                <a
                  href="https://github.com/ffmpegwasm/ffmpeg.wasm"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  github.com/ffmpegwasm/ffmpeg.wasm
                </a>
              </p>
            </article>

            <article className="license-card">
              <div className="license-card-head">
                <h3>@ffmpeg/core &amp; @ffmpeg/core-mt (FFmpeg WebAssembly Core)</h3>
                <span className="track-badge">GPL-2.0-or-later</span>
              </div>
              <p className="license-desc">
                FFmpeg WebAssembly binary (v0.12.10) compiled with video, audio, subtitle, and image
                libraries including <code>libx264</code> (GPL), <code>libx265</code> (GPL),{' '}
                <code>libvpx</code> (BSD-3-Clause), <code>libmp3lame</code> (LGPL),{' '}
                <code>libtheora</code> (BSD-3-Clause), <code>libvorbis</code> (BSD-3-Clause),{' '}
                <code>libopus</code> (BSD-3-Clause), <code>libwebp</code> (BSD-3-Clause),{' '}
                <code>libfreetype</code> (FTL/GPL), <code>libfribidi</code> (LGPL),{' '}
                <code>libass</code> (ISC), <code>libzimg</code> (WTFPL), <code>zlib</code> (Zlib),{' '}
                <code>aac</code>, <code>flac</code>, <code>pcm_*</code>, <code>png</code>,{' '}
                <code>mjpeg</code>, and <code>gif</code>.
              </p>
              <p className="license-meta">
                Project:{' '}
                <a href="https://ffmpeg.org/" target="_blank" rel="noopener noreferrer">
                  ffmpeg.org
                </a>{' '}
                /{' '}
                <a
                  href="https://github.com/ffmpegwasm/ffmpeg.wasm-core"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  github.com/ffmpegwasm/ffmpeg.wasm-core
                </a>
              </p>
            </article>

            <article className="license-card">
              <div className="license-card-head">
                <h3>React &amp; React DOM</h3>
                <span className="track-badge">MIT License</span>
              </div>
              <p className="license-desc">
                Declarative UI rendering library for browser interfaces (v18.3.x).
              </p>
              <p className="license-meta">
                Repository:{' '}
                <a
                  href="https://github.com/facebook/react"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  github.com/facebook/react
                </a>
              </p>
            </article>

            <article className="license-card">
              <div className="license-card-head">
                <h3>Zustand</h3>
                <span className="track-badge">MIT License</span>
              </div>
              <p className="license-desc">
                Lightweight reactive state management store (v5.0.x).
              </p>
              <p className="license-meta">
                Repository:{' '}
                <a
                  href="https://github.com/pmndrs/zustand"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  github.com/pmndrs/zustand
                </a>
              </p>
            </article>

            <article className="license-card">
              <div className="license-card-head">
                <h3>Google Fonts (Inter / Noto Sans JP / JetBrains Mono)</h3>
                <span className="track-badge">SIL OFL 1.1</span>
              </div>
              <p className="license-desc">
                UI and monospace typography licensed under the SIL Open Font License, Version 1.1.
              </p>
              <p className="license-meta">
                Source:{' '}
                <a href="https://fonts.google.com/" target="_blank" rel="noopener noreferrer">
                  fonts.google.com
                </a>
              </p>
            </article>

            <article className="license-card">
              <div className="license-card-head">
                <h3>Build &amp; Test Tooling (Vite / @vitejs/plugin-react / TypeScript / Vitest)</h3>
                <span className="track-badge">MIT / Apache-2.0</span>
              </div>
              <p className="license-desc">
                Static site bundling, type checking, and automated test runner used at build time:
                Vite (MIT), @vitejs/plugin-react (MIT), Vitest (MIT), TypeScript (Apache-2.0).
              </p>
              <p className="license-meta">
                Projects:{' '}
                <a href="https://vite.dev/" target="_blank" rel="noopener noreferrer">
                  vite.dev
                </a>{' '}
                /{' '}
                <a href="https://www.typescriptlang.org/" target="_blank" rel="noopener noreferrer">
                  typescriptlang.org
                </a>
              </p>
            </article>
          </div>
        </section>
      </main>

      <footer className="app-footer">
        <div className="footer-inner">
          <span>
            WASM Clip Kit <strong>by MotoYucchi</strong> &mdash; 100% Client-Side
          </span>
          <a href="index.html" className="footer-link">
            {t('header.backToApp')}
          </a>
        </div>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LicensesPage />
  </StrictMode>
);
