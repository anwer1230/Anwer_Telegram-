/**
 * Offline / IndexedDB Caching System for Telegram Web
 * Stores dialogs, chat messages, and media blobs locally for instant 0ms startup
 * and full offline access without network connection.
 */

import { TelegramDialog, TelegramMessage } from '../types';

const DB_NAME = 'TelegramWeb_IndexedDB_Cache';
const DB_VERSION = 1;

export interface CachedMediaItem {
  key: string;
  dataUrl: string;
  mimeType: string;
  timestamp: number;
}

class IndexedDbCacheService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    if (typeof window === 'undefined' || !window.indexedDB) {
      return Promise.reject(new Error('IndexedDB not supported'));
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 1. Dialogs store
        if (!db.objectStoreNames.contains('dialogs')) {
          const dialogsStore = db.createObjectStore('dialogs', { keyPath: 'id' });
          dialogsStore.createIndex('date', 'date', { unique: false });
          dialogsStore.createIndex('pinned', 'pinned', { unique: false });
        }

        // 2. Messages store: key is composite `${chatId}_${id}`
        if (!db.objectStoreNames.contains('messages')) {
          const msgStore = db.createObjectStore('messages', { keyPath: 'storeKey' });
          msgStore.createIndex('chatId', 'chatId', { unique: false });
          msgStore.createIndex('date', 'date', { unique: false });
          msgStore.createIndex('id', 'id', { unique: false });
        }

        // 3. Media Cache store
        if (!db.objectStoreNames.contains('media_cache')) {
          db.createObjectStore('media_cache', { keyPath: 'key' });
        }

        // 4. Metadata store (auth session, me user info, timestamps)
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  /**
   * Save dialogs list into IndexedDB
   */
  async saveDialogs(dialogs: TelegramDialog[]): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(['dialogs', 'metadata'], 'readwrite');
      const store = tx.objectStore('dialogs');

      for (const d of dialogs) {
        store.put(d);
      }

      // Save last sync timestamp
      const metaStore = tx.objectStore('metadata');
      metaStore.put({ key: 'last_dialogs_sync', timestamp: Date.now() });

      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('IndexedDB saveDialogs error:', err);
    }
  }

  /**
   * Get all cached dialogs from IndexedDB
   */
  async getCachedDialogs(): Promise<TelegramDialog[]> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('dialogs', 'readonly');
      const store = tx.objectStore('dialogs');
      const request = store.getAll();

      return new Promise((resolve) => {
        request.onsuccess = () => {
          const result = (request.result || []) as TelegramDialog[];
          // Sort by pinned desc then date desc
          result.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return (b.date || 0) - (a.date || 0);
          });
          resolve(result);
        };
        request.onerror = () => {
          resolve([]);
        };
      });
    } catch (err) {
      console.warn('IndexedDB getCachedDialogs error:', err);
      return [];
    }
  }

  /**
   * Save messages for a specific chat into IndexedDB
   */
  async saveMessages(chatId: string, messages: TelegramMessage[]): Promise<void> {
    try {
      const cleanChatId = chatId.replace(/^-100/, '').replace(/^-/, '');
      const db = await this.getDB();
      const tx = db.transaction('messages', 'readwrite');
      const store = tx.objectStore('messages');

      for (const msg of messages) {
        const storeKey = `${cleanChatId}_${msg.id}`;
        store.put({
          storeKey,
          chatId: cleanChatId,
          rawChatId: chatId,
          ...msg,
        });
      }

      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('IndexedDB saveMessages error:', err);
    }
  }

  /**
   * Get cached messages for a chat sorted chronologically (oldest first)
   */
  async getCachedMessages(chatId: string, limit = 50): Promise<TelegramMessage[]> {
    try {
      const cleanChatId = chatId.replace(/^-100/, '').replace(/^-/, '');
      const db = await this.getDB();
      const tx = db.transaction('messages', 'readonly');
      const store = tx.objectStore('messages');
      const index = store.index('chatId');
      const request = index.getAll(IDBKeyRange.only(cleanChatId));

      return new Promise((resolve) => {
        request.onsuccess = () => {
          const results = request.result || [];
          // Sort chronologically (oldest to newest)
          results.sort((a: any, b: any) => (a.date || 0) - (b.date || 0));

          // Take last `limit` messages
          const sliced = results.slice(-limit).map((item: any) => {
            const { storeKey, chatId: cid, rawChatId, ...msg } = item;
            return msg as TelegramMessage;
          });
          resolve(sliced);
        };
        request.onerror = () => {
          resolve([]);
        };
      });
    } catch (err) {
      console.warn('IndexedDB getCachedMessages error:', err);
      return [];
    }
  }

  /**
   * Cache media base64 or blob URL into IndexedDB
   */
  async cacheMedia(key: string, dataUrl: string, mimeType: string): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('media_cache', 'readwrite');
      const store = tx.objectStore('media_cache');
      store.put({
        key,
        dataUrl,
        mimeType,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.warn('IndexedDB cacheMedia error:', err);
    }
  }

  /**
   * Retrieve cached media from IndexedDB
   */
  async getCachedMedia(key: string): Promise<CachedMediaItem | null> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('media_cache', 'readonly');
      const store = tx.objectStore('media_cache');
      const request = store.get(key);

      return new Promise((resolve) => {
        request.onsuccess = () => {
          resolve(request.result || null);
        };
        request.onerror = () => {
          resolve(null);
        };
      });
    } catch (err) {
      console.warn('IndexedDB getCachedMedia error:', err);
      return null;
    }
  }

  /**
   * Clear all cached data (useful on logout)
   */
  async clearAllCache(): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(['dialogs', 'messages', 'media_cache', 'metadata'], 'readwrite');
      tx.objectStore('dialogs').clear();
      tx.objectStore('messages').clear();
      tx.objectStore('media_cache').clear();
      tx.objectStore('metadata').clear();
    } catch (err) {
      console.warn('IndexedDB clearAllCache error:', err);
    }
  }

  /**
   * Check if browser is online
   */
  isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }
}

export const indexedDbCache = new IndexedDbCacheService();
