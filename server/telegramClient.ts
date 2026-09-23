import { TelegramClient, Api, password as tgPassword } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { CustomFile } from 'telegram/client/uploads.js';
import { NewMessage, Raw } from 'telegram/events/index.js';
import { getPeerId } from 'telegram/Utils.js';
import bigInt from 'big-integer';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';

// Official Telegram API Credentials provided by user
export const TELEGRAM_API_ID = Number(process.env.TELEGRAM_API_ID || 22043994);
export const TELEGRAM_API_HASH = process.env.TELEGRAM_API_HASH || '56f64582b363d367280db96586b97801';

// In-memory active client instances and pending auth requests
interface ActiveSession {
  client: TelegramClient;
  sessionString: string;
  phone?: string;
  phoneCodeHash?: string;
  lastActive: number;
  entityCache: Map<string, any>;
  dialogOutboxReadCache: Map<string, number>;
  me?: any;
  cachedDialogs?: any[];
  lastDialogsFetch?: number;
  eventListenersAttached?: boolean;
  eventSubscribers: Set<(data: { event: string; payload: any }) => void>;
  // Captured independently of SSE subscribers so monitoring remains always on.
  monitorMatches?: Array<{
    chatId: string;
    message: any;
    matchedKeywords: string[];
    detectedAt: number;
  }>;
}

const activeSessions = new Map<string, ActiveSession>();
const pendingAuth = new Map<string, { client: TelegramClient; phoneCodeHash?: string; phone: string; createdAt: number }>();

/**
 * Fixed backend monitoring vocabulary. Each source line is kept as a separate keyword.
 * This list is independent from the UI so monitoring cannot be disabled by the frontend.
 */
export const ALWAYS_ON_MONITOR_KEYWORDS = [
  'اريد مساعدة',
  'ابي مساعدة',
  'من يسوي تكليف',
  'من يحل',
  'عندي بحث',
  'معي واجب',
  'عندي اسايمنت',
  'من يسوي اسايمنت',
  'ابي سكليف',
  'ابي عذر',
  'من يسوي سكليف',
  'ابي شخص مضمون',
  'ابي مختص',
  'هيليب',
  'من يستطيع',
  'تعرفون احد',
  'تعرفون شخص',
  'من يساعدني',
  'من يعرف مختص',
  'ابي مختص',
  'مين يعرف يحل واجب',
  'من يحل واجبات الجامعه',
  'أحتاج مساعدتكم',
  'ابي احد يسوي بحث',
  'اريد مساعدة',
  'ابي مساعدة',
  'من يسوي تكليف',
  'من يحل',
  'عندي بحث',
  'معي واجب',
  'عندي اسايمنت',
  'من يسوي اسايمنت',
  'ابي سكليف',
  'ابي عذر',
  'من يسوي سكليف',
  'ابي شخص مضمون',
  'ابي مختص',
  'هيليب',
  'من يستطيع',
  'تعرفون احد',
  'تعرفون شخص',
  'من يساعدني',
  'من يعرف مختص',
  'ابي مختص',
  'مين يعرف يحل واجب',
  'من يحل واجبات الجامعه',
  'أحتاج مساعدتكم',
  'ابي احد يسوي بحث',
  'عندي بحث',
  'مين يعرف مختص',
  'من يعرف احد كويس',
] as const;

function normalizeMonitorText(value: unknown): string {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('ar')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ـ/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const normalizedMonitorKeywords = ALWAYS_ON_MONITOR_KEYWORDS.map((keyword) => normalizeMonitorText(keyword));

export function findMonitoringKeywordMatches(text: unknown): string[] {
  const normalizedText = normalizeMonitorText(text);
  if (!normalizedText) return [];

  // Keep the fixed source order but show each matched phrase once per message.
  return Array.from(new Set(ALWAYS_ON_MONITOR_KEYWORDS.filter((_, index) => normalizedText.includes(normalizedMonitorKeywords[index]))));
}

// Clean up pending requests older than 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, item] of pendingAuth.entries()) {
    if (now - item.createdAt > 15 * 60 * 1000) {
      item.client.disconnect().catch(() => {});
      pendingAuth.delete(key);
    }
  }
}, 60 * 1000);

/**
 * Get active user from in-memory cache instantly without network delay
 */
export function getFastActiveUser(sessionString?: string) {
  if (!sessionString) return null;
  const cleanKey = sessionString.trim();
  const existing = activeSessions.get(cleanKey);
  if (existing && existing.me) {
    return formatUser(existing.me);
  }
  return null;
}

/**
 * Get or create an active TelegramClient instance for a given session string
 */
export async function getClientForSession(sessionString: string): Promise<ActiveSession> {
  const cleanKey = sessionString.trim();
  if (!cleanKey) {
    throw new Error('رمز الجلسة فارغ');
  }

  if (activeSessions.has(cleanKey)) {
    const existing = activeSessions.get(cleanKey)!;
    existing.lastActive = Date.now();
    if (!existing.client.connected) {
      try {
        const connectPromise = existing.client.connect();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('انتهت مهلة إعادة الاتصال بسحابة تليجرام')), 20000)
        );
        await Promise.race([connectPromise, timeoutPromise]);
      } catch (reconnectErr) {
        console.warn('Could not reconnect existing session, re-creating:', reconnectErr);
        activeSessions.delete(cleanKey);
      }
    }
    attachTelegramEventHandlers(existing);
    return existing;
  }

  const stringSession = new StringSession(cleanKey);
  const client = new TelegramClient(stringSession, TELEGRAM_API_ID, TELEGRAM_API_HASH, {
    connectionRetries: 4,
    timeout: 15,
    useWSS: false,
  });

  const connectPromise = client.connect();
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('انتهت مهلة الاتصال بسحابة تليجرام الرسمية')), 20000)
  );
  await Promise.race([connectPromise, timeoutPromise]);

  const sessionObj: ActiveSession = {
    client,
    sessionString: cleanKey,
    lastActive: Date.now(),
    entityCache: new Map(),
    dialogOutboxReadCache: new Map(),
    eventSubscribers: new Set(),
  };

  try {
    sessionObj.me = await client.getMe();
  } catch (_) {}

  attachTelegramEventHandlers(sessionObj);

  activeSessions.set(cleanKey, sessionObj);
  return sessionObj;
}

/**
 * Step 1: Send verification code to phone number via official Telegram MTProto
 */
export async function sendTelegramCode(phoneNumber: string) {
  const cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, '').trim();
  if (!cleanPhone.startsWith('+')) {
    throw new Error('رقم الهاتف يجب أن يبدأ برمز الدولة الدولي، مثال: +966501234567');
  }

  const client = new TelegramClient(new StringSession(''), TELEGRAM_API_ID, TELEGRAM_API_HASH, {
    connectionRetries: 5,
    useWSS: false,
  });

  await client.connect();

  const sentCode = await client.sendCode(
    {
      apiId: TELEGRAM_API_ID,
      apiHash: TELEGRAM_API_HASH,
    },
    cleanPhone
  );

  const phoneCodeHash = sentCode.phoneCodeHash;
  pendingAuth.set(cleanPhone, {
    client,
    phoneCodeHash,
    phone: cleanPhone,
    createdAt: Date.now(),
  });

  return {
    phone: cleanPhone,
    phoneCodeHash,
    isCodeViaApp: (sentCode as any).isCodeViaApp ?? true,
    timeout: (sentCode as any).timeout ?? 60,
  };
}

/**
 * Step 2: Sign in with the received code
 */
export async function signInWithTelegramCode(phoneNumber: string, code: string, phoneCodeHash?: string) {
  const cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, '').trim();
  let pending = pendingAuth.get(cleanPhone);

  if (!pending) {
    // If not in cache, create client and connect
    const client = new TelegramClient(new StringSession(''), TELEGRAM_API_ID, TELEGRAM_API_HASH, {
      connectionRetries: 5,
      useWSS: false,
    });
    await client.connect();
    pending = { client, phone: cleanPhone, phoneCodeHash, createdAt: Date.now() };
    pendingAuth.set(cleanPhone, pending);
  }

  const client = pending.client;
  const hash = phoneCodeHash || pending.phoneCodeHash;

  if (!hash) {
    throw new Error('رمز التحقق المنتهي أو غير متوفر، يرجى طلب الرمز مجدداً');
  }

  try {
    const signInResult = await client.invoke(
      new Api.auth.SignIn({
        phoneNumber: cleanPhone,
        phoneCodeHash: hash,
        phoneCode: code.trim(),
      })
    );

    const sessionString = client.session.save() as unknown as string;
    const me = await client.getMe();

    // Cache as active session
    const sessionObj: ActiveSession = {
      client,
      sessionString,
      phone: cleanPhone,
      lastActive: Date.now(),
      entityCache: new Map(),
      dialogOutboxReadCache: new Map(),
      me,
      eventSubscribers: new Set(),
    };
    attachTelegramEventHandlers(sessionObj);
    activeSessions.set(sessionString, sessionObj);

    pendingAuth.delete(cleanPhone);

    return {
      success: true,
      sessionString,
      user: formatUser(me),
      needsPassword: false,
    };
  } catch (error: any) {
    if (error.errorMessage === 'SESSION_PASSWORD_NEEDED') {
      let hint = '';
      try {
        const pwdRes: any = await client.invoke(new Api.account.GetPassword());
        hint = pwdRes.hint || '';
      } catch (_) {}

      return {
        success: false,
        needsPassword: true,
        hint,
        message: 'الحساب محمي بكلمة سر التحقق بخطوتين (2FA Cloud Password)',
      };
    }
    throw error;
  }
}

/**
 * Step 3: Check 2FA password if required
 */
export async function checkTwoFactorPassword(phoneNumber: string, passwordInput: string) {
  const cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, '').trim();
  const pending = pendingAuth.get(cleanPhone);
  if (!pending) {
    throw new Error('الجلسة منتهية، يرجى إعادة إرسال رمز التحقق');
  }

  const client = pending.client;
  const pwdRes = await client.invoke(new Api.account.GetPassword());
  const pwdCheck = await tgPassword.computeCheck(pwdRes, passwordInput);

  await client.invoke(new Api.auth.CheckPassword({ password: pwdCheck }));

  const sessionString = client.session.save() as unknown as string;
  const me = await client.getMe();

  const sessionObj: ActiveSession = {
    client,
    sessionString,
    phone: cleanPhone,
    lastActive: Date.now(),
    entityCache: new Map(),
    dialogOutboxReadCache: new Map(),
    me,
    eventSubscribers: new Set(),
  };
  attachTelegramEventHandlers(sessionObj);
  activeSessions.set(sessionString, sessionObj);

  pendingAuth.delete(cleanPhone);

  return {
    success: true,
    sessionString,
    user: formatUser(me),
  };
}

/**
 * Sign in using Telegram Bot Token
 */
export async function signInWithBotToken(botToken: string) {
  const cleanToken = botToken.trim();
  const client = new TelegramClient(new StringSession(''), TELEGRAM_API_ID, TELEGRAM_API_HASH, {
    connectionRetries: 5,
    useWSS: false,
  });

  await client.connect();
  await client.signInBot(
    { apiId: TELEGRAM_API_ID, apiHash: TELEGRAM_API_HASH },
    { botAuthToken: cleanToken }
  );

  const sessionString = client.session.save() as unknown as string;
  const me = await client.getMe();

  const sessionObj: ActiveSession = {
    client,
    sessionString,
    lastActive: Date.now(),
    entityCache: new Map(),
    dialogOutboxReadCache: new Map(),
    me,
    eventSubscribers: new Set(),
  };
  attachTelegramEventHandlers(sessionObj);
  activeSessions.set(sessionString, sessionObj);

  return {
    success: true,
    sessionString,
    user: formatUser(me),
  };
}

/**
 * Import or restore an existing session string
 */
export async function restoreTelegramSession(sessionString: string) {
  const clean = sessionString.trim();
  const session = await getClientForSession(clean);
  const isAuth = await session.client.isUserAuthorized();

  if (!isAuth) {
    throw new Error('جلسة تليجرام هذه غير مصرح بها أو منتهية الصلاحية');
  }

  const me = await session.client.getMe();
  return {
    success: true,
    sessionString: clean,
    user: formatUser(me),
  };
}

/**
 * Get dialogs / chat list
 */
export async function getTelegramDialogs(sessionString: string, limit = 50, folder?: number) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  // Serve from memory cache if less than 15 seconds old and not requesting specific folder
  if (folder === undefined && session.cachedDialogs && session.lastDialogsFetch && Date.now() - session.lastDialogsFetch < 15000) {
    return session.cachedDialogs;
  }

  const queryOpts: any = { limit };
  if (folder !== undefined) {
    queryOpts.folder = folder;
  }

  const dialogs = await client.getDialogs(queryOpts);
  const formattedDialogs = [];

  for (const d of dialogs) {
    const idStr = d.id?.toString() || '';
    if (idStr) {
      session.entityCache.set(idStr, d.inputEntity || d.entity);
      if ((d.dialog as any)?.readOutboxMaxId) {
        session.dialogOutboxReadCache.set(idStr, Number((d.dialog as any).readOutboxMaxId));
      }
    }

    let lastText = '';
    if (d.message?.message) {
      lastText = d.message.message;
    } else if (d.message?.media) {
      lastText = '[وسائط / ملف]';
    }

    const muteUntil = (d.dialog as any)?.notifySettings?.muteUntil;
    const muted = !!(muteUntil && Number(muteUntil) > Math.floor(Date.now() / 1000));
    const isOut = !!d.message?.out;
    const readOutboxMaxId = (d.dialog as any)?.readOutboxMaxId ? Number((d.dialog as any).readOutboxMaxId) : undefined;
    const unread = isOut && readOutboxMaxId !== undefined && d.message?.id ? d.message.id > readOutboxMaxId : false;
    const folderId = Number((d.dialog as any)?.folderId || (d as any).folderId || 0);
    const isArchived = folderId === 1;

    const entity = d.entity as any;
    const hasPhoto = !!(entity && entity.photo && !entity.photo.className?.includes('Empty'));
    const photoUrl = hasPhoto ? `/api/telegram/avatar/${idStr}` : undefined;

    formattedDialogs.push({
      id: idStr,
      title: d.title || d.name || 'محادثة',
      name: d.name || d.title || 'محادثة',
      isUser: !!d.isUser,
      isGroup: !!d.isGroup,
      isChannel: !!d.isChannel,
      unreadCount: d.unreadCount || 0,
      pinned: !!d.pinned,
      muted,
      folderId,
      isArchived,
      hasPhoto,
      photoUrl,
      date: d.date || 0,
      lastMessage: {
        id: d.message?.id,
        text: lastText,
        date: d.message?.date || d.date || 0,
        out: isOut,
        unread,
        senderId: d.message?.senderId?.toString?.() || '',
      },
      entity: {
        username: (d.entity as any)?.username || null,
        phone: (d.entity as any)?.phone || null,
        verified: (d.entity as any)?.verified || false,
        scam: (d.entity as any)?.scam || false,
      },
    });
  }

  if (folder === undefined) {
    session.cachedDialogs = formattedDialogs;
    session.lastDialogsFetch = Date.now();
  }

  return formattedDialogs;
}

/**
 * Get Archived Dialogs (folder: 1)
 */
export async function getTelegramArchivedDialogs(sessionString: string, limit = 50) {
  return getTelegramDialogs(sessionString, limit, 1);
}

/**
 * Archive or unarchive a chat (Telegram folder 1 or 0)
 */
export async function toggleArchiveTelegramChat(sessionString: string, peerId: string, archive: boolean) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  let targetPeer: any = peerId;
  if (session.entityCache.has(peerId)) {
    targetPeer = session.entityCache.get(peerId);
  } else {
    try {
      targetPeer = await client.getInputEntity(peerId.startsWith('-') ? bigInt(peerId) : peerId);
    } catch (_) {
      try {
        targetPeer = await client.getEntity(bigInt(peerId));
      } catch (e) {
        targetPeer = peerId;
      }
    }
  }

  try {
    const inputPeer = await client.getInputEntity(targetPeer);
    await client.invoke(
      new Api.folders.EditPeerFolders({
        folderPeers: [
          new Api.InputFolderPeer({
            peer: inputPeer,
            folderId: archive ? 1 : 0,
          }),
        ],
      })
    );
  } catch (err) {
    console.warn('EditPeerFolders invoke error:', err);
  }

  session.cachedDialogs = undefined;
  session.lastDialogsFetch = undefined;

  return { success: true, peerId, isArchived: archive };
}

/**
 * Format a Telegram message into our standard application model
 */
export function formatTelegramMessage(m: any, readOutboxMaxId?: number) {
  let mediaType: string | null = null;
  let mediaInfo: any = null;

  if (m.media) {
    const className = m.media.className || m.media.constructor?.name || '';
    if (className.includes('Photo')) {
      mediaType = 'photo';
      mediaInfo = {
        type: 'photo',
        mimeType: 'image/jpeg',
        hasMedia: true,
      };
    } else if (className.includes('Document')) {
      const doc = m.media.document;
      const mime = doc?.mimeType || 'application/octet-stream';
      let fileName = 'file';
      let width = 0;
      let height = 0;
      let duration = 0;

      let isSticker = false;
      let isAnimated = false;
      let altEmoji = '';

      if (doc?.attributes && Array.isArray(doc.attributes)) {
        for (const attr of doc.attributes) {
          if (attr.fileName) fileName = attr.fileName;
          if (attr.w && attr.h) {
            width = attr.w;
            height = attr.h;
          }
          if (attr.duration) duration = attr.duration;
          if (attr.className === 'DocumentAttributeSticker' || attr.alt) {
            isSticker = true;
            if (attr.alt) altEmoji = attr.alt;
          }
          if (attr.className === 'DocumentAttributeAnimated') {
            isAnimated = true;
          }
          if (attr.roundMessage || (attr.className === 'DocumentAttributeVideo' && attr.roundMessage)) {
            mediaType = 'round';
          }
        }
      }

      if (mediaType === 'round') {
        // Video Note / Round
      } else if (isSticker || mime === 'application/x-tgsticker') {
        mediaType = 'sticker';
      } else if (isAnimated || mime === 'image/gif') {
        mediaType = 'gif';
      } else if (mime.includes('audio') || mime.includes('ogg')) {
        mediaType = 'voice';
      } else if (mime.includes('video')) {
        mediaType = 'video';
      } else if (mime.includes('image')) {
        mediaType = 'photo';
      } else {
        mediaType = 'document';
      }

      mediaInfo = {
        type: mediaType,
        mimeType: mime,
        fileName,
        size: doc?.size ? Number(doc.size) : undefined,
        width: width || undefined,
        height: height || undefined,
        duration: duration || undefined,
        altEmoji: altEmoji || undefined,
        isAnimated: isAnimated || mime === 'application/x-tgsticker',
        isRound: mediaType === 'round',
        hasMedia: true,
      };
    } else if (className.includes('Poll') || m.media.poll) {
      mediaType = 'poll';
      const p = m.media.poll;
      const res = m.media.results;
      const totalVoters = res?.totalVoters || 0;
      const resultsMap = new Map<string, { voters: number; chosen?: boolean }>();
      if (res?.results && Array.isArray(res.results)) {
        for (const r of res.results) {
          const optStr = Buffer.isBuffer(r.option) ? r.option.toString('hex') : r.option?.toString() || '';
          resultsMap.set(optStr, { voters: r.voters || 0, chosen: !!r.chosen });
        }
      }

      const answers = (p.answers || []).map((a: any) => {
        const optStr = Buffer.isBuffer(a.option) ? a.option.toString('hex') : a.option?.toString() || '';
        const r = resultsMap.get(optStr);
        const voters = r?.voters || 0;
        const chosen = r?.chosen || false;
        const percentage = totalVoters > 0 ? Math.round((voters / totalVoters) * 100) : 0;
        return {
          text: a.text?.text || a.text || '',
          option: optStr,
          voters,
          chosen,
          percentage,
        };
      });

      mediaInfo = {
        type: 'poll',
        hasMedia: true,
        poll: {
          id: p.id?.toString(),
          question: p.question?.text || p.question || '',
          answers,
          closed: !!p.closed,
          publicVoters: !!p.publicVoters,
          multipleChoice: !!p.multipleChoice,
          quiz: !!p.quiz,
          totalVoters,
          solution: res?.solution || undefined,
        },
      };
    } else if (className.includes('WebPage') || m.media.webpage) {
      mediaType = 'webpage';
      const wp = m.media.webpage;
      mediaInfo = {
        type: 'webpage',
        hasMedia: true,
        webPage: {
          url: wp?.url || '',
          displayUrl: wp?.displayUrl || wp?.url || '',
          siteName: wp?.siteName || '',
          title: wp?.title || '',
          description: wp?.description || '',
          hasPhoto: !!wp?.photo,
        },
      };
    } else {
      mediaType = 'media';
      mediaInfo = { type: 'media', hasMedia: true };
    }
  }

  // Parse Reply Markup (Bot Inline & Reply Keyboards)
  let replyMarkup: any = null;
  if (m.replyMarkup && m.replyMarkup.rows && Array.isArray(m.replyMarkup.rows)) {
    const rows = m.replyMarkup.rows.map((row: any) => {
      const buttons = row.buttons || [];
      return buttons.map((b: any) => {
        let type = 'simple';
        let data: string | undefined;
        let url: string | undefined = b.url;
        let webAppUrl: string | undefined;

        if (b.data) {
          type = 'callback';
          data = Buffer.isBuffer(b.data) ? b.data.toString('hex') : b.data.toString();
        } else if (b.url) {
          type = 'url';
        } else if (b.webApp || b.className === 'KeyboardButtonWebView' || b.className === 'KeyboardButtonSimpleWebView') {
          type = 'web_app';
          webAppUrl = b.webApp?.url || b.url;
        } else if (b.query !== undefined) {
          type = 'switch_inline';
        }

        return {
          text: b.text || '',
          type,
          url,
          data,
          webAppUrl,
        };
      });
    });
    replyMarkup = {
      rows,
      inline: !!m.replyMarkup.className?.includes('Inline'),
    };
  }

  // Parse Forward header
  let fwdFrom: any = null;
  if (m.fwdFrom) {
    fwdFrom = {
      fromName: m.fwdFrom.fromName || (m.fwdFrom.fromId ? 'جهة اتصال' : null),
      fromId: m.fwdFrom.fromId ? getPeerId(m.fwdFrom.fromId).toString() : null,
      date: m.fwdFrom.date || 0,
      postAuthor: m.fwdFrom.postAuthor || null,
      channelPost: m.fwdFrom.channelPost || null,
    };
  }

  const replyToMsgId = m.replyTo?.replyToMsgId || m.replyToMsgId || null;
  const reactions =
    m.reactions?.results
      ?.map((r: any) => ({
        emoticon: r.reaction?.emoticon || '',
        count: r.count || 0,
        chosen: r.chosenOrder !== undefined && r.chosenOrder !== null,
      }))
      .filter((r: any) => !!r.emoticon) || [];

  const isOut = !!m.out;
  const unread = isOut
    ? readOutboxMaxId !== undefined
      ? m.id > readOutboxMaxId
      : m.unread !== undefined
      ? !!m.unread
      : false
    : false;

  let senderName: string | undefined = undefined;
  let senderUsername: string | undefined = undefined;
  let hasSenderPhoto = false;

  const sender = m.sender || (m as any)._sender;
  if (sender) {
    if (sender.title) {
      senderName = sender.title;
    } else {
      const full = `${sender.firstName || ''} ${sender.lastName || ''}`.trim();
      senderName = full || sender.username || undefined;
    }
    senderUsername = sender.username || undefined;
    if (sender.photo && !sender.photo.className?.includes('Empty')) {
      hasSenderPhoto = true;
    }
  } else if (m.postAuthor) {
    senderName = m.postAuthor;
  }

  const resolvedSenderId =
    m.senderId?.toString?.() ||
    (m.fromId ? getPeerId(m.fromId).toString() : '') ||
    '';

  return {
    id: m.id,
    text: m.message || '',
    date: m.date || 0,
    out: isOut,
    unread,
    senderId: resolvedSenderId,
    senderName,
    senderUsername,
    hasSenderPhoto,
    mediaType,
    mediaInfo,
    replyToMsgId,
    reactions,
    editDate: m.editDate || null,
    views: m.views || null,
    forwards: m.forwards || null,
    pinned: !!m.pinned,
    silent: !!m.silent,
    fwdFrom,
    poll: mediaInfo?.poll || null,
    webPage: mediaInfo?.webPage || null,
    replyMarkup,
  };
}

/**
 * Extract consistent chat/dialog ID for incoming and outgoing messages
 */
export function extractChatId(m: any, currentUserId?: string): string {
  if (m.chatId) {
    const cid = m.chatId.toString();
    if (currentUserId && cid === currentUserId && m.senderId) {
      return m.senderId.toString();
    }
    return cid;
  }
  if (m.peerId) {
    const pid = getPeerId(m.peerId).toString();
    if (currentUserId && pid === currentUserId && m.fromId) {
      return getPeerId(m.fromId).toString();
    }
    return pid;
  }
  return '';
}

/**
 * Attach real-time Telegram event handlers:
 * client.addEventHandler(handler, new NewMessage({}))
 */
export function attachTelegramEventHandlers(sessionObj: ActiveSession) {
  if (sessionObj.eventListenersAttached) return;
  sessionObj.eventListenersAttached = true;

  const client = sessionObj.client;

  // 1. Live New Message Event (client.addEventHandler with new NewMessage({}))
  client.addEventHandler(async (event: any) => {
    try {
      const m = event.message;
      if (!m) return;
      const formatted = formatTelegramMessage(m);

      let myId: string | undefined = sessionObj.me?.id?.toString();
      if (!myId) {
        try {
          const me: any = await client.getMe();
          sessionObj.me = me;
          myId = me?.id?.toString();
        } catch (_) {}
      }

      const chatId = extractChatId(m, myId);

      const payload = {
        chatId,
        message: formatted,
      };

      for (const subscriber of sessionObj.eventSubscribers) {
        try {
          subscriber({ event: 'new_message', payload });
        } catch (err) {
          console.error('Error dispatching new_message event:', err);
        }
      }

      // Always-on monitor: inspect incoming messages in the backend event handler.
      // It does not depend on the UI, an open SSE connection, or a UI keyword list.
      if (!m.out) {
        const matchedKeywords = findMonitoringKeywordMatches(m.message || m.text || formatted.text);
        if (matchedKeywords.length > 0) {
          const monitorPayload = {
            chatId,
            message: formatted,
            matchedKeywords,
            detectedAt: Date.now(),
          };

          const storedMatches = (sessionObj.monitorMatches ||= []);
          storedMatches.push(monitorPayload);
          if (storedMatches.length > 100) {
            storedMatches.splice(0, storedMatches.length - 100);
          }

          for (const subscriber of sessionObj.eventSubscribers) {
            try {
              subscriber({ event: 'monitor_match', payload: monitorPayload });
            } catch (err) {
              console.error('Error dispatching monitor_match event:', err);
            }
          }
        }
      }
    } catch (err) {
      console.error('Error in Telegram NewMessage handler:', err);
    }
  }, new NewMessage({}));

  // 2. Real-time updates for message editing and message deletion
  try {
    client.addEventHandler(async (update: any) => {
      try {
        if (
          update instanceof Api.UpdateEditMessage ||
          update instanceof Api.UpdateEditChannelMessage
        ) {
          const m = update.message;
          if (m) {
            const formatted = formatTelegramMessage(m);
            const myId = sessionObj.me?.id?.toString();
            const chatId = extractChatId(m, myId);
            for (const subscriber of sessionObj.eventSubscribers) {
              try {
                subscriber({
                  event: 'edit_message',
                  payload: { chatId, message: formatted },
                });
              } catch (_) {}
            }
          }
        } else if (update instanceof Api.UpdateDeleteMessages) {
          const ids = update.messages || [];
          for (const subscriber of sessionObj.eventSubscribers) {
            try {
              subscriber({
                event: 'delete_messages',
                payload: { messageIds: ids },
              });
            } catch (_) {}
          }
        } else if (update instanceof Api.UpdateDeleteChannelMessages) {
          const ids = update.messages || [];
          const channelId = update.channelId ? `-100${update.channelId}` : undefined;
          for (const subscriber of sessionObj.eventSubscribers) {
            try {
              subscriber({
                event: 'delete_messages',
                payload: { channelId, messageIds: ids },
              });
            } catch (_) {}
          }
        } else if (update instanceof Api.UpdateReadHistoryOutbox) {
          const cid = update.peer ? getPeerId(update.peer).toString() : '';
          if (cid) {
            sessionObj.dialogOutboxReadCache.set(cid, update.maxId);
            for (const subscriber of sessionObj.eventSubscribers) {
              try {
                subscriber({
                  event: 'read_receipt',
                  payload: { chatId: cid, maxId: update.maxId },
                });
              } catch (_) {}
            }
          }
        } else if (update instanceof Api.UpdateReadChannelOutbox) {
          const cid = update.channelId ? `-100${update.channelId}` : '';
          if (cid) {
            sessionObj.dialogOutboxReadCache.set(cid, update.maxId);
            for (const subscriber of sessionObj.eventSubscribers) {
              try {
                subscriber({
                  event: 'read_receipt',
                  payload: { chatId: cid, maxId: update.maxId },
                });
              } catch (_) {}
            }
          }
        } else if (update instanceof Api.UpdateUserTyping) {
          const cid = update.userId?.toString();
          if (cid) {
            const parsed = parseTypingAction(update.action);
            for (const subscriber of sessionObj.eventSubscribers) {
              try {
                subscriber({
                  event: 'typing_status',
                  payload: { chatId: cid, userId: cid, ...parsed },
                });
              } catch (_) {}
            }
          }
        } else if (update instanceof Api.UpdateChatUserTyping) {
          const cid = update.chatId ? `-${update.chatId}` : '';
          const fromId = update.fromId ? getPeerId(update.fromId).toString() : '';
          if (cid) {
            const parsed = parseTypingAction(update.action);
            for (const subscriber of sessionObj.eventSubscribers) {
              try {
                subscriber({
                  event: 'typing_status',
                  payload: { chatId: cid, fromId, ...parsed },
                });
              } catch (_) {}
            }
          }
        } else if (update instanceof Api.UpdateChannelUserTyping) {
          const cid = update.channelId ? `-100${update.channelId}` : '';
          const fromId = update.fromId ? getPeerId(update.fromId).toString() : '';
          if (cid) {
            const parsed = parseTypingAction(update.action);
            for (const subscriber of sessionObj.eventSubscribers) {
              try {
                subscriber({
                  event: 'typing_status',
                  payload: { chatId: cid, fromId, ...parsed },
                });
              } catch (_) {}
            }
          }
        }
      } catch (_) {}
    }, new Raw({}));
  } catch (err) {
    console.warn('Could not attach Raw handler:', err);
  }
}

/**
 * Parse Telegram typing action into human-readable action text and type
 */
export function parseTypingAction(action: any): { actionType: string; actionText: string } {
  const className = action?.className || action?.constructor?.name || '';
  if (className.includes('RecordAudio') || className.includes('UploadAudio')) {
    return { actionType: 'record_audio', actionText: 'يسجل مقطعاً صوتياً...' };
  }
  if (className.includes('RecordVideo') || className.includes('UploadVideo')) {
    return { actionType: 'record_video', actionText: 'يسجل مقطع فيديو...' };
  }
  if (className.includes('UploadPhoto')) {
    return { actionType: 'upload_photo', actionText: 'يرسل صورة...' };
  }
  if (className.includes('UploadDocument')) {
    return { actionType: 'upload_document', actionText: 'يرسل ملفاً...' };
  }
  if (className.includes('Cancel')) {
    return { actionType: 'cancel', actionText: '' };
  }
  return { actionType: 'typing', actionText: 'يكتب الآن...' };
}

/**
 * Subscribe to real-time events for a Telegram session
 */
export async function subscribeToTelegramEvents(
  sessionString: string,
  subscriber: (data: { event: string; payload: any }) => void
): Promise<() => void> {
  const session = await getClientForSession(sessionString);
  attachTelegramEventHandlers(session);
  session.eventSubscribers.add(subscriber);

  // Replay only very recent matches after a temporary SSE reconnect.
  const recentMonitorMatches = (session.monitorMatches || []).filter(
    (match) => Date.now() - match.detectedAt < 5 * 60 * 1000
  );
  for (const payload of recentMonitorMatches) {
    try {
      subscriber({ event: 'monitor_match', payload });
    } catch (_) {}
  }

  return () => {
    session.eventSubscribers.delete(subscriber);
  };
}

/**
 * Get messages from a chat / peer (supports pagination with offsetId)
 */
export async function getTelegramMessages(
  sessionString: string,
  peerId: string,
  limit = 50,
  offsetId?: number
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  let targetPeer: any = peerId;
  if (session.entityCache.has(peerId)) {
    targetPeer = session.entityCache.get(peerId);
  } else {
    try {
      targetPeer = await client.getInputEntity(peerId.startsWith('-') ? bigInt(peerId) : peerId);
    } catch (_) {
      try {
        targetPeer = await client.getEntity(bigInt(peerId));
      } catch (e) {
        // Fallback
        targetPeer = peerId;
      }
    }
  }

  const queryOptions: any = { limit };
  if (offsetId && Number(offsetId) > 0) {
    queryOptions.offsetId = Number(offsetId);
  }

  const messages = await client.getMessages(targetPeer, queryOptions);
  const readOutboxMaxId = session.dialogOutboxReadCache.get(peerId);

  return messages.map((m: any) => formatTelegramMessage(m, readOutboxMaxId));
}

/**
 * Set typing action in a chat (Typing Indicators)
 */
export async function setTelegramTyping(
  sessionString: string,
  peerId: string,
  actionType: string = 'typing'
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  let targetPeer: any = peerId;
  if (session.entityCache.has(peerId)) {
    targetPeer = session.entityCache.get(peerId);
  } else {
    try {
      targetPeer = await client.getInputEntity(peerId.startsWith('-') ? bigInt(peerId) : peerId);
    } catch (_) {
      try {
        targetPeer = await client.getEntity(bigInt(peerId));
      } catch (e) {
        targetPeer = peerId;
      }
    }
  }

  let action: any;
  if (actionType === 'record_audio') {
    action = new Api.SendMessageRecordAudioAction();
  } else if (actionType === 'upload_photo') {
    action = new Api.SendMessageUploadPhotoAction({ progress: 50 });
  } else if (actionType === 'upload_document') {
    action = new Api.SendMessageUploadDocumentAction({ progress: 50 });
  } else if (actionType === 'cancel') {
    action = new Api.SendMessageCancelAction();
  } else {
    action = new Api.SendMessageTypingAction();
  }

  try {
    await client.invoke(
      new Api.messages.SetTyping({
        peer: targetPeer,
        action,
      })
    );
  } catch (err: any) {
    // Some channels or restricted chats do not allow SetTyping, ignore gracefully
    console.warn('SetTyping error:', err?.message);
  }

  return { success: true, peerId, actionType };
}

/**
 * Mark incoming messages as read in chat (Read Receipts)
 */
export async function markTelegramAsRead(
  sessionString: string,
  peerId: string,
  maxId?: number
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  let targetPeer: any = peerId;
  if (session.entityCache.has(peerId)) {
    targetPeer = session.entityCache.get(peerId);
  } else {
    try {
      targetPeer = await client.getInputEntity(peerId.startsWith('-') ? bigInt(peerId) : peerId);
    } catch (_) {
      try {
        targetPeer = await client.getEntity(bigInt(peerId));
      } catch (e) {
        targetPeer = peerId;
      }
    }
  }

  try {
    await client.markAsRead(targetPeer, maxId ? Number(maxId) : undefined);
  } catch (err: any) {
    console.warn('markAsRead error:', err?.message);
  }

  return { success: true, peerId, maxId };
}

/**
 * Download media from a Telegram message directly into a buffer
 */
export async function downloadTelegramMedia(
  sessionString: string,
  peerId: string,
  messageId: number
): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  let targetPeer: any = peerId;
  if (session.entityCache.has(peerId)) {
    targetPeer = session.entityCache.get(peerId);
  } else {
    try {
      targetPeer = await client.getInputEntity(peerId.startsWith('-') ? bigInt(peerId) : peerId);
    } catch (_) {
      try {
        targetPeer = await client.getEntity(bigInt(peerId));
      } catch (e) {
        targetPeer = peerId;
      }
    }
  }

  // Fetch the specific message
  const msgs = await client.getMessages(targetPeer, { ids: [messageId] });
  if (!msgs || msgs.length === 0 || !msgs[0]?.media) {
    throw new Error('الرسالة لا تحتوي على وسائط أو غير موجودة');
  }

  const targetMessage = msgs[0];
  const media: any = targetMessage.media;

  let mimeType = 'application/octet-stream';
  let fileName = `telegram-media-${messageId}`;

  const className = media?.className || media?.constructor?.name || '';
  if (className.includes('Photo')) {
    mimeType = 'image/jpeg';
    fileName = `photo-${messageId}.jpg`;
  } else if (className.includes('Document') && media?.document) {
    const doc = media.document;
    if (doc.mimeType) mimeType = doc.mimeType;
    if (doc.attributes && Array.isArray(doc.attributes)) {
      for (const attr of doc.attributes) {
        if (attr.fileName) {
          fileName = attr.fileName;
          break;
        }
      }
    }
    if (fileName === `telegram-media-${messageId}`) {
      const ext = mimeType.split('/')[1]?.split(';')[0] || 'bin';
      fileName = `file-${messageId}.${ext}`;
    }
  }

  // Download media buffer using TelegramClient
  const bufferResult: any = await client.downloadMedia(targetMessage, {});

  if (!bufferResult || bufferResult.length === 0) {
    throw new Error('تعذر تنزيل الوسائط من سحابة تليجرام');
  }

  const finalBuffer = Buffer.isBuffer(bufferResult) ? bufferResult : Buffer.from(bufferResult);

  return {
    buffer: finalBuffer,
    mimeType,
    fileName,
  };
}

const AVATAR_CACHE_DIR = '/tmp/tg_avatars';
try {
  if (!fs.existsSync(AVATAR_CACHE_DIR)) {
    fs.mkdirSync(AVATAR_CACHE_DIR, { recursive: true });
  }
} catch (_) {}

const avatarMemoryCache = new Map<string, { buffer: Buffer; timestamp: number }>();
const avatarNegativeCache = new Map<string, number>();

/**
 * Download peer profile photo/avatar using official GramJS MTProto client with fast disk & memory caching
 */
export async function getTelegramPeerAvatar(
  sessionString: string | undefined,
  peerId: string,
  isBig: boolean = false
): Promise<Buffer | null> {
  if (!peerId) return null;

  const cleanPeerId = peerId.trim();
  const cacheKey = `${cleanPeerId}_${isBig ? 'big' : 'small'}`;

  // 1. Check in-memory cache
  const memCached = avatarMemoryCache.get(cacheKey);
  if (memCached && Date.now() - memCached.timestamp < 3600 * 1000) {
    return memCached.buffer;
  }

  // 2. Check negative cache (peers that have no avatar, skip for 3 minutes to avoid hammering)
  const negTime = avatarNegativeCache.get(cacheKey);
  if (negTime && Date.now() - negTime < 180 * 1000) {
    return null;
  }

  // 3. Check disk cache
  const safeFileName = `${cleanPeerId.replace(/[^a-zA-Z0-9_-]/g, '_')}_${isBig ? 'big' : 'small'}.jpg`;
  const filePath = path.join(AVATAR_CACHE_DIR, safeFileName);
  try {
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      if (Date.now() - stat.mtimeMs < 86400 * 1000) {
        const fileBuf = fs.readFileSync(filePath);
        if (fileBuf && fileBuf.length > 0) {
          avatarMemoryCache.set(cacheKey, { buffer: fileBuf, timestamp: Date.now() });
          return fileBuf;
        }
      }
    }
  } catch (_) {}

  // 4. Resolve session
  let session: ActiveSession | null = null;
  if (sessionString) {
    try {
      session = await getClientForSession(sessionString);
    } catch (_) {}
  }
  if (!session && activeSessions.size > 0) {
    session = activeSessions.values().next().value || null;
  }
  if (!session) {
    return null;
  }

  const client = session.client;

  // 5. Resolve target entity
  let targetEntity: any = cleanPeerId;
  if (session.entityCache.has(cleanPeerId)) {
    targetEntity = session.entityCache.get(cleanPeerId);
  } else {
    try {
      const cleanId = cleanPeerId.startsWith('-')
        ? bigInt(cleanPeerId)
        : cleanPeerId.match(/^\d+$/)
        ? bigInt(cleanPeerId)
        : cleanPeerId;
      try {
        targetEntity = await client.getInputEntity(cleanId);
      } catch (_) {
        targetEntity = await client.getEntity(cleanId);
      }
      if (targetEntity) {
        session.entityCache.set(cleanPeerId, targetEntity);
      }
    } catch (e) {
      targetEntity = cleanPeerId;
    }
  }

  // 6. Download profile photo using GramJS downloadProfilePhoto
  try {
    const photoResult: any = await client.downloadProfilePhoto(targetEntity, {
      isBig: !!isBig,
    });

    if (photoResult && photoResult.length > 0) {
      const buf = Buffer.isBuffer(photoResult) ? photoResult : Buffer.from(photoResult);
      avatarMemoryCache.set(cacheKey, { buffer: buf, timestamp: Date.now() });
      try {
        fs.writeFileSync(filePath, buf);
      } catch (_) {}
      return buf;
    }
  } catch (err: any) {
    // If entity has no photo or private, mark in negative cache
  }

  avatarNegativeCache.set(cacheKey, Date.now());
  return null;
}

/**
 * Send a message to a chat / peer
 */
export async function sendTelegramMessage(
  sessionString: string,
  peerId: string,
  text: string,
  replyTo?: number,
  options?: { silent?: boolean; scheduleDate?: number }
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  let targetPeer: any = peerId;
  if (session.entityCache.has(peerId)) {
    targetPeer = session.entityCache.get(peerId);
  } else {
    try {
      targetPeer = await client.getInputEntity(peerId.startsWith('-') ? bigInt(peerId) : peerId);
    } catch (_) {
      targetPeer = peerId;
    }
  }

  const sentMessage: any = await client.sendMessage(targetPeer, {
    message: text,
    replyTo: replyTo ? Number(replyTo) : undefined,
    silent: options?.silent,
    schedule: options?.scheduleDate ? Number(options.scheduleDate) : undefined,
  });

  return {
    id: sentMessage.id,
    text: sentMessage.message || text,
    date: sentMessage.date || Math.floor(Date.now() / 1000),
    out: true,
    replyToMsgId: replyTo ? Number(replyTo) : undefined,
    silent: options?.silent,
  };
}

/**
 * Send a file, photo, document, or voice note to a chat / peer
 */
export async function sendTelegramFile(
  sessionString: string,
  peerId: string,
  fileData: {
    buffer: Buffer;
    fileName: string;
    caption?: string;
    voiceNote?: boolean;
    isRoundVideo?: boolean;
    mimeType?: string;
    replyTo?: number;
    silent?: boolean;
    scheduleDate?: number;
  }
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  let targetPeer: any = peerId;
  if (session.entityCache.has(peerId)) {
    targetPeer = session.entityCache.get(peerId);
  } else {
    try {
      targetPeer = await client.getInputEntity(peerId.startsWith('-') ? bigInt(peerId) : peerId);
    } catch (_) {
      try {
        targetPeer = await client.getEntity(bigInt(peerId));
      } catch (e) {
        targetPeer = peerId;
      }
    }
  }

  const customFile = new CustomFile(
    fileData.fileName || 'attachment',
    fileData.buffer.length,
    '',
    fileData.buffer
  );

  const isImage = !!fileData.mimeType?.startsWith('image/');
  const isVoice = !!fileData.voiceNote;
  const isRound = !!fileData.isRoundVideo;

  const sentMessage: any = await client.sendFile(targetPeer, {
    file: customFile,
    caption: fileData.caption || '',
    voiceNote: isVoice,
    videoNote: isRound,
    forceDocument: !isVoice && !isImage && !isRound,
    replyTo: fileData.replyTo ? Number(fileData.replyTo) : undefined,
    silent: fileData.silent,
    scheduleDate: fileData.scheduleDate ? Number(fileData.scheduleDate) : undefined,
  });

  const resolvedMediaType = isRound ? 'round' : isVoice ? 'voice' : isImage ? 'photo' : 'document';

  return {
    id: sentMessage.id,
    text: sentMessage.message || fileData.caption || '',
    date: sentMessage.date || Math.floor(Date.now() / 1000),
    out: true,
    replyToMsgId: fileData.replyTo ? Number(fileData.replyTo) : undefined,
    mediaType: resolvedMediaType,
    mediaInfo: {
      type: resolvedMediaType,
      fileName: fileData.fileName,
      mimeType: fileData.mimeType,
      size: fileData.buffer.length,
      isRound,
      hasMedia: true,
    },
  };
}

/**
 * Send or toggle a reaction (👍, ❤️, 🔥, etc.) on a message
 */
export async function sendTelegramReaction(
  sessionString: string,
  peerId: string,
  messageId: number,
  emoji?: string | null
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  let targetPeer: any = peerId;
  if (session.entityCache.has(peerId)) {
    targetPeer = session.entityCache.get(peerId);
  } else {
    try {
      targetPeer = await client.getInputEntity(peerId.startsWith('-') ? bigInt(peerId) : peerId);
    } catch (_) {
      try {
        targetPeer = await client.getEntity(bigInt(peerId));
      } catch (e) {
        targetPeer = peerId;
      }
    }
  }

  const reaction = emoji ? [new Api.ReactionEmoji({ emoticon: emoji })] : [];

  await client.invoke(
    new Api.messages.SendReaction({
      peer: targetPeer,
      msgId: Number(messageId),
      reaction,
    })
  );

  return { success: true, messageId, emoji: emoji || null };
}

/**
 * Edit the text of a sent Telegram message
 */
export async function editTelegramMessage(
  sessionString: string,
  peerId: string,
  messageId: number,
  newText: string
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  let targetPeer: any = peerId;
  if (session.entityCache.has(peerId)) {
    targetPeer = session.entityCache.get(peerId);
  } else {
    try {
      targetPeer = await client.getInputEntity(peerId.startsWith('-') ? bigInt(peerId) : peerId);
    } catch (_) {
      try {
        targetPeer = await client.getEntity(bigInt(peerId));
      } catch (e) {
        targetPeer = peerId;
      }
    }
  }

  const edited: any = await client.editMessage(targetPeer, {
    message: Number(messageId),
    text: newText,
  });

  return {
    id: Number(messageId),
    text: edited?.message || newText,
    date: edited?.date || Math.floor(Date.now() / 1000),
    editDate: edited?.editDate || Math.floor(Date.now() / 1000),
  };
}

/**
 * Delete messages from a chat (either for everyone or for the current user only)
 */
export async function deleteTelegramMessages(
  sessionString: string,
  peerId: string,
  messageIds: number[],
  revoke: boolean = true
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  let targetPeer: any = peerId;
  if (session.entityCache.has(peerId)) {
    targetPeer = session.entityCache.get(peerId);
  } else {
    try {
      targetPeer = await client.getInputEntity(peerId.startsWith('-') ? bigInt(peerId) : peerId);
    } catch (_) {
      try {
        targetPeer = await client.getEntity(bigInt(peerId));
      } catch (e) {
        targetPeer = peerId;
      }
    }
  }

  await client.deleteMessages(
    targetPeer,
    messageIds.map((id) => Number(id)),
    {
      revoke: !!revoke,
    }
  );

  return {
    success: true,
    deletedIds: messageIds,
    revoke: !!revoke,
  };
}

/**
 * Log out and disconnect session
 */
export async function logoutTelegramSession(sessionString: string) {
  const clean = sessionString.trim();
  const session = activeSessions.get(clean);
  if (session) {
    try {
      await session.client.invoke(new Api.auth.LogOut());
    } catch (_) {}
    try {
      await session.client.disconnect();
    } catch (_) {}
    activeSessions.delete(clean);
  }
  return { success: true };
}

/**
 * Get current connected user info
 */
export async function getTelegramMe(sessionString: string) {
  const session = await getClientForSession(sessionString);
  const isAuth = await session.client.isUserAuthorized();
  if (!isAuth) {
    throw new Error('غير مسجل الدخول');
  }
  const me = await session.client.getMe();
  return formatUser(me);
}

function formatUser(user: any) {
  if (!user) return null;
  return {
    id: user.id?.toString?.() || '',
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    username: user.username || null,
    phone: user.phone || null,
    bot: !!user.bot,
    verified: !!user.verified,
    premium: !!user.premium,
  };
}

// In-memory document and buffer caches for stickers
const stickerDocCache = new Map<string, any>();
const stickerBufferCache = new Map<string, { buffer: Buffer; mimeType: string }>();

/**
 * Toggle Pin / Unpin a chat/dialog in Telegram Cloud
 */
export async function toggleTelegramDialogPin(
  sessionString: string,
  peerId: string,
  pinned: boolean
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;
  let targetPeer: any = peerId;
  if (session.entityCache.has(peerId)) {
    targetPeer = session.entityCache.get(peerId);
  } else {
    try {
      targetPeer = await client.getInputEntity(peerId.startsWith('-') ? bigInt(peerId) : peerId);
    } catch (_) {
      try {
        targetPeer = await client.getEntity(bigInt(peerId));
      } catch (e) {
        targetPeer = peerId;
      }
    }
  }

  await client.invoke(
    new Api.messages.ToggleDialogPin({
      peer: new Api.InputDialogPeer({ peer: targetPeer }),
      pinned: !!pinned,
    })
  );

  return { success: true, peerId, pinned: !!pinned };
}

/**
 * Mute / Unmute chat notifications
 */
export async function updateTelegramNotifySettings(
  sessionString: string,
  peerId: string,
  mute: boolean
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;
  let targetPeer: any = peerId;
  if (session.entityCache.has(peerId)) {
    targetPeer = session.entityCache.get(peerId);
  } else {
    try {
      targetPeer = await client.getInputEntity(peerId.startsWith('-') ? bigInt(peerId) : peerId);
    } catch (_) {
      try {
        targetPeer = await client.getEntity(bigInt(peerId));
      } catch (e) {
        targetPeer = peerId;
      }
    }
  }

  const muteUntil = mute ? 2147483647 : 0;
  await client.invoke(
    new Api.account.UpdateNotifySettings({
      peer: new Api.InputNotifyPeer({ peer: targetPeer }),
      settings: new Api.InputPeerNotifySettings({
        muteUntil,
      }),
    })
  );

  return { success: true, peerId, muted: !!mute };
}

/**
 * Leave a Telegram group or channel
 */
export async function leaveTelegramChat(
  sessionString: string,
  peerId: string
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;
  let targetPeer: any = peerId;
  if (session.entityCache.has(peerId)) {
    targetPeer = session.entityCache.get(peerId);
  } else {
    try {
      targetPeer = await client.getInputEntity(peerId.startsWith('-') ? bigInt(peerId) : peerId);
    } catch (_) {
      try {
        targetPeer = await client.getEntity(bigInt(peerId));
      } catch (e) {
        targetPeer = peerId;
      }
    }
  }

  const cleanId = peerId.toString();
  if (cleanId.startsWith('-100')) {
    await client.invoke(
      new Api.channels.LeaveChannel({
        channel: targetPeer,
      })
    );
  } else if (cleanId.startsWith('-')) {
    const rawId = cleanId.replace('-', '');
    await client.invoke(
      new Api.messages.DeleteChatUser({
        chatId: bigInt(rawId),
        userId: new Api.InputUserSelf(),
      })
    );
  } else {
    await client.invoke(
      new Api.messages.DeleteHistory({
        peer: targetPeer,
        maxId: 0,
        revoke: true,
      })
    );
  }

  return { success: true, peerId };
}

/**
 * Clear chat history / delete conversation
 */
export async function clearTelegramChatHistory(
  sessionString: string,
  peerId: string,
  revoke: boolean = true
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;
  let targetPeer: any = peerId;
  if (session.entityCache.has(peerId)) {
    targetPeer = session.entityCache.get(peerId);
  } else {
    try {
      targetPeer = await client.getInputEntity(peerId.startsWith('-') ? bigInt(peerId) : peerId);
    } catch (_) {
      try {
        targetPeer = await client.getEntity(bigInt(peerId));
      } catch (e) {
        targetPeer = peerId;
      }
    }
  }

  const cleanId = peerId.toString();
  if (cleanId.startsWith('-100')) {
    await client.invoke(
      new Api.channels.DeleteHistory({
        channel: targetPeer,
        maxId: 0,
      })
    );
  } else {
    await client.invoke(
      new Api.messages.DeleteHistory({
        peer: targetPeer,
        maxId: 0,
        revoke: !!revoke,
      })
    );
  }

  return { success: true, peerId, revoke: !!revoke };
}

/**
 * Fetch all installed sticker sets for the user
 */
export async function getTelegramAllStickers(sessionString: string) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  let sets: any[] = [];
  try {
    const res: any = await client.invoke(
      new Api.messages.GetAllStickers({
        hash: bigInt(0),
      })
    );
    if (res && res.sets) {
      sets = res.sets;
    }
  } catch (err) {
    console.warn('Could not fetch allStickers from Telegram:', err);
  }

  return sets.map((s: any) => ({
    id: s.id.toString(),
    accessHash: s.accessHash.toString(),
    title: s.title || '',
    shortName: s.shortName || '',
    count: s.count || 0,
    archived: !!s.archived,
    official: !!s.official,
    animated: !!s.animated,
    videos: !!s.videos,
    thumbDocumentId: s.thumbDocumentId?.toString() || null,
  }));
}

/**
 * Get all stickers inside a specific sticker set
 */
export async function getTelegramStickerSet(
  sessionString: string,
  setId: string,
  accessHash: string
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  const res: any = await client.invoke(
    new Api.messages.GetStickerSet({
      stickerset: new Api.InputStickerSetID({
        id: bigInt(setId),
        accessHash: bigInt(accessHash),
      }),
      hash: 0,
    })
  );

  const documents = (res.documents || []).map((doc: any) => {
    const idStr = doc.id.toString();
    const accessHashStr = doc.accessHash.toString();
    const fileReference = doc.fileReference ? doc.fileReference.toString('base64') : '';

    stickerDocCache.set(idStr, doc);

    let altEmoji = '😀';
    let isAnimated = false;
    let isVideo = false;

    if (doc.attributes) {
      for (const attr of doc.attributes) {
        if (attr.className === 'DocumentAttributeSticker' || attr.alt) {
          if (attr.alt) altEmoji = attr.alt;
        }
        if (attr.className === 'DocumentAttributeAnimated') {
          isAnimated = true;
        }
        if (attr.className === 'DocumentAttributeVideo') {
          isVideo = true;
        }
      }
    }

    const mimeType = doc.mimeType || 'image/webp';
    const isLottie = mimeType === 'application/x-tgsticker' || isAnimated;

    return {
      id: idStr,
      accessHash: accessHashStr,
      fileReference,
      mimeType,
      size: doc.size ? Number(doc.size) : 0,
      altEmoji,
      isAnimated: isLottie,
      isVideo,
      format: isLottie ? 'lottie' : mimeType === 'video/webm' ? 'webm' : 'webp',
    };
  });

  return {
    set: {
      id: res.set.id.toString(),
      accessHash: res.set.accessHash.toString(),
      title: res.set.title || '',
      shortName: res.set.shortName || '',
      count: res.set.count || documents.length,
    },
    documents,
  };
}

/**
 * Download a sticker buffer in WebP or Lottie (TGS / JSON)
 */
export async function downloadTelegramStickerBuffer(
  sessionString: string,
  docId: string,
  accessHash?: string,
  fileReference?: string,
  format?: 'webp' | 'lottie'
): Promise<{ buffer: Buffer; mimeType: string; fileName: string; isLottieJson?: boolean }> {
  const cached = stickerBufferCache.get(docId);
  if (cached && (!format || (format === 'lottie' && cached.mimeType.includes('tgsticker')) || (format === 'webp' && cached.mimeType.includes('webp')))) {
    return {
      buffer: cached.buffer,
      mimeType: cached.mimeType,
      fileName: `sticker_${docId}.${cached.mimeType.includes('webp') ? 'webp' : 'tgs'}`,
    };
  }

  const session = await getClientForSession(sessionString);
  const client = session.client;

  const doc = stickerDocCache.get(docId);
  let downloaded: any;

  if (doc) {
    downloaded = await client.downloadMedia(doc, {});
  } else if (accessHash && fileReference) {
    const loc = new Api.InputDocumentFileLocation({
      id: bigInt(docId),
      accessHash: bigInt(accessHash),
      fileReference: Buffer.from(fileReference, 'base64'),
      thumbSize: '',
    });
    downloaded = await client.downloadFile(loc, {});
  } else {
    throw new Error('بيانات الملصق غير مكتملة للتحميل');
  }

  if (!downloaded || downloaded.length === 0) {
    throw new Error('فشل تنزيل ملف الملصق من تليجرام');
  }

  let buffer = Buffer.isBuffer(downloaded) ? downloaded : Buffer.from(downloaded);
  const isLottie = format === 'lottie' || (doc && doc.mimeType === 'application/x-tgsticker');
  let mimeType = isLottie ? 'application/x-tgsticker' : (doc?.mimeType || 'image/webp');
  let isLottieJson = false;

  // If requested lottie and user wants json, we can unpack gzipped TGS
  if (format === 'lottie') {
    try {
      const decompressed = zlib.gunzipSync(buffer);
      buffer = decompressed;
      mimeType = 'application/json';
      isLottieJson = true;
    } catch (_) {
      // Keep raw TGS
    }
  }

  stickerBufferCache.set(docId, { buffer, mimeType });

  return {
    buffer,
    mimeType,
    fileName: `telegram_sticker_${docId}.${isLottieJson ? 'json' : isLottie ? 'tgs' : 'webp'}`,
    isLottieJson,
  };
}

/**
 * Send a Telegram sticker into a chat using official MTProto InputDocument
 */
export async function sendTelegramSticker(
  sessionString: string,
  peerId: string,
  documentId: string,
  accessHash: string,
  fileReference: string,
  replyTo?: number
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  let targetPeer: any = peerId;
  if (session.entityCache.has(peerId)) {
    targetPeer = session.entityCache.get(peerId);
  } else {
    try {
      targetPeer = await client.getInputEntity(peerId.startsWith('-') ? bigInt(peerId) : peerId);
    } catch (_) {
      try {
        targetPeer = await client.getEntity(bigInt(peerId));
      } catch (e) {
        targetPeer = peerId;
      }
    }
  }

  const inputDoc = new Api.InputDocument({
    id: bigInt(documentId),
    accessHash: bigInt(accessHash),
    fileReference: Buffer.from(fileReference, 'base64'),
  });

  const sent: any = await (client as any).sendFile(targetPeer, {
    file: inputDoc as any,
    replyTo: replyTo ? Number(replyTo) : undefined,
  });

  return formatTelegramMessage(sent);
}

/**
 * Search animated GIFs using Telegram MTProto inline bot and animated GIF sources
 */
export async function searchTelegramGifs(
  sessionString: string,
  query: string,
  peerId?: string
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  const q = query.trim() || 'trending';
  const results: any[] = [];

  // Try inline bot @gif or @tenor
  try {
    let targetPeer: any = peerId || 'me';
    if (peerId && session.entityCache.has(peerId)) {
      targetPeer = session.entityCache.get(peerId);
    } else {
      try {
        targetPeer = await client.getInputEntity(peerId && peerId.startsWith('-') ? bigInt(peerId) : (peerId || 'me'));
      } catch (_) {
        targetPeer = 'me';
      }
    }

    const botPeer = await client.getInputEntity('gif');
    const botRes: any = await client.invoke(
      new Api.messages.GetInlineBotResults({
        bot: botPeer,
        peer: targetPeer,
        query: q,
        offset: '',
      })
    );

    if (botRes && botRes.results && botRes.results.length > 0) {
      for (const r of botRes.results) {
        if (r.document) {
          const doc = r.document;
          results.push({
            id: doc.id.toString(),
            accessHash: doc.accessHash.toString(),
            fileReference: doc.fileReference ? doc.fileReference.toString('base64') : '',
            url: r.url || '',
            previewUrl: r.thumb?.url || r.url || '',
            title: r.title || 'GIF',
            type: 'telegram_inline',
          });
        } else if (r.content) {
          results.push({
            id: r.id || String(Math.random()),
            url: r.content.url || '',
            previewUrl: r.thumb?.url || r.content.url || '',
            title: r.title || 'GIF',
            type: 'web_gif',
          });
        }
      }
    }
  } catch (_) {}

  // Fallback to high-quality animated GIFs from Tenor public search API if inline bot returns few/no results
  if (results.length < 8) {
    try {
      const encoded = encodeURIComponent(q);
      const res = await fetch(`https://g.tenor.com/v1/search?q=${encoded}&key=LIVDSRZULELA&limit=24`);
      if (res.ok) {
        const data = await res.json();
        if (data.results && Array.isArray(data.results)) {
          for (const item of data.results) {
            const media = item.media?.[0];
            const gifUrl = media?.gif?.url || media?.tinygif?.url || media?.mp4?.url;
            const previewUrl = media?.tinygif?.url || media?.nanogif?.url || gifUrl;
            if (gifUrl) {
              results.push({
                id: item.id || String(Math.random()),
                url: gifUrl,
                previewUrl,
                title: item.content_description || item.title || 'GIF',
                type: 'tenor_gif',
              });
            }
          }
        }
      }
    } catch (_) {}
  }

  return results;
}

/**
 * Send an animated GIF into a Telegram chat
 */
export async function sendTelegramGif(
  sessionString: string,
  peerId: string,
  gifUrl: string,
  replyTo?: number
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  let targetPeer: any = peerId;
  if (session.entityCache.has(peerId)) {
    targetPeer = session.entityCache.get(peerId);
  } else {
    try {
      targetPeer = await client.getInputEntity(peerId.startsWith('-') ? bigInt(peerId) : peerId);
    } catch (_) {
      try {
        targetPeer = await client.getEntity(bigInt(peerId));
      } catch (e) {
        targetPeer = peerId;
      }
    }
  }

  const res = await fetch(gifUrl);
  if (!res.ok) {
    throw new Error('فشل جلب ملف الـ GIF للإرسال');
  }
  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);

  const customFile = new CustomFile('animation.mp4', buffer.length, '', buffer);

  const sent: any = await client.sendFile(targetPeer, {
    file: customFile,
    forceDocument: false,
    replyTo: replyTo ? Number(replyTo) : undefined,
  });

  return formatTelegramMessage(sent);
}

// ----------------------------------------------------
// Chat Folders & Filters Management (account.getDialogFilters)
// ----------------------------------------------------

/**
 * Get user dialog folders from Telegram cloud
 */
export async function getTelegramFolders(sessionString: string) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  try {
    const filters: any = await client.invoke(new Api.messages.GetDialogFilters());
    const result: any[] = [];
    if (Array.isArray(filters)) {
      for (const f of filters) {
        if (f instanceof Api.DialogFilter) {
          result.push({
            id: f.id,
            title: f.title,
            emoticon: f.emoticon || '',
            contacts: !!f.contacts,
            nonContacts: !!f.nonContacts,
            groups: !!f.groups,
            broadcasts: !!f.broadcasts,
            bots: !!f.bots,
            excludeMuted: !!f.excludeMuted,
            excludeRead: !!f.excludeRead,
            excludeArchived: !!f.excludeArchived,
            includePeerIds: f.includePeers?.map((p: any) => getPeerId(p).toString()) || [],
            excludePeerIds: f.excludePeers?.map((p: any) => getPeerId(p).toString()) || [],
          });
        }
      }
    }
    return result;
  } catch (err) {
    console.warn('Could not fetch cloud dialog filters:', err);
    return [];
  }
}

/**
 * Create or update a dialog folder filter in Telegram
 */
export async function updateTelegramFolder(
  sessionString: string,
  filterData: {
    id?: number;
    title: string;
    emoticon?: string;
    groups?: boolean;
    broadcasts?: boolean;
    contacts?: boolean;
    nonContacts?: boolean;
    bots?: boolean;
    excludeMuted?: boolean;
    excludeRead?: boolean;
    excludeArchived?: boolean;
    includePeerIds?: string[];
    excludePeerIds?: string[];
  }
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  const filterId = filterData.id || Math.floor(Math.random() * 200) + 2;

  const includePeers: any[] = [];
  if (filterData.includePeerIds && Array.isArray(filterData.includePeerIds)) {
    for (const pid of filterData.includePeerIds) {
      try {
        const input = await client.getInputEntity(pid.startsWith('-') ? bigInt(pid) : pid);
        includePeers.push(input);
      } catch (_) {}
    }
  }

  const excludePeers: any[] = [];
  if (filterData.excludePeerIds && Array.isArray(filterData.excludePeerIds)) {
    for (const pid of filterData.excludePeerIds) {
      try {
        const input = await client.getInputEntity(pid.startsWith('-') ? bigInt(pid) : pid);
        excludePeers.push(input);
      } catch (_) {}
    }
  }

  const filter = new Api.DialogFilter({
    id: filterId,
    title: new Api.TextWithEntities({ text: filterData.title, entities: [] }),
    emoticon: filterData.emoticon || undefined,
    contacts: filterData.contacts ?? false,
    nonContacts: filterData.nonContacts ?? false,
    groups: filterData.groups ?? false,
    broadcasts: filterData.broadcasts ?? false,
    bots: filterData.bots ?? false,
    excludeMuted: filterData.excludeMuted ?? false,
    excludeRead: filterData.excludeRead ?? false,
    excludeArchived: filterData.excludeArchived ?? true,
    pinnedPeers: [],
    includePeers,
    excludePeers,
  });

  await client.invoke(
    new Api.messages.UpdateDialogFilter({
      id: filterId,
      filter,
    })
  );

  return { success: true, id: filterId, title: filterData.title };
}

/**
 * Delete a dialog folder filter from Telegram
 */
export async function deleteTelegramFolder(sessionString: string, filterId: number) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  await client.invoke(
    new Api.messages.UpdateDialogFilter({
      id: Number(filterId),
      filter: undefined,
    })
  );

  return { success: true, id: filterId };
}

// ----------------------------------------------------
// Global Cloud Search (contacts.Search & messages.SearchGlobal)
// ----------------------------------------------------

/**
 * Search global contacts, public channels, groups, and global messages
 */
export async function searchTelegramGlobal(sessionString: string, query: string) {
  const session = await getClientForSession(sessionString);
  const client = session.client;
  const cleanQ = query.trim();
  if (!cleanQ) {
    return { contacts: [], chats: [], messages: [] };
  }

  let contactsResults: any[] = [];
  let chatsResults: any[] = [];
  try {
    const searchRes: any = await client.invoke(
      new Api.contacts.Search({
        q: cleanQ,
        limit: 15,
      })
    );

    if (searchRes.users && Array.isArray(searchRes.users)) {
      for (const u of searchRes.users) {
        const idStr = u.id?.toString() || '';
        if (idStr) session.entityCache.set(idStr, u);
        contactsResults.push({
          id: idStr,
          title: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || 'مستخدم تليجرام',
          username: u.username || null,
          phone: u.phone || null,
          verified: !!u.verified,
          isUser: true,
          isGroup: false,
          isChannel: false,
          bot: !!u.bot,
        });
      }
    }

    if (searchRes.chats && Array.isArray(searchRes.chats)) {
      for (const c of searchRes.chats) {
        const idStr = c.id ? (c.broadcast ? `-100${c.id}` : `-${c.id}`) : '';
        if (idStr) session.entityCache.set(idStr, c);
        chatsResults.push({
          id: idStr,
          title: c.title || 'مجموعة/قناة',
          username: (c as any).username || null,
          verified: !!(c as any).verified,
          isUser: false,
          isGroup: !c.broadcast,
          isChannel: !!c.broadcast,
          participantsCount: (c as any).participantsCount || undefined,
        });
      }
    }
  } catch (err) {
    console.warn('contacts.Search error:', err);
  }

  let messageResults: any[] = [];
  try {
    const msgRes: any = await client.invoke(
      new Api.messages.SearchGlobal({
        q: cleanQ,
        filter: new Api.InputMessagesFilterEmpty(),
        minDate: 0,
        maxDate: 0,
        offsetRate: 0,
        offsetPeer: new Api.InputPeerEmpty(),
        offsetId: 0,
        limit: 15,
      })
    );

    if (msgRes.messages && Array.isArray(msgRes.messages)) {
      messageResults = msgRes.messages.map((m: any) => {
        const myId = session.me?.id?.toString();
        const chatId = extractChatId(m, myId);
        return {
          ...formatTelegramMessage(m),
          chatId,
        };
      });
    }
  } catch (err) {
    console.warn('messages.SearchGlobal error:', err);
  }

  return {
    contacts: contactsResults,
    chats: chatsResults,
    messages: messageResults,
  };
}

/**
 * Search messages inside a specific chat via Telegram MTProto API
 */
export async function searchTelegramChatMessages(
  sessionString: string,
  peerId: string,
  query: string = '',
  options: {
    minDate?: number;
    maxDate?: number;
    limit?: number;
    offsetId?: number;
  } = {}
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  let targetPeer: any = peerId;
  if (session.entityCache.has(peerId)) {
    targetPeer = session.entityCache.get(peerId);
  } else {
    try {
      targetPeer = await client.getInputEntity(peerId.startsWith('-') ? bigInt(peerId) : peerId);
    } catch (_) {
      try {
        targetPeer = await client.getEntity(bigInt(peerId));
      } catch (e) {
        targetPeer = peerId;
      }
    }
  }

  const { minDate = 0, maxDate = 0, limit = 50, offsetId = 0 } = options;

  try {
    const res: any = await client.invoke(
      new Api.messages.Search({
        peer: targetPeer,
        q: query || '',
        filter: new Api.InputMessagesFilterEmpty(),
        minDate,
        maxDate,
        offsetId,
        addOffset: 0,
        limit,
        maxId: 0,
        minId: 0,
        hash: BigInt(0) as any,
      })
    );

    const messages = (res.messages || []).map((m: any) => formatTelegramMessage(m));
    return {
      count: res.count || messages.length,
      messages,
    };
  } catch (err: any) {
    console.warn('messages.Search in chat error:', err);
    throw err;
  }
}

// ----------------------------------------------------
// New Chats & Channels Creation
// ----------------------------------------------------

/**
 * Create a new Telegram Group
 */
export async function createTelegramGroup(
  sessionString: string,
  title: string,
  usernamesOrPhones: string[] = [],
  about: string = ''
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  const inputUsers: any[] = [];
  for (const userIdent of usernamesOrPhones) {
    const clean = userIdent.trim().replace(/^@/, '');
    if (!clean) continue;
    try {
      const resolved = await client.getInputEntity(clean);
      inputUsers.push(resolved);
    } catch (_) {}
  }

  try {
    const res: any = await client.invoke(
      new Api.channels.CreateChannel({
        title,
        about: about || '',
        megagroup: true,
      })
    );
    const channel = res.chats?.[0];
    const channelId = channel ? `-100${channel.id}` : '';

    if (channel && inputUsers.length > 0) {
      try {
        await client.invoke(
          new Api.channels.InviteToChannel({
            channel: await client.getInputEntity(channel),
            users: inputUsers,
          })
        );
      } catch (_) {}
    }

    session.cachedDialogs = undefined;
    session.lastDialogsFetch = undefined;

    return {
      success: true,
      chatId: channelId,
      title,
      isGroup: true,
    };
  } catch (err: any) {
    const res: any = await client.invoke(
      new Api.messages.CreateChat({
        title,
        users: inputUsers,
      })
    );
    const chat = res.chats?.[0];
    const chatId = chat ? `-${chat.id}` : '';

    session.cachedDialogs = undefined;
    session.lastDialogsFetch = undefined;

    return {
      success: true,
      chatId,
      title,
      isGroup: true,
    };
  }
}

/**
 * Create a new Telegram Channel
 */
export async function createTelegramChannel(
  sessionString: string,
  title: string,
  about: string = ''
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  const res: any = await client.invoke(
    new Api.channels.CreateChannel({
      title,
      about,
      broadcast: true,
    })
  );

  const channel = res.chats?.[0];
  const channelId = channel ? `-100${channel.id}` : '';

  session.cachedDialogs = undefined;
  session.lastDialogsFetch = undefined;

  return {
    success: true,
    chatId: channelId,
    title,
    isChannel: true,
  };
}

/**
 * Resolve a Telegram user or channel by @username
 */
export async function resolveTelegramContact(sessionString: string, identifier: string) {
  const session = await getClientForSession(sessionString);
  const client = session.client;
  const clean = identifier.trim().replace(/^@/, '');

  try {
    const res: any = await client.invoke(
      new Api.contacts.ResolveUsername({
        username: clean,
      })
    );

    const user = res.users?.[0];
    const chat = res.chats?.[0];

    if (user) {
      const idStr = user.id.toString();
      session.entityCache.set(idStr, user);
      return {
        success: true,
        id: idStr,
        title: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'مستخدم',
        username: user.username || null,
        phone: user.phone || null,
        isUser: true,
        isGroup: false,
        isChannel: false,
      };
    } else if (chat) {
      const idStr = chat.broadcast ? `-100${chat.id}` : `-${chat.id}`;
      session.entityCache.set(idStr, chat);
      return {
        success: true,
        id: idStr,
        title: chat.title || 'مجموعة/قناة',
        username: (chat as any).username || null,
        isUser: false,
        isGroup: !chat.broadcast,
        isChannel: !!chat.broadcast,
      };
    }

    throw new Error('لم يتم العثور على مستخدم أو قناة بهذا المعرف');
  } catch (err: any) {
    throw new Error(err.errorMessage || err.message || 'تعذر العثور على جهة الاتصال');
  }
}

// ----------------------------------------------------
// Real-time WebRTC Calling & Group Voice Chat Space Hub
// ----------------------------------------------------

interface ActiveCallRecord {
  callId: string;
  callerPeerId: string;
  callerSession: string;
  calleePeerId: string;
  isVideo: boolean;
  status: 'calling' | 'ringing' | 'connected' | 'ended' | 'rejected';
  sdpOffer?: any;
  sdpAnswer?: any;
  candidates: any[];
  createdAt: number;
}

const activeCalls = new Map<string, ActiveCallRecord>();

interface ActiveVoiceSpaceRecord {
  chatId: string;
  title: string;
  isChannel: boolean;
  isActive: boolean;
  participants: Map<string, {
    id: string;
    name: string;
    username?: string | null;
    isSpeaking: boolean;
    isMuted: boolean;
    isRaisedHand: boolean;
    isVideo: boolean;
    role: 'admin' | 'speaker' | 'listener';
    joinedAt: number;
  }>;
  createdAt: number;
}

const activeVoiceSpaces = new Map<string, ActiveVoiceSpaceRecord>();

/**
 * Handle WebRTC Call Signal (offer, answer, candidate, end, reject)
 */
export async function handleCallSignal(sessionString: string, signalData: {
  action: 'call_offer' | 'call_answer' | 'ice_candidate' | 'call_end' | 'call_reject';
  callId: string;
  peerId: string;
  isVideo?: boolean;
  sdp?: any;
  candidate?: any;
}) {
  const session = await getClientForSession(sessionString);
  const myId = session.me?.id?.toString() || 'me';
  const myName = [session.me?.firstName, session.me?.lastName].filter(Boolean).join(' ') || session.me?.username || 'أنا';

  const { action, callId, peerId, isVideo, sdp, candidate } = signalData;

  if (action === 'call_offer') {
    const callRecord: ActiveCallRecord = {
      callId,
      callerPeerId: myId,
      callerSession: sessionString,
      calleePeerId: peerId,
      isVideo: !!isVideo,
      status: 'calling',
      sdpOffer: sdp,
      candidates: [],
      createdAt: Date.now(),
    };
    activeCalls.set(callId, callRecord);

    // Broadcast incoming call event to all active sessions (e.g. other tabs or callee)
    for (const [sessKey, s] of activeSessions.entries()) {
      if (sessKey !== sessionString || true) {
        for (const sub of s.eventSubscribers) {
          try {
            sub({
              event: 'call_incoming',
              payload: {
                callId,
                callerId: myId,
                callerName: myName,
                peerId: myId,
                isVideo: !!isVideo,
                sdp,
              },
            });
          } catch (_) {}
        }
      }
    }

    return { success: true, callId, status: 'calling' };
  }

  if (action === 'call_answer') {
    const existing = activeCalls.get(callId);
    if (existing) {
      existing.status = 'connected';
      existing.sdpAnswer = sdp;
    }

    for (const s of activeSessions.values()) {
      for (const sub of s.eventSubscribers) {
        try {
          sub({
            event: 'call_answered',
            payload: { callId, sdp },
          });
        } catch (_) {}
      }
    }
    return { success: true, callId, status: 'connected' };
  }

  if (action === 'ice_candidate') {
    const existing = activeCalls.get(callId);
    if (existing && candidate) {
      existing.candidates.push(candidate);
    }
    for (const s of activeSessions.values()) {
      for (const sub of s.eventSubscribers) {
        try {
          sub({
            event: 'call_candidate',
            payload: { callId, candidate },
          });
        } catch (_) {}
      }
    }
    return { success: true };
  }

  if (action === 'call_end' || action === 'call_reject') {
    activeCalls.delete(callId);
    for (const s of activeSessions.values()) {
      for (const sub of s.eventSubscribers) {
        try {
          sub({
            event: 'call_ended',
            payload: { callId, reason: action },
          });
        } catch (_) {}
      }
    }
    return { success: true, callId, status: 'ended' };
  }

  return { success: true };
}

/**
 * Get or initialize Voice Chat Space for a chat/channel
 */
export function getVoiceChatSpace(chatId: string, title?: string, isChannel: boolean = false) {
  let space = activeVoiceSpaces.get(chatId);
  if (!space) {
    space = {
      chatId,
      title: title || 'محادثة صوتية',
      isChannel,
      isActive: false,
      participants: new Map(),
      createdAt: Date.now(),
    };
    activeVoiceSpaces.set(chatId, space);
  }

  return {
    chatId: space.chatId,
    title: space.title,
    isChannel: space.isChannel,
    isActive: space.isActive,
    participants: Array.from(space.participants.values()),
  };
}

/**
 * Join Voice Chat Space
 */
export async function joinVoiceChatSpace(
  sessionString: string,
  chatId: string,
  title?: string,
  isChannel: boolean = false
) {
  const session = await getClientForSession(sessionString);
  const myId = session.me?.id?.toString() || 'me';
  const myName = [session.me?.firstName, session.me?.lastName].filter(Boolean).join(' ') || session.me?.username || 'أنا';
  const myUsername = session.me?.username || null;

  let space = activeVoiceSpaces.get(chatId);
  if (!space) {
    space = {
      chatId,
      title: title || 'محادثة صوتية',
      isChannel,
      isActive: true,
      participants: new Map(),
      createdAt: Date.now(),
    };
    activeVoiceSpaces.set(chatId, space);
  } else {
    space.isActive = true;
  }

  space.participants.set(myId, {
    id: myId,
    name: myName,
    username: myUsername,
    isSpeaking: false,
    isMuted: true,
    isRaisedHand: false,
    isVideo: false,
    role: space.participants.size === 0 ? 'admin' : 'listener',
    joinedAt: Date.now(),
  });

  const payload = {
    chatId: space.chatId,
    title: space.title,
    isChannel: space.isChannel,
    isActive: space.isActive,
    participants: Array.from(space.participants.values()),
  };

  // Broadcast to all sessions
  for (const s of activeSessions.values()) {
    for (const sub of s.eventSubscribers) {
      try {
        sub({ event: 'voice_chat_update', payload });
      } catch (_) {}
    }
  }

  return payload;
}

/**
 * Leave Voice Chat Space
 */
export async function leaveVoiceChatSpace(sessionString: string, chatId: string) {
  const session = await getClientForSession(sessionString);
  const myId = session.me?.id?.toString() || 'me';

  const space = activeVoiceSpaces.get(chatId);
  if (space) {
    space.participants.delete(myId);
    if (space.participants.size === 0) {
      space.isActive = false;
    }

    const payload = {
      chatId: space.chatId,
      title: space.title,
      isChannel: space.isChannel,
      isActive: space.isActive,
      participants: Array.from(space.participants.values()),
    };

    for (const s of activeSessions.values()) {
      for (const sub of s.eventSubscribers) {
        try {
          sub({ event: 'voice_chat_update', payload });
        } catch (_) {}
      }
    }

    return payload;
  }

  return { success: true };
}

/**
 * Update Voice Chat Participant state (speaking, mute, raise hand, video)
 */
export async function updateVoiceChatState(
  sessionString: string,
  chatId: string,
  state: { isSpeaking?: boolean; isMuted?: boolean; isRaisedHand?: boolean; isVideo?: boolean }
) {
  const session = await getClientForSession(sessionString);
  const myId = session.me?.id?.toString() || 'me';

  const space = activeVoiceSpaces.get(chatId);
  if (space && space.participants.has(myId)) {
    const p = space.participants.get(myId)!;
    if (state.isSpeaking !== undefined) p.isSpeaking = state.isSpeaking;
    if (state.isMuted !== undefined) p.isMuted = state.isMuted;
    if (state.isRaisedHand !== undefined) p.isRaisedHand = state.isRaisedHand;
    if (state.isVideo !== undefined) p.isVideo = state.isVideo;

    const payload = {
      chatId: space.chatId,
      title: space.title,
      isChannel: space.isChannel,
      isActive: space.isActive,
      participants: Array.from(space.participants.values()),
    };

    for (const s of activeSessions.values()) {
      for (const sub of s.eventSubscribers) {
        try {
          sub({ event: 'voice_chat_update', payload });
        } catch (_) {}
      }
    }

    return payload;
  }

  return { success: true };
}

/**
 * Forward Telegram Messages to another chat / dialog
 */
export async function forwardTelegramMessages(
  sessionString: string,
  toPeerId: string,
  fromPeerId: string,
  messageIds: number[],
  dropAuthor = false,
  silent = false
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  let targetToPeer: any = toPeerId;
  try {
    targetToPeer = await client.getInputEntity(toPeerId.startsWith('-') ? bigInt(toPeerId) : toPeerId);
  } catch (_) {
    targetToPeer = toPeerId;
  }

  let targetFromPeer: any = fromPeerId;
  try {
    targetFromPeer = await client.getInputEntity(fromPeerId.startsWith('-') ? bigInt(fromPeerId) : fromPeerId);
  } catch (_) {
    targetFromPeer = fromPeerId;
  }

  const result: any = await client.forwardMessages(targetToPeer, {
    messages: messageIds,
    fromPeer: targetFromPeer,
    dropAuthor: !!dropAuthor,
    silent: !!silent,
  });

  return {
    success: true,
    forwardedCount: Array.isArray(result) ? result.length : 1,
  };
}

/**
 * Pin a message in chat
 */
export async function pinTelegramMessage(
  sessionString: string,
  peerId: string,
  messageId: number,
  silent = false,
  pmOneSide = false
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  let targetPeer: any = peerId;
  try {
    targetPeer = await client.getInputEntity(peerId.startsWith('-') ? bigInt(peerId) : peerId);
  } catch (_) {
    targetPeer = peerId;
  }

  await client.pinMessage(targetPeer, messageId, {
    notify: !silent,
    pmOneSide: !!pmOneSide,
  });

  return { success: true, messageId };
}

/**
 * Unpin message in chat
 */
export async function unpinTelegramMessage(
  sessionString: string,
  peerId: string,
  messageId?: number
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  let targetPeer: any = peerId;
  try {
    targetPeer = await client.getInputEntity(peerId.startsWith('-') ? bigInt(peerId) : peerId);
  } catch (_) {
    targetPeer = peerId;
  }

  if (messageId && messageId > 0) {
    await client.unpinMessage(targetPeer, messageId);
  } else {
    try {
      await client.invoke(new Api.messages.UnpinAllMessages({ peer: targetPeer }));
    } catch (_) {
      if (messageId) await client.unpinMessage(targetPeer, messageId);
    }
  }

  return { success: true };
}

/**
 * Send Poll or Quiz to a chat
 */
export async function sendTelegramPoll(
  sessionString: string,
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
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  let targetPeer: any = peerId;
  try {
    targetPeer = await client.getInputEntity(peerId.startsWith('-') ? bigInt(peerId) : peerId);
  } catch (_) {
    targetPeer = peerId;
  }

  const pollAnswers = answers.map((ans, idx) => {
    return new Api.PollAnswer({
      text: new Api.TextWithEntities({ text: ans, entities: [] }),
      option: Buffer.from(idx.toString()),
    });
  });

  const poll = new Api.Poll({
    id: bigInt(Date.now()),
    question: new Api.TextWithEntities({ text: question, entities: [] }),
    answers: pollAnswers,
    closed: !!options?.closed,
    publicVoters: options?.publicVoters !== undefined ? options.publicVoters : false,
    multipleChoice: !!options?.multipleChoice,
    quiz: !!options?.quiz,
  });

  let correctAnswersBuffers: Buffer[] | undefined;
  if (options?.quiz && options.correctAnswers && options.correctAnswers.length > 0) {
    correctAnswersBuffers = options.correctAnswers.map((idx) => Buffer.from(idx.toString()));
  }

  const inputMedia = new Api.InputMediaPoll({
    poll,
    correctAnswers: correctAnswersBuffers,
    solution: options?.solution,
    solutionEntities: [],
  });

  const sentMessage: any = await client.sendMessage(targetPeer, {
    file: inputMedia,
  });

  return formatTelegramMessage(sentMessage);
}

/**
 * Vote on a Poll in a chat
 */
export async function voteTelegramPoll(
  sessionString: string,
  peerId: string,
  messageId: number,
  options: string[]
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  let targetPeer: any = peerId;
  try {
    targetPeer = await client.getInputEntity(peerId.startsWith('-') ? bigInt(peerId) : peerId);
  } catch (_) {
    targetPeer = peerId;
  }

  const optionsBuffers = options.map((opt) => {
    try {
      if (opt.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(opt)) {
        return Buffer.from(opt, 'hex');
      }
    } catch (_) {}
    return Buffer.from(opt);
  });

  await client.invoke(
    new Api.messages.SendVote({
      peer: targetPeer,
      msgId: Number(messageId),
      options: optionsBuffers,
    })
  );

  return { success: true };
}

/**
 * Get contacts from Telegram Cloud
 */
export async function getTelegramContacts(sessionString: string) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  const result: any = await client.invoke(new Api.contacts.GetContacts({ hash: bigInt(0) }));
  const users = result.users || [];

  return users.map((u: any) => {
    let statusText = 'غير متاح';
    let isOnline = false;
    if (u.status) {
      const sName = u.status.className || u.status.constructor?.name || '';
      if (sName.includes('Online')) {
        statusText = 'متصل الآن';
        isOnline = true;
      } else if (sName.includes('Recently')) {
        statusText = 'آخر ظهور منذ قليل';
      } else if (sName.includes('Offline')) {
        const d = new Date((u.status.wasOnline || 0) * 1000);
        statusText = `آخر ظهور ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      } else if (sName.includes('LastWeek')) {
        statusText = 'آخر ظهور هذا الأسبوع';
      } else if (sName.includes('LastMonth')) {
        statusText = 'آخر ظهور هذا الشهر';
      }
    }

    return {
      id: u.id?.toString(),
      firstName: u.firstName || '',
      lastName: u.lastName || '',
      phone: u.phone ? (u.phone.startsWith('+') ? u.phone : `+${u.phone}`) : '',
      username: u.username || null,
      statusText,
      isOnline,
      mutual: !!u.mutualContact,
    };
  });
}

/**
 * Add a new contact to Telegram Cloud
 */
export async function addTelegramContact(
  sessionString: string,
  phone: string,
  firstName: string,
  lastName = ''
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  const cleanPhone = phone.replace(/[\s\-\(\)]/g, '').trim();

  const res: any = await client.invoke(
    new Api.contacts.AddContact({
      id: cleanPhone,
      firstName,
      lastName,
      phone: cleanPhone,
      addPhonePrivacyException: false,
    })
  );

  return { success: true, result: res };
}

/**
 * Get user profile info including Bio
 */
export async function getTelegramUserProfile(sessionString: string) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  const me: any = await client.getMe();
  let bio = '';
  try {
    const full: any = await client.invoke(new Api.users.GetFullUser({ id: me }));
    bio = full.fullUser?.about || '';
  } catch (_) {}

  return {
    id: me.id?.toString(),
    firstName: me.firstName || '',
    lastName: me.lastName || '',
    username: me.username || null,
    phone: me.phone ? `+${me.phone}` : null,
    bio,
  };
}

/**
 * Update User Profile (first name, last name, about/bio)
 */
export async function updateTelegramUserProfile(
  sessionString: string,
  firstName: string,
  lastName: string,
  about: string
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  await client.invoke(
    new Api.account.UpdateProfile({
      firstName,
      lastName,
      about: about.slice(0, 70),
    })
  );

  session.me = await client.getMe();
  return formatUser(session.me);
}

/**
 * Update @username
 */
export async function updateTelegramUsername(sessionString: string, username: string) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  const cleanUsername = username.replace(/^@/, '').trim();
  await client.invoke(
    new Api.account.UpdateUsername({
      username: cleanUsername,
    })
  );

  session.me = await client.getMe();
  return formatUser(session.me);
}

/**
 * Upload new Profile Avatar
 */
export async function uploadTelegramProfilePhoto(
  sessionString: string,
  buffer: Buffer,
  fileName = 'avatar.jpg'
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  const customFile = new CustomFile(fileName, buffer.length, '', buffer);
  const uploaded = await client.uploadFile({ file: customFile, workers: 1 });

  await client.invoke(
    new Api.photos.UploadProfilePhoto({
      file: uploaded,
    })
  );

  session.me = await client.getMe();
  return formatUser(session.me);
}

/**
 * Get active sessions / devices
 */
export async function getTelegramActiveSessions(sessionString: string) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  const res: any = await client.invoke(new Api.account.GetAuthorizations());
  const auths = res.authorizations || [];

  return auths.map((a: any) => ({
    hash: a.hash?.toString(),
    deviceModel: a.deviceModel || 'جهاز غير معروف',
    platform: a.platform || '',
    systemVersion: a.systemVersion || '',
    appName: a.appName || 'Telegram App',
    appVersion: a.appVersion || '1.0',
    dateCreated: a.dateCreated || 0,
    dateActive: a.dateActive || 0,
    ip: a.ip || '',
    country: a.country || '',
    region: a.region || '',
    isCurrent: !!a.current,
  }));
}

/**
 * Terminate a specific session by hash
 */
export async function terminateTelegramSession(sessionString: string, hash: string) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  await client.invoke(
    new Api.account.ResetAuthorization({
      hash: bigInt(hash),
    })
  );

  return { success: true };
}

/**
 * Terminate all other sessions
 */
export async function terminateAllOtherTelegramSessions(sessionString: string) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  await client.invoke(new Api.auth.ResetAuthorizations());
  return { success: true };
}

/**
 * Get Privacy settings
 */
export async function getTelegramPrivacySettings(sessionString: string) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  const parseRules = (rules: any[]): 'everybody' | 'contacts' | 'nobody' => {
    for (const r of rules || []) {
      const c = r.className || r.constructor?.name || '';
      if (c.includes('AllowAll')) return 'everybody';
      if (c.includes('AllowContacts')) return 'contacts';
      if (c.includes('DisallowAll')) return 'nobody';
    }
    return 'everybody';
  };

  let phoneNumber: 'everybody' | 'contacts' | 'nobody' = 'contacts';
  let lastSeen: 'everybody' | 'contacts' | 'nobody' = 'everybody';
  let profilePhoto: 'everybody' | 'contacts' | 'nobody' = 'everybody';
  let forwards: 'everybody' | 'contacts' | 'nobody' = 'everybody';

  try {
    const resPhone: any = await client.invoke(
      new Api.account.GetPrivacy({ key: new Api.InputPrivacyKeyPhoneNumber() })
    );
    phoneNumber = parseRules(resPhone.rules);
  } catch (_) {}

  try {
    const resStatus: any = await client.invoke(
      new Api.account.GetPrivacy({ key: new Api.InputPrivacyKeyStatusTimestamp() })
    );
    lastSeen = parseRules(resStatus.rules);
  } catch (_) {}

  try {
    const resPhoto: any = await client.invoke(
      new Api.account.GetPrivacy({ key: new Api.InputPrivacyKeyProfilePhoto() })
    );
    profilePhoto = parseRules(resPhoto.rules);
  } catch (_) {}

  try {
    const resFwd: any = await client.invoke(
      new Api.account.GetPrivacy({ key: new Api.InputPrivacyKeyForwards() })
    );
    forwards = parseRules(resFwd.rules);
  } catch (_) {}

  return {
    phoneNumber,
    lastSeen,
    profilePhoto,
    forwards,
  };
}

/**
 * Set Privacy rule
 */
export async function setTelegramPrivacyRule(
  sessionString: string,
  key: 'phone' | 'last_seen' | 'photo' | 'forwards',
  value: 'everybody' | 'contacts' | 'nobody'
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  let inputKey: any;
  if (key === 'phone') inputKey = new Api.InputPrivacyKeyPhoneNumber();
  else if (key === 'last_seen') inputKey = new Api.InputPrivacyKeyStatusTimestamp();
  else if (key === 'photo') inputKey = new Api.InputPrivacyKeyProfilePhoto();
  else inputKey = new Api.InputPrivacyKeyForwards();

  const rules: any[] = [];
  if (value === 'everybody') {
    rules.push(new Api.InputPrivacyValueAllowAll());
  } else if (value === 'contacts') {
    rules.push(new Api.InputPrivacyValueAllowContacts());
  } else {
    rules.push(new Api.InputPrivacyValueDisallowAll());
  }

  await client.invoke(
    new Api.account.SetPrivacy({
      key: inputKey,
      rules,
    })
  );

  return { success: true };
}

/**
 * Handle Bot Callback Button click
 */
export async function sendBotCallbackAnswer(
  sessionString: string,
  peerId: string,
  msgId: number,
  dataHex: string
) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  let targetPeer: any = peerId;
  try {
    targetPeer = await client.getInputEntity(peerId.startsWith('-') ? bigInt(peerId) : peerId);
  } catch (_) {
    targetPeer = peerId;
  }

  const res: any = await client.invoke(
    new Api.messages.GetBotCallbackAnswer({
      peer: targetPeer,
      msgId: Number(msgId),
      data: Buffer.from(dataHex, 'hex'),
    })
  );

  return {
    message: res.message || '',
    alert: !!res.alert,
    url: res.url || null,
  };
}

/**
 * Get full profile info for a user, group, or channel (bio, participants count, username, etc.)
 */
export async function getTelegramChatInfo(sessionString: string, peerId: string) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  let targetPeer: any = peerId;
  if (session.entityCache.has(peerId)) {
    targetPeer = session.entityCache.get(peerId);
  } else {
    try {
      targetPeer = await client.getInputEntity(peerId.startsWith('-') ? bigInt(peerId) : peerId);
    } catch (_) {
      try {
        targetPeer = await client.getEntity(bigInt(peerId));
      } catch (e) {
        targetPeer = peerId;
      }
    }
  }

  let entity: any = null;
  try {
    entity = await client.getEntity(targetPeer);
  } catch (_) {
    entity = session.entityCache.get(peerId) || null;
  }

  let about = '';
  let participantsCount: number | undefined = undefined;

  try {
    if (entity?.className === 'User' || (!peerId.startsWith('-') && !entity?.broadcast)) {
      const full: any = await client.invoke(new Api.users.GetFullUser({ id: targetPeer }));
      about = full.fullUser?.about || '';
    } else if (entity?.broadcast || entity?.megagroup || peerId.startsWith('-100')) {
      const full: any = await client.invoke(new Api.channels.GetFullChannel({ channel: targetPeer }));
      about = full.fullChat?.about || '';
      participantsCount = full.fullChat?.participantsCount || undefined;
    } else if (peerId.startsWith('-')) {
      const full: any = await client.invoke(new Api.messages.GetFullChat({ chatId: bigInt(peerId.replace('-', '')) }));
      about = full.fullChat?.about || '';
      participantsCount = full.fullChat?.participants?.participants?.length || undefined;
    }
  } catch (err) {
    // Fallback if full info cannot be fetched
  }

  const isChannel = !!entity?.broadcast;
  const isGroup = !!(entity?.megagroup || (entity?.className === 'Chat') || (peerId.startsWith('-') && !isChannel));
  const isUser = !isChannel && !isGroup;
  const isBot = !!entity?.bot;

  const title = isUser
    ? `${entity?.firstName || ''} ${entity?.lastName || ''}`.trim() || entity?.username || `User ${peerId}`
    : entity?.title || `Chat ${peerId}`;

  return {
    id: peerId,
    title,
    firstName: entity?.firstName || undefined,
    lastName: entity?.lastName || undefined,
    username: entity?.username || undefined,
    phone: entity?.phone || undefined,
    about: about || entity?.about || undefined,
    verified: !!entity?.verified,
    isChannel,
    isGroup,
    isUser,
    isBot,
    participantsCount,
    restricted: !!entity?.restricted,
    hasPhoto: !!(entity?.photo && entity.photo.className !== 'UserProfilePhotoEmpty' && entity.photo.className !== 'ChatPhotoEmpty'),
  };
}

