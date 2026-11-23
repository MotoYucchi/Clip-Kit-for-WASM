import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register PWA + COI Service Worker.
// On static hosts without custom headers (e.g. GitHub Pages), once sw.js activates,
// trigger ONE guarded reload so window.crossOriginIsolated becomes true and
// SharedArrayBuffer (@ffmpeg/core-mt multi-threading) unlocks automatically.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const COI_RELOAD_KEY = 'clipkit_coi_reloaded_v3';

    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        if (window.crossOriginIsolated) {
          sessionStorage.removeItem(COI_RELOAD_KEY);
          return;
        }

        const trySingleReload = () => {
          if (window.crossOriginIsolated) return;
          if (sessionStorage.getItem(COI_RELOAD_KEY)) return;
          sessionStorage.setItem(COI_RELOAD_KEY, '1');
          window.location.reload();
        };

        if (navigator.serviceWorker.controller) {
          // Already controlled; if still not isolated, don't reload loop
          return;
        }

        navigator.serviceWorker.addEventListener('controllerchange', trySingleReload, {
          once: true,
        });

        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      })
      .catch(() => undefined);
  });
}
