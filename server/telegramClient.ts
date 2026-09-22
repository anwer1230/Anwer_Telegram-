import { TelegramClient, Api, password as tgPassword } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { CustomFile } from 'telegram/client/uploads.js';
import { NewMessage, Raw } from 'telegram/events/index.js';
import { getPeerId } from 'telegram/Utils.js';
import bigInt from 'big-integer';
import zlib from 'zlib';

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
  me?: any;
  cachedDialogs?: any[];
  lastDialogsFetch?: number;
  eventListenersAttached?: boolean;
  eventSubscribers: Set<(data: { event: string; payload: any }) => void>;
}

const activeSessions = new Map<string, ActiveSession>();
const pendingAuth = new Map<string, { client: TelegramClient; phoneCodeHash?: string; phone: string; createdAt: number }>();

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
export async function getTelegramDialogs(sessionString: string, limit = 40) {
  const session = await getClientForSession(sessionString);
  const client = session.client;

  // Serve from memory cache if less than 15 seconds old
  if (session.cachedDialogs && session.lastDialogsFetch && Date.now() - session.lastDialogsFetch < 15000) {
    return session.cachedDialogs;
  }

  const dialogs = await client.getDialogs({ limit });
  const formattedDialogs = [];

  for (const d of dialogs) {
    const idStr = d.id?.toString() || '';
    if (idStr) {
      session.entityCache.set(idStr, d.inputEntity || d.entity);
    }

    let lastText = '';
    if (d.message?.message) {
      lastText = d.message.message;
    } else if (d.message?.media) {
      lastText = '[وسائط / ملف]';
    }

    const muteUntil = (d.dialog as any)?.notifySettings?.muteUntil;
    const muted = !!(muteUntil && Number(muteUntil) > Math.floor(Date.now() / 1000));

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
      date: d.date || 0,
      lastMessage: {
        text: lastText,
        date: d.message?.date || d.date || 0,
        out: !!d.message?.out,
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

  session.cachedDialogs = formattedDialogs;
  session.lastDialogsFetch = Date.now();

  return formattedDialogs;
}

/**
 * Format a Telegram message into our standard application model
 */
export function formatTelegramMessage(m: any) {
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
        }
      }

      if (isSticker || mime === 'application/x-tgsticker') {
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
        hasMedia: true,
      };
    } else if (className.includes('WebPage')) {
      mediaType = 'webpage';
    } else {
      mediaType = 'media';
      mediaInfo = { type: 'media', hasMedia: true };
    }
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

  return {
    id: m.id,
    text: m.message || '',
    date: m.date || 0,
    out: !!m.out,
    senderId: m.senderId?.toString?.() || '',
    mediaType,
    mediaInfo,
    replyToMsgId,
    reactions,
    editDate: m.editDate || null,
    views: m.views || null,
    forwards: m.forwards || null,
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
        }
      } catch (_) {}
    }, new Raw({}));
  } catch (err) {
    console.warn('Could not attach Raw handler:', err);
  }
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

  return () => {
    session.eventSubscribers.delete(subscriber);
  };
}

/**
 * Get messages from a chat / peer
 */
export async function getTelegramMessages(sessionString: string, peerId: string, limit = 50) {
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

  const messages = await client.getMessages(targetPeer, { limit });

  return messages.map((m: any) => formatTelegramMessage(m));
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

/**
 * Send a message to a chat / peer
 */
export async function sendTelegramMessage(
  sessionString: string,
  peerId: string,
  text: string,
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
      targetPeer = peerId;
    }
  }

  const sentMessage: any = await client.sendMessage(targetPeer, {
    message: text,
    replyTo: replyTo ? Number(replyTo) : undefined,
  });

  return {
    id: sentMessage.id,
    text: sentMessage.message || text,
    date: sentMessage.date || Math.floor(Date.now() / 1000),
    out: true,
    replyToMsgId: replyTo ? Number(replyTo) : undefined,
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
    mimeType?: string;
    replyTo?: number;
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

  const sentMessage: any = await client.sendFile(targetPeer, {
    file: customFile,
    caption: fileData.caption || '',
    voiceNote: isVoice,
    forceDocument: !isVoice && !isImage,
    replyTo: fileData.replyTo ? Number(fileData.replyTo) : undefined,
  });

  return {
    id: sentMessage.id,
    text: sentMessage.message || fileData.caption || '',
    date: sentMessage.date || Math.floor(Date.now() / 1000),
    out: true,
    replyToMsgId: fileData.replyTo ? Number(fileData.replyTo) : undefined,
    mediaType: isVoice ? 'voice' : isImage ? 'photo' : 'document',
    mediaInfo: {
      type: isVoice ? 'voice' : isImage ? 'photo' : 'document',
      fileName: fileData.fileName,
      mimeType: fileData.mimeType,
      size: fileData.buffer.length,
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
