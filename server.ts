import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  TELEGRAM_API_ID,
  TELEGRAM_API_HASH,
  sendTelegramCode,
  signInWithTelegramCode,
  checkTwoFactorPassword,
  signInWithBotToken,
  restoreTelegramSession,
  getTelegramDialogs,
  getTelegramMessages,
  downloadTelegramMedia,
  sendTelegramMessage,
  sendTelegramFile,
  sendTelegramReaction,
  editTelegramMessage,
  deleteTelegramMessages,
  logoutTelegramSession,
  getTelegramMe,
  subscribeToTelegramEvents,
  toggleTelegramDialogPin,
  updateTelegramNotifySettings,
  leaveTelegramChat,
  clearTelegramChatHistory,
  getTelegramAllStickers,
  getTelegramStickerSet,
  downloadTelegramStickerBuffer,
  sendTelegramSticker,
  searchTelegramGifs,
  sendTelegramGif,
  getFastActiveUser,
} from './server/telegramClient.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Health and Telegram Connection Status endpoint (ultra-fast, non-blocking)
  app.get('/api/telegram/status', async (req, res) => {
    try {
      const authHeader = req.headers['x-telegram-session'] as string | undefined;
      const user = authHeader ? getFastActiveUser(authHeader) : null;
      const authorized = !!user;

      res.json({
        success: true,
        apiId: TELEGRAM_API_ID,
        apiHashPrefix: TELEGRAM_API_HASH.substring(0, 6) + '...',
        officialCloud: true,
        mtprotoLayer: 198,
        authorized,
        user,
        connectedDc: '149.154.167.91 (DC2 Europe/Production)',
        serverTimestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Step 1: Send verification code to phone number
  app.post('/api/telegram/auth/send-code', async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) {
        return res.status(400).json({ success: false, error: 'رقم الهاتف مطلوب' });
      }
      const result = await sendTelegramCode(phone);
      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error('Error in send-code:', err);
      res.status(400).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل إرسال رمز التحقق من تليجرام',
      });
    }
  });

  // Step 2: Sign in with the received code
  app.post('/api/telegram/auth/sign-in', async (req, res) => {
    try {
      const { phone, code, phoneCodeHash } = req.body;
      if (!phone || !code) {
        return res.status(400).json({ success: false, error: 'رقم الهاتف ورمز التحقق مطلوبان' });
      }
      const result = await signInWithTelegramCode(phone, code, phoneCodeHash);
      res.json(result);
    } catch (err: any) {
      console.error('Error in sign-in:', err);
      res.status(400).json({
        success: false,
        error: err.errorMessage || err.message || 'رمز التحقق غير صحيح أو منتهي',
      });
    }
  });

  // Step 3: Check 2FA password (Cloud Password)
  app.post('/api/telegram/auth/check-password', async (req, res) => {
    try {
      const { phone, password } = req.body;
      if (!phone || !password) {
        return res.status(400).json({ success: false, error: 'كلمة المرور ورقم الهاتف مطلوبان' });
      }
      const result = await checkTwoFactorPassword(phone, password);
      res.json(result);
    } catch (err: any) {
      console.error('Error in check-password:', err);
      res.status(400).json({
        success: false,
        error: err.errorMessage || err.message || 'كلمة المرور غير صحيحة',
      });
    }
  });

  // Import existing Telegram session string
  app.post('/api/telegram/auth/import-session', async (req, res) => {
    try {
      const { sessionString } = req.body;
      if (!sessionString) {
        return res.status(400).json({ success: false, error: 'نص الجلسة مطلوب' });
      }
      const result = await restoreTelegramSession(sessionString);
      res.json(result);
    } catch (err: any) {
      console.error('Error in import-session:', err);
      res.status(400).json({
        success: false,
        error: err.errorMessage || err.message || 'جلسة تليجرام غير صالحة',
      });
    }
  });

  // Bot Token Login
  app.post('/api/telegram/auth/bot-login', async (req, res) => {
    try {
      const { botToken } = req.body;
      if (!botToken) {
        return res.status(400).json({ success: false, error: 'توكن البوت مطلوب' });
      }
      const result = await signInWithBotToken(botToken);
      res.json(result);
    } catch (err: any) {
      console.error('Error in bot-login:', err);
      res.status(400).json({
        success: false,
        error: err.errorMessage || err.message || 'توكن البوت غير صحيح',
      });
    }
  });

  // Current User Profile
  app.get('/api/telegram/me', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح: يلزم توفير الجلسة' });
      }
      const user = await getTelegramMe(sessionString);
      res.json({ success: true, user });
    } catch (err: any) {
      res.status(401).json({ success: false, error: err.message });
    }
  });

  // Dialogs / Chats
  app.get('/api/telegram/dialogs', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح: يلزم تسجيل الدخول' });
      }
      const limit = Number(req.query.limit) || 40;
      const dialogs = await getTelegramDialogs(sessionString, limit);
      res.json({ success: true, dialogs });
    } catch (err: any) {
      console.error('Error fetching dialogs:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل جلب المحادثات من تليجرام',
      });
    }
  });

  // Messages in a Chat
  app.get('/api/telegram/messages/:peerId', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح: يلزم تسجيل الدخول' });
      }
      const { peerId } = req.params;
      const limit = Number(req.query.limit) || 50;
      const messages = await getTelegramMessages(sessionString, peerId, limit);
      res.json({ success: true, messages });
    } catch (err: any) {
      console.error('Error fetching messages:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل جلب الرسائل',
      });
    }
  });

  // Media Streaming and Download Endpoint
  app.get('/api/telegram/media/:peerId/:messageId', async (req, res) => {
    try {
      const sessionString =
        (req.headers['x-telegram-session'] as string) ||
        (req.query.session as string);

      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح: يلزم تسجيل الدخول' });
      }

      const { peerId, messageId } = req.params;
      const isDownload = req.query.download === '1' || req.query.download === 'true';

      const media = await downloadTelegramMedia(
        sessionString,
        peerId,
        Number(messageId)
      );

      res.setHeader('Content-Type', media.mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', media.buffer.length);
      res.setHeader('Cache-Control', 'public, max-age=86400');

      if (isDownload) {
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${encodeURIComponent(media.fileName)}"`
        );
      } else {
        res.setHeader(
          'Content-Disposition',
          `inline; filename="${encodeURIComponent(media.fileName)}"`
        );
      }

      return res.send(media.buffer);
    } catch (err: any) {
      console.error('Error streaming/downloading media:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل تنزيل الوسائط من تليجرام',
      });
    }
  });

  // Send Message
  app.post('/api/telegram/send-message', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { peerId, message, replyTo } = req.body;
      if (!peerId || !message) {
        return res.status(400).json({ success: false, error: 'المعرف والرسالة مطلوبان' });
      }
      const sent = await sendTelegramMessage(
        sessionString,
        peerId,
        message,
        replyTo ? Number(replyTo) : undefined
      );
      res.json({ success: true, message: sent });
    } catch (err: any) {
      console.error('Error sending message:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل إرسال الرسالة',
      });
    }
  });

  // Send File, Photo, Document or Voice Note (with optional replyTo)
  app.post('/api/telegram/send-file', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { peerId, fileBase64, fileName, caption, voiceNote, mimeType, replyTo } = req.body;
      if (!peerId || !fileBase64) {
        return res.status(400).json({ success: false, error: 'المعرف وملف الوسائط مطلوبان' });
      }

      const cleanBase64 = fileBase64.includes(';base64,')
        ? fileBase64.split(';base64,')[1]
        : fileBase64;
      const buffer = Buffer.from(cleanBase64, 'base64');

      const sent = await sendTelegramFile(sessionString, peerId, {
        buffer,
        fileName: fileName || 'attachment',
        caption: caption || '',
        voiceNote: !!voiceNote,
        mimeType: mimeType || 'application/octet-stream',
        replyTo: replyTo ? Number(replyTo) : undefined,
      });

      res.json({ success: true, message: sent });
    } catch (err: any) {
      console.error('Error sending file/media:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل إرسال الملف إلى تليجرام',
      });
    }
  });

  // Send or Toggle Message Reaction
  app.post('/api/telegram/send-reaction', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { peerId, messageId, emoji } = req.body;
      if (!peerId || !messageId) {
        return res.status(400).json({ success: false, error: 'المعرف ورقم الرسالة مطلوبان' });
      }

      const result = await sendTelegramReaction(
        sessionString,
        peerId,
        Number(messageId),
        emoji
      );
      res.json(result);
    } catch (err: any) {
      console.error('Error sending reaction:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل إرسال التفاعل',
      });
    }
  });

  // Edit Message Text
  app.post('/api/telegram/edit-message', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { peerId, messageId, text } = req.body;
      if (!peerId || !messageId || typeof text !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'المعرف ورقم الرسالة والنص الجديد مطلوبة للتعديل',
        });
      }

      const result = await editTelegramMessage(
        sessionString,
        peerId,
        Number(messageId),
        text
      );
      res.json({ success: true, message: result });
    } catch (err: any) {
      console.error('Error editing message:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل تعديل الرسالة',
      });
    }
  });

  // Delete Messages (For everyone or for current user)
  app.post('/api/telegram/delete-messages', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { peerId, messageIds, revoke } = req.body;
      if (!peerId || !Array.isArray(messageIds) || messageIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'المعرف وأرقام الرسائل مطلوبة للحذف',
        });
      }

      const result = await deleteTelegramMessages(
        sessionString,
        peerId,
        messageIds.map((id) => Number(id)),
        revoke !== false
      );
      res.json(result);
    } catch (err: any) {
      console.error('Error deleting messages:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل حذف الرسائل في تليجرام',
      });
    }
  });

  // ----------------------
  // Chat Management Routes
  // ----------------------

  // Pin / Unpin Dialog
  app.post('/api/telegram/chat/pin', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { peerId, pinned } = req.body;
      if (!peerId) {
        return res.status(400).json({ success: false, error: 'معرف المحادثة مطلوب' });
      }
      const result = await toggleTelegramDialogPin(sessionString, peerId, !!pinned);
      res.json(result);
    } catch (err: any) {
      console.error('Error toggling pin:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل تثبيت/إلغاء تثبيت المحادثة',
      });
    }
  });

  // Mute / Unmute Dialog
  app.post('/api/telegram/chat/mute', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { peerId, mute } = req.body;
      if (!peerId) {
        return res.status(400).json({ success: false, error: 'معرف المحادثة مطلوب' });
      }
      const result = await updateTelegramNotifySettings(sessionString, peerId, !!mute);
      res.json(result);
    } catch (err: any) {
      console.error('Error updating mute settings:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل كتم/إلغاء كتم الإشعارات',
      });
    }
  });

  // Leave Group / Channel
  app.post('/api/telegram/chat/leave', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { peerId } = req.body;
      if (!peerId) {
        return res.status(400).json({ success: false, error: 'معرف المحادثة مطلوب' });
      }
      const result = await leaveTelegramChat(sessionString, peerId);
      res.json(result);
    } catch (err: any) {
      console.error('Error leaving chat:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل مغادرة المحادثة',
      });
    }
  });

  // Clear Chat History
  app.post('/api/telegram/chat/clear-history', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { peerId, revoke } = req.body;
      if (!peerId) {
        return res.status(400).json({ success: false, error: 'معرف المحادثة مطلوب' });
      }
      const result = await clearTelegramChatHistory(sessionString, peerId, revoke !== false);
      res.json(result);
    } catch (err: any) {
      console.error('Error clearing chat history:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل مسح سجل المحادثة',
      });
    }
  });

  // --------------------------------
  // Stickers & GIFs Picker Routes
  // --------------------------------

  // Get all installed sticker sets
  app.get('/api/telegram/stickers/all', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const sets = await getTelegramAllStickers(sessionString);
      res.json({ success: true, sets });
    } catch (err: any) {
      console.error('Error getting stickers:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل استرجاع حزم الملصقات',
      });
    }
  });

  // Get stickers in a specific set
  app.get('/api/telegram/stickers/set/:setId/:accessHash', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { setId, accessHash } = req.params;
      const data = await getTelegramStickerSet(sessionString, setId, accessHash);
      res.json({ success: true, ...data });
    } catch (err: any) {
      console.error('Error getting sticker set:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل استرجاع ملصقات الحزمة',
      });
    }
  });

  // Download / View Sticker media buffer (supports WebP and Lottie JSON/TGS)
  app.get('/api/telegram/stickers/media/:docId', async (req, res) => {
    try {
      const sessionString =
        (req.headers['x-telegram-session'] as string) ||
        (req.query.session as string);
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }

      const { docId } = req.params;
      const accessHash = req.query.accessHash as string | undefined;
      const fileReference = req.query.fileReference as string | undefined;
      const download = req.query.download === '1' || req.query.download === 'true';
      const format = (req.query.format as 'webp' | 'lottie') || undefined;

      const media = await downloadTelegramStickerBuffer(
        sessionString,
        docId,
        accessHash,
        fileReference,
        format
      );

      res.setHeader('Content-Type', media.mimeType);
      res.setHeader('Cache-Control', 'public, max-age=86400');

      if (download) {
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${media.fileName}"`
        );
      } else {
        res.setHeader(
          'Content-Disposition',
          `inline; filename="${media.fileName}"`
        );
      }

      res.send(media.buffer);
    } catch (err: any) {
      console.error('Error downloading sticker:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل تنزيل الملصق',
      });
    }
  });

  // Send Sticker into a Telegram chat
  app.post('/api/telegram/send-sticker', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { peerId, documentId, accessHash, fileReference, replyTo } = req.body;
      if (!peerId || !documentId || !accessHash) {
        return res.status(400).json({
          success: false,
          error: 'معرف المحادثة وبيانات الملصق مطلوبة',
        });
      }

      const sent = await sendTelegramSticker(
        sessionString,
        peerId,
        documentId,
        accessHash,
        fileReference || '',
        replyTo
      );
      res.json({ success: true, message: sent });
    } catch (err: any) {
      console.error('Error sending sticker:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل إرسال الملصق',
      });
    }
  });

  // Search animated GIFs
  app.get('/api/telegram/gifs/search', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const q = (req.query.q as string) || '';
      const peerId = (req.query.peerId as string) || undefined;
      const results = await searchTelegramGifs(sessionString, q, peerId);
      res.json({ success: true, results });
    } catch (err: any) {
      console.error('Error searching GIFs:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل البحث في صور GIF',
      });
    }
  });

  // Send an animated GIF
  app.post('/api/telegram/send-gif', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { peerId, gifUrl, replyTo } = req.body;
      if (!peerId || !gifUrl) {
        return res.status(400).json({ success: false, error: 'معرف المحادثة ورابط GIF مطلوبان' });
      }

      const sent = await sendTelegramGif(sessionString, peerId, gifUrl, replyTo);
      res.json({ success: true, message: sent });
    } catch (err: any) {
      console.error('Error sending GIF:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل إرسال صورة GIF',
      });
    }
  });

  // Logout
  app.post('/api/telegram/auth/logout', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (sessionString) {
        await logoutTelegramSession(sessionString);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Real-time Telegram Live Events Stream (Server-Sent Events: SSE)
  // Powered by client.addEventHandler(handler, new NewMessage({}))
  app.get('/api/telegram/events', async (req, res) => {
    const sessionString =
      (req.query.session as string) ||
      (req.headers['x-telegram-session'] as string);

    if (!sessionString) {
      return res.status(401).json({ success: false, error: 'غير مصرح: يلزم توفير رمز الجلسة' });
    }

    // Set standard SSE Headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    if (res.flushHeaders) {
      res.flushHeaders();
    }

    // Send initial connected handshake
    res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', time: Date.now() })}\n\n`);

    let unsubscribe: (() => void) | null = null;
    let keepAliveTimer: NodeJS.Timeout | null = null;

    try {
      unsubscribe = await subscribeToTelegramEvents(sessionString, ({ event, payload }) => {
        try {
          res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
        } catch (writeErr) {
          console.error('Error writing SSE event:', writeErr);
        }
      });

      // Keepalive heartbeat every 15 seconds to prevent timeout in reverse proxies
      keepAliveTimer = setInterval(() => {
        try {
          res.write(': keepalive\n\n');
        } catch (_) {}
      }, 15000);
    } catch (err: any) {
      console.error('Failed to initialize Telegram event stream:', err);
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message || 'فشل الاتصال بالأحداث الحية' })}\n\n`);
    }

    req.on('close', () => {
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      if (unsubscribe) unsubscribe();
      res.end();
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Telegram Web Server running on port ${PORT}`);
    console.log(`Bound to TELEGRAM_API_ID: ${TELEGRAM_API_ID}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
