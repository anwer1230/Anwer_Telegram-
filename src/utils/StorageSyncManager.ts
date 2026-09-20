/**
 * StorageSyncManager.ts - Synchronization between memory state and persistent disk
 */

export class StorageSyncManager {
  private static instance: StorageSyncManager;

  public static getInstance(): StorageSyncManager {
    if (!StorageSyncManager.instance) {
      StorageSyncManager.instance = new StorageSyncManager();
    }
    return StorageSyncManager.instance;
  }

  public syncAll(): void {}

  public getAllDrafts(): Record<string, string> {
    return {};
  }

  public setDraft(chatId: string, text: string): void {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`tg_draft_${chatId}`, text);
      } catch {}
    }
  }

  public async loadSettings(): Promise<any | null> {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem('tg_app_settings');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  public saveSettings(settings: any): void {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('tg_app_settings', JSON.stringify(settings));
      } catch {}
    }
  }

  public saveSessions(...args: any[]): void {
    if (typeof window !== 'undefined' && args.length > 0) {
      try {
        localStorage.setItem('tg_sessions', JSON.stringify(args[0]));
      } catch {}
    }
  }

  public clearAllOnLogout(): void {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('tg_sessions');
        localStorage.removeItem('tg_active_account');
      } catch {}
    }
  }
}

export const storageSyncManager = StorageSyncManager.getInstance();
