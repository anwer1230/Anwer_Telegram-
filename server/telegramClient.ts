import { TelegramClient, Api, password as tgPassword } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { CustomFile } from 'telegram/client/uploads.js';
import bigInt from 'big-integer';

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
 * Get or create an active TelegramClient instance for a given session string
 */
export async function getClientForSession(sessionString: string): Promise<ActiveSession> {
  const cleanKey = sessionString.trim();
  if (activeSessions.has(cleanKey)) {
    const existing = activeSessions.get(cleanKey)!;
    existing.lastActive = Date.now();
    if (!existing.client.connected) {
      await existing.client.connect();
    }
    return existing;
  }

  const stringSession = new StringSession(cleanKey);
  const client = new TelegramClient(stringSession, TELEGRAM_API_ID, TELEGRAM_API_HASH, {
    connectionRetries: 5,
    useWSS: false,
  });

  await client.connect();

  const sessionObj: ActiveSession = {
    client,
    sessionString: cleanKey,
    lastActive: Date.now(),
    entityCache: new Map(),
  };

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
    activeSessions.set(sessionString, {
      client,
      sessionString,
      phone: cleanPhone,
      lastActive: Date.now(),
      entityCache: new Map(),
    });

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

  activeSessions.set(sessionString, {
    client,
    sessionString,
    phone: cleanPhone,
    lastActive: Date.now(),
    entityCache: new Map(),
  });

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

  activeSessions.set(sessionString, {
    client,
    sessionString,
    lastActive: Date.now(),
    entityCache: new Map(),
  });

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

    formattedDialogs.push({
      id: idStr,
      title: d.title || d.name || 'محادثة',
      name: d.name || d.title || 'محادثة',
      isUser: !!d.isUser,
      isGroup: !!d.isGroup,
      isChannel: !!d.isChannel,
      unreadCount: d.unreadCount || 0,
      pinned: !!d.pinned,
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

  return formattedDialogs;
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

  return messages.map((m: any) => {
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

        if (doc?.attributes && Array.isArray(doc.attributes)) {
          for (const attr of doc.attributes) {
            if (attr.fileName) fileName = attr.fileName;
            if (attr.w && attr.h) {
              width = attr.w;
              height = attr.h;
            }
            if (attr.duration) duration = attr.duration;
          }
        }

        if (mime.includes('audio') || mime.includes('ogg')) {
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
      views: m.views || null,
      forwards: m.forwards || null,
    };
  });
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
