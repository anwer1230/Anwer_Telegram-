/**
 * Offline / IndexedDB Caching System for Telegram Web
 * Stores dialogs, chat messages, and media blobs locally for instant 0ms startup
 * and full offline access without network connection.
 */

import { TelegramDialog, TelegramMessage } from '../types';

const DB_NAME = 'TelegramWeb_IndexedDB_Cache';
const DB_VERSION = 2;

export interface CachedMediaItem {
  key: string;
  dataUrl: string;
  mimeType: string;
  timestamp: number;
}

export interface ChatSearchOptions {
  query?: string;
  date?: string; // YYYY-MM-DD
  minDate?: number; // unix seconds
  maxDate?: number; // unix seconds
  typeFilter?: 'all' | 'text' | 'media' | 'files' | 'links';
  limit?: number;
}

/**
 * Normalizes text for comprehensive multilingual and Arabic search
 * Handles Arabic diacritics, Alef variants, Ta Marbuta, Ya, and letter-casing.
 */
export function normalizeSearchText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u064B-\u065F\u0670]/g, '') // remove arabic tashkeel (fatha, damma, kasra, sukun, etc.)
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width spaces
    .trim();
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
        const tx = (event.target as any).transaction as IDBTransaction;

        // 1. Dialogs store
        if (!db.objectStoreNames.contains('dialogs')) {
          const dialogsStore = db.createObjectStore('dialogs', { keyPath: 'id' });
          dialogsStore.createIndex('date', 'date', { unique: false });
          dialogsStore.createIndex('pinned', 'pinned', { unique: false });
        }

        // 2. Messages store: key is composite `${chatId}_${id}`
        let msgStore: IDBObjectStore;
        if (!db.objectStoreNames.contains('messages')) {
          msgStore = db.createObjectStore('messages', { keyPath: 'storeKey' });
          msgStore.createIndex('chatId', 'chatId', { unique: false });
          msgStore.createIndex('date', 'date', { unique: false });
          msgStore.createIndex('id', 'id', { unique: false });
          msgStore.createIndex('chatId_date', ['chatId', 'date'], { unique: false });
        } else {
          msgStore = tx.objectStore('messages');
          if (!msgStore.indexNames.contains('chatId_date')) {
            try {
              msgStore.createIndex('chatId_date', ['chatId', 'date'], { unique: false });
            } catch (err) {
              console.warn('Could not create chatId_date index:', err);
            }
          }
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
   * Search messages inside a chat using IndexedDB indexes
   * Fast indexed querying by date range, keywords, and media types
   */
  async searchChatMessages(chatId: string, options: ChatSearchOptions = {}): Promise<TelegramMessage[]> {
    try {
      const cleanChatId = chatId.replace(/^-100/, '').replace(/^-/, '');
      const db = await this.getDB();
      const tx = db.transaction('messages', 'readonly');
      const store = tx.objectStore('messages');

      let minDate = options.minDate;
      let maxDate = options.maxDate;

      // If a specific date is chosen (YYYY-MM-DD), calculate local start and end of that day
      if (options.date) {
        const [year, month, day] = options.date.split('-').map(Number);
        if (year && month && day) {
          const startDate = new Date(year, month - 1, day, 0, 0, 0, 0);
          const endDate = new Date(year, month - 1, day, 23, 59, 59, 999);
          const dayStartSec = Math.floor(startDate.getTime() / 1000);
          const dayEndSec = Math.floor(endDate.getTime() / 1000);
          minDate = minDate ? Math.max(minDate, dayStartSec) : dayStartSec;
          maxDate = maxDate ? Math.min(maxDate, dayEndSec) : dayEndSec;
        }
      }

      let request: IDBRequest<any[]>;

      // Utilize compound index 'chatId_date' if both minDate and maxDate are defined
      if (
        store.indexNames.contains('chatId_date') &&
        minDate !== undefined &&
        maxDate !== undefined
      ) {
        const keyRange = IDBKeyRange.bound([cleanChatId, minDate], [cleanChatId, maxDate]);
        request = store.index('chatId_date').getAll(keyRange);
      } else if (store.indexNames.contains('chatId')) {
        // Query by chatId index
        request = store.index('chatId').getAll(IDBKeyRange.only(cleanChatId));
      } else {
        request = store.getAll();
      }

      return new Promise((resolve) => {
        request.onsuccess = () => {
          let items = (request.result || []) as any[];

          // 1. Ensure chatId match if not indexed
          items = items.filter((item) => {
            const itemChatId = item.chatId || (item.storeKey ? item.storeKey.split('_')[0] : '');
            return itemChatId === cleanChatId;
          });

          // 2. Date filtering (if not handled by compound index)
          if (minDate !== undefined) {
            items = items.filter((m) => (m.date || 0) >= minDate!);
          }
          if (maxDate !== undefined) {
            items = items.filter((m) => (m.date || 0) <= maxDate!);
          }

          // 3. Keyword filtering with Arabic normalization
          if (options.query && options.query.trim()) {
            const normQ = normalizeSearchText(options.query);
            items = items.filter((m) => {
              const text = normalizeSearchText(m.text || '');
              const caption = normalizeSearchText(m.mediaInfo?.caption || '');
              const fileName = normalizeSearchText(m.mediaInfo?.fileName || '');
              const sender = normalizeSearchText(m.senderName || m.authorName || '');
              return (
                text.includes(normQ) ||
                caption.includes(normQ) ||
                fileName.includes(normQ) ||
                sender.includes(normQ)
              );
            });
          }

          // 4. Media/Type filter
          if (options.typeFilter && options.typeFilter !== 'all') {
            switch (options.typeFilter) {
              case 'text':
                items = items.filter((m) => !m.mediaType && !!m.text);
                break;
              case 'media':
                items = items.filter(
                  (m) =>
                    m.mediaType === 'photo' ||
                    m.mediaType === 'video' ||
                    m.mediaType === 'round' ||
                    m.mediaType === 'voice'
                );
                break;
              case 'files':
                items = items.filter(
                  (m) => m.mediaType === 'document' || !!m.mediaInfo?.fileName
                );
                break;
              case 'links':
                items = items.filter((m) =>
                  /(https?:\/\/[^\s]+|t\.me\/[^\s]+)/i.test(m.text || '')
                );
                break;
            }
          }

          // 5. Sort chronologically (newest first for search results)
          items.sort((a, b) => (b.date || 0) - (a.date || 0));

          // 6. Limit results
          const limit = options.limit || 100;
          const mapped = items.slice(0, limit).map((item) => {
            const { storeKey, chatId: cid, rawChatId, ...msg } = item;
            return msg as TelegramMessage;
          });

          resolve(mapped);
        };

        request.onerror = () => {
          resolve([]);
        };
      });
    } catch (err) {
      console.warn('IndexedDB searchChatMessages error:', err);
      return [];
    }
  }

  /**
   * Get surrounding messages around a message ID from IndexedDB
   * Useful when jumping to an older message from search results
   */
  async getMessageContext(chatId: string, messageId: number, windowSize = 25): Promise<TelegramMessage[]> {
    try {
      const cleanChatId = chatId.replace(/^-100/, '').replace(/^-/, '');
      const db = await this.getDB();
      const tx = db.transaction('messages', 'readonly');
      const store = tx.objectStore('messages');
      const index = store.index('chatId');
      const request = index.getAll(IDBKeyRange.only(cleanChatId));

      return new Promise((resolve) => {
        request.onsuccess = () => {
          const items = (request.result || []) as any[];
          // Sort chronologically ascending (oldest first)
          items.sort((a, b) => (a.date || 0) - (b.date || 0));

          const targetIndex = items.findIndex((m) => m.id === messageId);
          if (targetIndex === -1) {
            resolve([]);
            return;
          }

          const startIndex = Math.max(0, targetIndex - windowSize);
          const endIndex = Math.min(items.length, targetIndex + windowSize + 1);
          const slice = items.slice(startIndex, endIndex).map((item) => {
            const { storeKey, chatId: cid, rawChatId, ...msg } = item;
            return msg as TelegramMessage;
          });

          resolve(slice);
        };

        request.onerror = () => {
          resolve([]);
        };
      });
    } catch (err) {
      console.warn('IndexedDB getMessageContext error:', err);
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
