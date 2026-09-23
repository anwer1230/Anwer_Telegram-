import {
  TelegramDialog,
  TelegramMessage,
  TelegramServerStatus,
  TelegramUser,
  TelegramStickerSet,
  TelegramStickerDocument,
  TelegramGifItem,
  TypingStatus,
  ChatFolder,
  GlobalSearchResult,
  VoiceChatSpace,
  TelegramContact,
  TelegramActiveSession,
  TelegramPrivacySettings,
  TelegramWebPage,
  TelegramChatInfo,
} from '../types';

const SESSION_STORAGE_KEY = 'telegram_mtproto_session';

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 25000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Timeout: ${timeoutMs}ms exceeded`));
  }, timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.message?.includes('aborted')) {
      throw new Error(`انتهت مهلة الاتصال بالخادم (${Math.round(timeoutMs / 1000)} ثانية)`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const telegramApi = {
  getSession(): string | null {
    return localStorage.getItem(SESSION_STORAGE_KEY);
  },

  setSession(session: string): void {
    localStorage.setItem(SESSION_STORAGE_KEY, session);
  },

  clearSession(): void {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  },

  getHeaders(): HeadersInit {
    const session = this.getSession();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (session) {
      headers['x-telegram-session'] = session;
    }
    return headers;
  },

  async getStatus(): Promise<TelegramServerStatus> {
    const res = await fetchWithTimeout('/api/telegram/status', {
      // Include the persisted session so a browser reload restores the account.
      headers: this.getHeaders(),
    }, 4000);
    if (!res.ok) {
      throw new Error(`خطأ في جلب حالة الخادم: ${res.statusText}`);
    }
    return res.json();
  },

  async sendCode(phone: string): Promise<{ success: boolean; phoneCodeHash: string; isCodeViaApp: boolean; timeout: number }> {
    const res = await fetchWithTimeout('/api/telegram/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    }, 15000);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل إرسال كود التحقق');
    }
    return data;
  },

  async signIn(phone: string, code: string, phoneCodeHash: string): Promise<{ success: boolean; user?: TelegramUser; sessionString?: string; needsPassword?: boolean; hint?: string }> {
    const res = await fetchWithTimeout('/api/telegram/auth/sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code, phoneCodeHash }),
    }, 15000);
    const data = await res.json();
    if (!res.ok && !data.needsPassword) {
      throw new Error(data.error || 'فشل تسجيل الدخول');
    }
    if (data.sessionString) {
      this.setSession(data.sessionString);
    }
    return data;
  },

  async checkPassword(phone: string, password: string): Promise<{ success: boolean; user?: TelegramUser; sessionString?: string }> {
    const res = await fetchWithTimeout('/api/telegram/auth/check-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password }),
    }, 15000);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'كلمة المرور غير صحيحة');
    }
    if (data.sessionString) {
      this.setSession(data.sessionString);
    }
    return data;
  },

  async importSession(sessionString: string): Promise<{ success: boolean; user: TelegramUser; sessionString: string }> {
    const res = await fetchWithTimeout('/api/telegram/auth/import-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionString }),
    }, 15000);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'الجلسة غير صالحة');
    }
    this.setSession(data.sessionString);
    return data;
  },

  async botLogin(botToken: string): Promise<{ success: boolean; user: TelegramUser; sessionString: string }> {
    const res = await fetchWithTimeout('/api/telegram/auth/bot-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken }),
    }, 15000);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'توكن البوت غير صالح');
    }
    this.setSession(data.sessionString);
    return data;
  },

  async getMe(): Promise<TelegramUser> {
    const res = await fetchWithTimeout('/api/telegram/me', {
      headers: this.getHeaders(),
    }, 15000);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل جلب بيانات المستخدم');
    }
    return data.user;
  },

  async getDialogs(limit = 40): Promise<TelegramDialog[]> {
    const res = await fetchWithTimeout(`/api/telegram/dialogs?limit=${limit}`, {
      headers: this.getHeaders(),
    }, 30000);
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل جلب المحادثات');
    }
    return data.dialogs;
  },

  async getMessages(peerId: string, limit = 50, offsetId?: number): Promise<TelegramMessage[]> {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (offsetId && offsetId > 0) {
      params.set('offsetId', offsetId.toString());
    }
    const res = await fetch(`/api/telegram/messages/${encodeURIComponent(peerId)}?${params.toString()}`, {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل جلب الرسائل');
    }
    return data.messages;
  },

  async setTyping(peerId: string, action: string = 'typing'): Promise<void> {
    try {
      await fetch('/api/telegram/set-typing', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ peerId, action }),
      });
    } catch (_) {}
  },

  async markAsRead(peerId: string, maxId?: number): Promise<void> {
    try {
      await fetch('/api/telegram/mark-read', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ peerId, maxId }),
      });
    } catch (_) {}
  },

  async sendMessage(
    peerId: string,
    message: string,
    replyTo?: number,
    optionsOrSilent?: { silent?: boolean; scheduleDate?: number } | boolean,
    scheduleDate?: number
  ): Promise<{ id: number; text: string; date: number; out: boolean; replyToMsgId?: number; silent?: boolean }> {
    let silent = false;
    let schedDate: number | undefined = undefined;
    if (typeof optionsOrSilent === 'boolean') {
      silent = optionsOrSilent;
      schedDate = scheduleDate;
    } else if (optionsOrSilent) {
      silent = !!optionsOrSilent.silent;
      schedDate = optionsOrSilent.scheduleDate;
    }
    const res = await fetch('/api/telegram/send-message', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ peerId, message, replyTo, silent, scheduleDate: schedDate }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل إرسال الرسالة');
    }
    return data.message;
  },

  async sendMedia(
    peerId: string,
    params: {
      fileBase64: string;
      fileName: string;
      caption?: string;
      voiceNote?: boolean;
      isRoundVideo?: boolean;
      mimeType?: string;
      replyTo?: number;
      silent?: boolean;
      scheduleDate?: number;
    }
  ): Promise<any> {
    return this.sendFile(peerId, params);
  },

  async sendFile(
    peerId: string,
    params: {
      fileBase64: string;
      fileName: string;
      caption?: string;
      voiceNote?: boolean;
      isRoundVideo?: boolean;
      mimeType?: string;
      replyTo?: number;
      silent?: boolean;
      scheduleDate?: number;
    }
  ): Promise<any> {
    const res = await fetch('/api/telegram/send-file', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        peerId,
        ...params,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل إرسال الملف إلى تليجرام');
    }
    return data.message;
  },

  async sendReaction(
    peerId: string,
    messageId: number,
    emoji?: string | null
  ): Promise<{ success: boolean; messageId: number; emoji?: string | null }> {
    const res = await fetch('/api/telegram/send-reaction', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        peerId,
        messageId,
        emoji,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل إرسال التفاعل');
    }
    return data;
  },

  async editMessage(
    peerId: string,
    messageId: number,
    text: string
  ): Promise<{ id: number; text: string; date: number; editDate: number }> {
    const res = await fetch('/api/telegram/edit-message', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        peerId,
        messageId,
        text,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل تعديل الرسالة');
    }
    return data.message;
  },

  async deleteMessages(
    peerId: string,
    messageIds: number[],
    revoke = true
  ): Promise<{ success: boolean; deletedIds: number[]; revoke: boolean }> {
    const res = await fetch('/api/telegram/delete-messages', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        peerId,
        messageIds,
        revoke,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل حذف الرسائل');
    }
    return data;
  },

  getMediaUrl(peerId: string, messageId: number, download = false): string {
    const session = this.getSession() || '';
    const params = new URLSearchParams();
    if (session) params.append('session', session);
    if (download) params.append('download', '1');
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return `/api/telegram/media/${encodeURIComponent(peerId)}/${messageId}${queryString}`;
  },

  async pinChat(peerId: string, pinned: boolean): Promise<{ success: boolean; pinned: boolean }> {
    const res = await fetch('/api/telegram/chat/pin', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ peerId, pinned }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل تثبيت/إلغاء تثبيت المحادثة');
    }
    return data;
  },

  async muteChat(peerId: string, mute: boolean): Promise<{ success: boolean; muted: boolean }> {
    const res = await fetch('/api/telegram/chat/mute', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ peerId, mute }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل كتم/إلغاء كتم الإشعارات');
    }
    return data;
  },

  async leaveChat(peerId: string): Promise<{ success: boolean }> {
    const res = await fetch('/api/telegram/chat/leave', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ peerId }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل مغادرة المحادثة');
    }
    return data;
  },

  async clearChatHistory(peerId: string, revoke = true): Promise<{ success: boolean }> {
    const res = await fetch('/api/telegram/chat/clear-history', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ peerId, revoke }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل مسح سجل المحادثة');
    }
    return data;
  },

  async getPinnedMessages(peerId: string): Promise<TelegramMessage[]> {
    try {
      const res = await fetch(`/api/telegram/pinned/${encodeURIComponent(peerId)}`, {
        headers: this.getHeaders(),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return [];
      }
      return data.messages || [];
    } catch (_) {
      return [];
    }
  },

  async sendVote(peerId: string, msgId: number, options: (string | number)[]): Promise<any> {
    const res = await fetch('/api/telegram/poll/vote', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ peerId, msgId, options: options.map(String) }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل التصويت في الاستطلاع');
    }
    return data;
  },

  async getStickerSets(): Promise<TelegramStickerSet[]> {
    const res = await fetch('/api/telegram/stickers/all', {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل جلب حزم الملصقات');
    }
    return data.sets || [];
  },

  async getStickerSet(
    setId: string,
    accessHash: string
  ): Promise<{ set: TelegramStickerSet; documents: TelegramStickerDocument[] }> {
    const res = await fetch(`/api/telegram/stickers/set/${setId}/${accessHash}`, {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل جلب ملصقات الحزمة');
    }
    return data;
  },

  getStickerUrl(
    docId: string,
    accessHash?: string,
    fileReference?: string,
    download = false,
    format?: 'webp' | 'lottie'
  ): string {
    const session = this.getSession() || '';
    const params = new URLSearchParams();
    if (session) params.append('session', session);
    if (accessHash) params.append('accessHash', accessHash);
    if (fileReference) params.append('fileReference', fileReference);
    if (download) params.append('download', '1');
    if (format) params.append('format', format);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return `/api/telegram/stickers/media/${encodeURIComponent(docId)}${queryString}`;
  },

  async sendSticker(
    peerId: string,
    documentId: string,
    accessHash: string,
    fileReference: string,
    replyTo?: number
  ): Promise<TelegramMessage> {
    const res = await fetch('/api/telegram/send-sticker', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ peerId, documentId, accessHash, fileReference, replyTo }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل إرسال الملصق');
    }
    return data.message;
  },

  async searchGifs(query: string, peerId?: string): Promise<TelegramGifItem[]> {
    const params = new URLSearchParams();
    if (query) params.append('q', query);
    if (peerId) params.append('peerId', peerId);
    const res = await fetch(`/api/telegram/gifs/search?${params.toString()}`, {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل البحث في صور GIF');
    }
    return data.results || [];
  },

  async sendGif(peerId: string, gifUrl: string, replyTo?: number): Promise<TelegramMessage> {
    const res = await fetch('/api/telegram/send-gif', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ peerId, gifUrl, replyTo }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل إرسال صورة GIF');
    }
    return data.message;
  },

  async logout(): Promise<void> {
    try {
      await fetch('/api/telegram/auth/logout', {
        method: 'POST',
        headers: this.getHeaders(),
      });
    } catch (_) {}
    this.clearSession();
  },

  // --------------------------------
  // Folders & Archive Management
  // --------------------------------
  async getArchivedDialogs(): Promise<TelegramDialog[]> {
    const res = await fetchWithTimeout('/api/telegram/dialogs/archived', {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل جلب المحادثات المؤرشفة');
    }
    return data.dialogs || [];
  },

  async toggleArchive(peerId: string, archive: boolean): Promise<any> {
    const res = await fetchWithTimeout('/api/telegram/dialogs/archive', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ peerId, archive }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل تغيير حالة الأرشفة');
    }
    return data;
  },

  async getFolders(): Promise<ChatFolder[]> {
    const res = await fetchWithTimeout('/api/telegram/folders', {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل جلب مجلدات المحادثات');
    }
    return data.folders || [];
  },

  async saveFolder(folder: Partial<ChatFolder>): Promise<any> {
    const res = await fetchWithTimeout('/api/telegram/folders', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ folder }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل حفظ المجلد');
    }
    return data;
  },

  async deleteFolder(filterId: number | string): Promise<any> {
    const res = await fetchWithTimeout(`/api/telegram/folders/${filterId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل حذف المجلد');
    }
    return data;
  },

  // --------------------------------
  // Global Search
  // --------------------------------
  async searchGlobal(q: string): Promise<GlobalSearchResult> {
    const res = await fetchWithTimeout(`/api/telegram/search/global?q=${encodeURIComponent(q)}`, {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل البحث العام');
    }
    return {
      contacts: data.contacts || [],
      chats: data.chats || [],
      messages: data.messages || [],
    };
  },

  // --------------------------------
  // Create Groups, Channels & Resolve Contacts
  // --------------------------------
  async createGroup(title: string, users: string[] = [], about: string = ''): Promise<any> {
    const res = await fetchWithTimeout('/api/telegram/chat/create-group', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ title, users, about }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل إنشاء المجموعة');
    }
    return data;
  },

  async createChannel(title: string, about: string = ''): Promise<any> {
    const res = await fetchWithTimeout('/api/telegram/chat/create-channel', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ title, about }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل إنشاء القناة');
    }
    return data;
  },

  async resolveContact(identifier: string): Promise<any> {
    const res = await fetchWithTimeout('/api/telegram/contacts/resolve', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ identifier }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'تعذر العثور على المعرف');
    }
    return data;
  },

  // --------------------------------
  // WebRTC Calls & Voice Chats
  // --------------------------------
  async sendCallSignal(signal: {
    action: 'call_offer' | 'call_answer' | 'ice_candidate' | 'call_end' | 'call_reject';
    callId: string;
    peerId: string;
    isVideo?: boolean;
    sdp?: any;
    candidate?: any;
  }): Promise<any> {
    const res = await fetchWithTimeout('/api/telegram/calls/signal', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(signal),
    });
    return res.json();
  },

  async getVoiceChat(chatId: string, title?: string, isChannel?: boolean): Promise<{ success: boolean; space: VoiceChatSpace }> {
    const res = await fetchWithTimeout(`/api/telegram/voice-chat/${encodeURIComponent(chatId)}?title=${encodeURIComponent(title || '')}&isChannel=${isChannel ? '1' : '0'}`, {
      headers: this.getHeaders(),
    });
    return res.json();
  },

  async joinVoiceChat(chatId: string, title?: string, isChannel?: boolean): Promise<{ success: boolean; space: VoiceChatSpace }> {
    const res = await fetchWithTimeout(`/api/telegram/voice-chat/${encodeURIComponent(chatId)}/join`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ title, isChannel }),
    });
    return res.json();
  },

  async leaveVoiceChat(chatId: string): Promise<{ success: boolean; space: VoiceChatSpace }> {
    const res = await fetchWithTimeout(`/api/telegram/voice-chat/${encodeURIComponent(chatId)}/leave`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    return res.json();
  },

  async updateVoiceChatState(chatId: string, state: {
    isSpeaking?: boolean;
    isMuted?: boolean;
    isRaisedHand?: boolean;
    isVideo?: boolean;
  }): Promise<{ success: boolean; space: VoiceChatSpace }> {
    const res = await fetchWithTimeout(`/api/telegram/voice-chat/${encodeURIComponent(chatId)}/state`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(state),
    });
    return res.json();
  },

  /**
   * Subscribe to real-time live Telegram events via SSE (NewMessage, EditMessage, DeleteMessages, TypingStatus, ReadReceipt, Calls, VoiceChats)
   */
  subscribeToEvents(handlers: {
    onNewMessage?: (data: { chatId: string; message: TelegramMessage }) => void;
    onEditMessage?: (data: { chatId: string; message: TelegramMessage }) => void;
    onDeleteMessages?: (data: { channelId?: string; messageIds: number[] }) => void;
    onTypingStatus?: (data: TypingStatus) => void;
    onReadReceipt?: (data: { chatId: string; maxId: number }) => void;
    onCallIncoming?: (data: { callId: string; callerId: string; callerName: string; peerId: string; isVideo: boolean; sdp: any }) => void;
    onCallAnswered?: (data: { callId: string; sdp: any }) => void;
    onCallCandidate?: (data: { callId: string; candidate: any }) => void;
    onCallEnded?: (data: { callId: string; reason?: string }) => void;
    onVoiceChatUpdate?: (data: VoiceChatSpace) => void;
  }): () => void {
    const session = this.getSession();
    if (!session) return () => {};

    const url = `/api/telegram/events?session=${encodeURIComponent(session)}`;
    let eventSource: EventSource | null = new EventSource(url);

    eventSource.onerror = () => {
      // If server closes or connection drops, close cleanly to avoid console loop
      if (eventSource && eventSource.readyState === EventSource.CLOSED) {
        eventSource.close();
        eventSource = null;
      }
    };

    if (handlers.onNewMessage) {
      eventSource.addEventListener('new_message', (e) => {
        try {
          const data = JSON.parse(e.data);
          handlers.onNewMessage!(data);
        } catch (err) {
          console.error('Error parsing new_message event:', err);
        }
      });
    }

    if (handlers.onEditMessage) {
      eventSource.addEventListener('edit_message', (e) => {
        try {
          const data = JSON.parse(e.data);
          handlers.onEditMessage!(data);
        } catch (err) {
          console.error('Error parsing edit_message event:', err);
        }
      });
    }

    if (handlers.onDeleteMessages) {
      eventSource.addEventListener('delete_messages', (e) => {
        try {
          const data = JSON.parse(e.data);
          handlers.onDeleteMessages!(data);
        } catch (err) {
          console.error('Error parsing delete_messages event:', err);
        }
      });
    }

    if (handlers.onTypingStatus) {
      eventSource.addEventListener('typing_status', (e) => {
        try {
          const data = JSON.parse(e.data);
          handlers.onTypingStatus!(data);
        } catch (err) {
          console.error('Error parsing typing_status event:', err);
        }
      });
    }

    if (handlers.onReadReceipt) {
      eventSource.addEventListener('read_receipt', (e) => {
        try {
          const data = JSON.parse(e.data);
          handlers.onReadReceipt!(data);
        } catch (err) {
          console.error('Error parsing read_receipt event:', err);
        }
      });
    }

    if (handlers.onCallIncoming) {
      eventSource.addEventListener('call_incoming', (e) => {
        try {
          const data = JSON.parse(e.data);
          handlers.onCallIncoming!(data);
        } catch (err) {
          console.error('Error parsing call_incoming event:', err);
        }
      });
    }

    if (handlers.onCallAnswered) {
      eventSource.addEventListener('call_answered', (e) => {
        try {
          const data = JSON.parse(e.data);
          handlers.onCallAnswered!(data);
        } catch (err) {
          console.error('Error parsing call_answered event:', err);
        }
      });
    }

    if (handlers.onCallCandidate) {
      eventSource.addEventListener('call_candidate', (e) => {
        try {
          const data = JSON.parse(e.data);
          handlers.onCallCandidate!(data);
        } catch (err) {
          console.error('Error parsing call_candidate event:', err);
        }
      });
    }

    if (handlers.onCallEnded) {
      eventSource.addEventListener('call_ended', (e) => {
        try {
          const data = JSON.parse(e.data);
          handlers.onCallEnded!(data);
        } catch (err) {
          console.error('Error parsing call_ended event:', err);
        }
      });
    }

    if (handlers.onVoiceChatUpdate) {
      eventSource.addEventListener('voice_chat_update', (e) => {
        try {
          const data = JSON.parse(e.data);
          handlers.onVoiceChatUpdate!(data);
        } catch (err) {
          console.error('Error parsing voice_chat_update event:', err);
        }
      });
    }

    return () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };
  },

  // --------------------------------
  // Forward Messages
  // --------------------------------
  async forwardMessages(
    toPeerId: string,
    fromPeerId: string,
    messageIds: number[],
    dropAuthor = false,
    silent = false
  ): Promise<{ success: boolean; forwardedCount: number }> {
    const res = await fetch('/api/telegram/forward-messages', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ toPeerId, fromPeerId, messageIds, dropAuthor, silent }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل إعادة توجيه الرسائل');
    }
    return data;
  },

  // --------------------------------
  // Pinned Messages
  // --------------------------------
  async pinMessage(
    peerId: string,
    messageId: number,
    silent = false,
    pmOneSide = false
  ): Promise<{ success: boolean; messageId: number }> {
    const res = await fetch('/api/telegram/messages/pin', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ peerId, messageId, silent, pmOneSide }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل تثبيت الرسالة');
    }
    return data;
  },

  async unpinMessage(peerId: string, messageId?: number): Promise<{ success: boolean }> {
    const res = await fetch('/api/telegram/messages/unpin', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ peerId, messageId }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل إلغاء تثبيت الرسالة');
    }
    return data;
  },

  // --------------------------------
  // Polls & Quizzes
  // --------------------------------
  async sendPoll(
    peerId: string,
    question: string,
    answers: string[],
    options?: {
      closed?: boolean;
      publicVoters?: boolean;
      multipleChoice?: boolean;
      quiz?: boolean;
      correctAnswers?: number[];
      solution?: string;
    }
  ): Promise<TelegramMessage> {
    const res = await fetch('/api/telegram/send-poll', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ peerId, question, answers, options }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل إرسال الاستطلاع');
    }
    return data.message;
  },

  async votePoll(peerId: string, messageId: number, options: string[]): Promise<{ success: boolean }> {
    const res = await fetch('/api/telegram/vote-poll', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ peerId, messageId, options }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل تسجيل التصويت');
    }
    return data;
  },

  // --------------------------------
  // Smart Link Previews
  // --------------------------------
  async getUrlPreview(url: string): Promise<TelegramWebPage | null> {
    try {
      const res = await fetch(`/api/telegram/preview-url?url=${encodeURIComponent(url)}`, {
        headers: this.getHeaders(),
      });
      const data = await res.json();
      if (data.success && data.preview) {
        return data.preview;
      }
      return null;
    } catch (_) {
      return null;
    }
  },

  // --------------------------------
  // Bot Callbacks
  // --------------------------------
  async sendBotCallback(
    peerId: string,
    msgId: number,
    dataHex: string
  ): Promise<{ message?: string; alert?: boolean; url?: string | null }> {
    const res = await fetch('/api/telegram/bot/callback', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ peerId, msgId, data: dataHex }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل معالجة استجابة البوت');
    }
    return data.result;
  },

  // --------------------------------
  // Contacts Book
  // --------------------------------
  async getContacts(): Promise<TelegramContact[]> {
    const res = await fetch('/api/telegram/contacts', {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل جلب جهات الاتصال');
    }
    return data.contacts || [];
  },

  async addContact(phone: string, firstName: string, lastName?: string): Promise<{ success: boolean }> {
    const res = await fetch('/api/telegram/contacts/add', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ phone, firstName, lastName }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل إضافة جهة الاتصال');
    }
    return data;
  },

  // --------------------------------
  // Profile Management
  // --------------------------------
  async getFullProfile(): Promise<{
    id: string;
    firstName: string;
    lastName: string;
    username: string | null;
    phone: string | null;
    bio: string;
  }> {
    const res = await fetch('/api/telegram/profile/full', {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل جلب الملف الشخصي');
    }
    return data.profile;
  },

  async updateProfile(firstName: string, lastName?: string, about?: string): Promise<TelegramUser> {
    const res = await fetch('/api/telegram/profile/update', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ firstName, lastName, about }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل تحديث البيانات الشخصية');
    }
    return data.user;
  },

  async updateUsername(username: string): Promise<TelegramUser> {
    const res = await fetch('/api/telegram/profile/username', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل تحديث اسم المستخدم');
    }
    return data.user;
  },

  async uploadProfilePhoto(photoBase64: string, fileName?: string): Promise<TelegramUser> {
    const res = await fetch('/api/telegram/profile/photo', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ photoBase64, fileName }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل رفع الصورة الشخصية');
    }
    return data.user;
  },

  // --------------------------------
  // Active Sessions
  // --------------------------------
  async getActiveSessions(): Promise<TelegramActiveSession[]> {
    const res = await fetch('/api/telegram/sessions/active', {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل جلب الجلسات النشطة');
    }
    return data.sessions || [];
  },

  async terminateSession(hash: string): Promise<{ success: boolean }> {
    const res = await fetch('/api/telegram/sessions/terminate', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ hash }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل إنهاء الجلسة');
    }
    return data;
  },

  async terminateAllOtherSessions(): Promise<{ success: boolean }> {
    const res = await fetch('/api/telegram/sessions/terminate-all', {
      method: 'POST',
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل إنهاء الجلسات الأخرى');
    }
    return data;
  },

  // --------------------------------
  // Privacy Settings
  // --------------------------------
  async getPrivacySettings(): Promise<TelegramPrivacySettings> {
    const res = await fetch('/api/telegram/privacy', {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل جلب إعدادات الخصوصية');
    }
    return data.privacy;
  },

  async setPrivacyRule(
    key: 'phone' | 'last_seen' | 'photo' | 'forwards',
    value: 'everybody' | 'contacts' | 'nobody'
  ): Promise<{ success: boolean }> {
    const res = await fetch('/api/telegram/privacy/set', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ key, value }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل تحديث الخصوصية');
    }
    return data;
  },

  // --------------------------------
  // In-Chat Search via Cloud MTProto API
  // --------------------------------
  async searchChatMessages(
    chatId: string,
    query: string = '',
    options: { minDate?: number; maxDate?: number; limit?: number } = {}
  ): Promise<{ count: number; messages: TelegramMessage[] }> {
    const params = new URLSearchParams({
      chatId,
      q: query || '',
      minDate: (options.minDate || 0).toString(),
      maxDate: (options.maxDate || 0).toString(),
      limit: (options.limit || 50).toString(),
    });

    const res = await fetchWithTimeout(`/api/telegram/search/chat?${params.toString()}`, {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل البحث في رسائل المحادثة');
    }
    return {
      count: data.count || (data.messages ? data.messages.length : 0),
      messages: data.messages || [],
    };
  },

  // --------------------------------
  // Get Full Chat / Peer Info (Bio, Subscribers/Members, Username, etc.)
  // --------------------------------
  async getChatInfo(peerId: string): Promise<TelegramChatInfo> {
    const res = await fetchWithTimeout(`/api/telegram/chat-info/${encodeURIComponent(peerId)}`, {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل جلب معلومات المحادثة');
    }
    return data.info;
  },
};
