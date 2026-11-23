/**
 * Screen Wake Lock API で動画処理中の画面スリープを抑止する。
 * タブが一度非表示になって復帰した際も自動で再取得を試みる。
 */
class WakeLockService {
  private sentinel: WakeLockSentinel | null = null;
  private active = false;

  private handleVisibilityChange = async () => {
    if (this.active && document.visibilityState === 'visible' && !this.sentinel) {
      await this.requestInternal();
    }
  };

  private async requestInternal(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return false;
    }
    try {
      this.sentinel = await navigator.wakeLock.request('screen');
      this.sentinel.addEventListener('release', () => {
        this.sentinel = null;
      });
      return true;
    } catch {
      this.sentinel = null;
      return false;
    }
  }

  async acquire(): Promise<boolean> {
    this.active = true;
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
    return this.requestInternal();
  }

  async release(): Promise<void> {
    this.active = false;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    if (this.sentinel) {
      try {
        await this.sentinel.release();
      } catch {
        // Ignore release errors
      }
      this.sentinel = null;
    }
  }
}

export const wakeLockService = new WakeLockService();
