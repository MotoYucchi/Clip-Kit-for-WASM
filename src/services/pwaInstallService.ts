export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

class PwaInstallService {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private listeners = new Set<(canInstall: boolean) => void>();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        this.deferredPrompt = event as BeforeInstallPromptEvent;
        this.notify();
      });
      window.addEventListener('appinstalled', () => {
        this.deferredPrompt = null;
        this.notify();
      });
    }
  }

  private notify() {
    const available = this.canInstall();
    for (const cb of this.listeners) cb(available);
  }

  canInstall(): boolean {
    return this.deferredPrompt !== null;
  }

  subscribe(cb: (canInstall: boolean) => void): () => void {
    this.listeners.add(cb);
    cb(this.canInstall());
    return () => this.listeners.delete(cb);
  }

  async promptInstall(): Promise<boolean> {
    if (!this.deferredPrompt) return false;
    await this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    this.notify();
    return outcome === 'accepted';
  }
}

export const pwaInstallService = new PwaInstallService();
