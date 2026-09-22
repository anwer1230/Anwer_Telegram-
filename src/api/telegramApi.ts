import { TelegramDialog, TelegramMessage, TelegramServerStatus, TelegramUser } from '../types';

const SESSION_STORAGE_KEY = 'telegram_mtproto_session';

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
    const res = await fetch('/api/telegram/status', {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      throw new Error(`خطأ في جلب حالة الخادم: ${res.statusText}`);
    }
    return res.json();
  },

  async sendCode(phone: string): Promise<{ success: boolean; phoneCodeHash: string; isCodeViaApp: boolean; timeout: number }> {
    const res = await fetch('/api/telegram/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل إرسال كود التحقق');
    }
    return data;
  },

  async signIn(phone: string, code: string, phoneCodeHash: string): Promise<{ success: boolean; user?: TelegramUser; sessionString?: string; needsPassword?: boolean; hint?: string }> {
    const res = await fetch('/api/telegram/auth/sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code, phoneCodeHash }),
    });
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
    const res = await fetch('/api/telegram/auth/check-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password }),
    });
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
    const res = await fetch('/api/telegram/auth/import-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionString }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'الجلسة غير صالحة');
    }
    this.setSession(data.sessionString);
    return data;
  },

  async botLogin(botToken: string): Promise<{ success: boolean; user: TelegramUser; sessionString: string }> {
    const res = await fetch('/api/telegram/auth/bot-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'توكن البوت غير صالح');
    }
    this.setSession(data.sessionString);
    return data;
  },

  async getMe(): Promise<TelegramUser> {
    const res = await fetch('/api/telegram/me', {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل جلب بيانات المستخدم');
    }
    return data.user;
  },

  async getDialogs(limit = 40): Promise<TelegramDialog[]> {
    const res = await fetch(`/api/telegram/dialogs?limit=${limit}`, {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل جلب المحادثات');
    }
    return data.dialogs;
  },

  async getMessages(peerId: string, limit = 50): Promise<TelegramMessage[]> {
    const res = await fetch(`/api/telegram/messages/${encodeURIComponent(peerId)}?limit=${limit}`, {
      headers: this.getHeaders(),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل جلب الرسائل');
    }
    return data.messages;
  },

  async sendMessage(
    peerId: string,
    message: string,
    replyTo?: number
  ): Promise<{ id: number; text: string; date: number; out: boolean; replyToMsgId?: number }> {
    const res = await fetch('/api/telegram/send-message', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ peerId, message, replyTo }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'فشل إرسال الرسالة');
    }
    return data.message;
  },

  async sendFile(
    peerId: string,
    params: {
      fileBase64: string;
      fileName: string;
      caption?: string;
      voiceNote?: boolean;
      mimeType?: string;
      replyTo?: number;
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

  getMediaUrl(peerId: string, messageId: number, download = false): string {
    const session = this.getSession() || '';
    const params = new URLSearchParams();
    if (session) params.append('session', session);
    if (download) params.append('download', '1');
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return `/api/telegram/media/${encodeURIComponent(peerId)}/${messageId}${queryString}`;
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
};
