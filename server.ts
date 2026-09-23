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
  setTelegramTyping,
  markTelegramAsRead,
  getTelegramArchivedDialogs,
  toggleArchiveTelegramChat,
  getTelegramFolders,
  updateTelegramFolder,
  deleteTelegramFolder,
  searchTelegramGlobal,
  createTelegramGroup,
  createTelegramChannel,
  resolveTelegramContact,
  handleCallSignal,
  getVoiceChatSpace,
  joinVoiceChatSpace,
  leaveVoiceChatSpace,
  updateVoiceChatState,
  forwardTelegramMessages,
  pinTelegramMessage,
  unpinTelegramMessage,
  sendTelegramPoll,
  voteTelegramPoll,
  getTelegramContacts,
  addTelegramContact,
  getTelegramUserProfile,
  updateTelegramUserProfile,
  updateTelegramUsername,
  uploadTelegramProfilePhoto,
  getTelegramActiveSessions,
  terminateTelegramSession,
  terminateAllOtherTelegramSessions,
  getTelegramPrivacySettings,
  setTelegramPrivacyRule,
  sendBotCallbackAnswer,
  searchTelegramChatMessages,
  getTelegramPeerAvatar,
  getTelegramChatInfo,
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

  // Messages in a Chat (Supports limit and offsetId pagination)
  app.get('/api/telegram/messages/:peerId', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح: يلزم تسجيل الدخول' });
      }
      const { peerId } = req.params;
      const limit = Number(req.query.limit) || 50;
      const offsetId = req.query.offsetId ? Number(req.query.offsetId) : undefined;
      const messages = await getTelegramMessages(sessionString, peerId, limit, offsetId);
      res.json({ success: true, messages });
    } catch (err: any) {
      console.error('Error fetching messages:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل جلب الرسائل',
      });
    }
  });

  // Set Typing Status Indicator (Typing Indicators)
  app.post('/api/telegram/set-typing', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { peerId, action } = req.body;
      if (!peerId) {
        return res.status(400).json({ success: false, error: 'معرف المحادثة مطلوب' });
      }
      const result = await setTelegramTyping(sessionString, peerId, action || 'typing');
      res.json(result);
    } catch (err: any) {
      console.error('Error setting typing status:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل إرسال حالة الكتابة',
      });
    }
  });

  // Mark Chat Messages as Read (Read Receipts)
  app.post('/api/telegram/mark-read', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { peerId, maxId } = req.body;
      if (!peerId) {
        return res.status(400).json({ success: false, error: 'معرف المحادثة مطلوب' });
      }
      const result = await markTelegramAsRead(sessionString, peerId, maxId ? Number(maxId) : undefined);
      res.json(result);
    } catch (err: any) {
      console.error('Error marking as read:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل تحديث حالة القراءة',
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

  // --------------------------------
  // Real Telegram Peer Avatars Endpoint (Fast Caching for Users, Groups, Channels)
  // --------------------------------
  app.get(['/api/telegram/avatar/:peerId', '/api/telegram/avatar'], async (req, res) => {
    try {
      const peerId = (req.params.peerId || req.query.peerId) as string;
      if (!peerId) {
        return res.status(400).send('peerId is required');
      }

      const isBig = req.query.big === '1' || req.query.big === 'true';
      const sessionString =
        (req.headers['x-telegram-session'] as string) ||
        (req.query.session as string);

      const buffer = await getTelegramPeerAvatar(sessionString, peerId, isBig);
      if (!buffer || buffer.length === 0) {
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.status(404).send('No profile photo');
      }

      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      return res.send(buffer);
    } catch (err: any) {
      res.setHeader('Cache-Control', 'public, max-age=180');
      return res.status(404).send('Avatar unavailable');
    }
  });

  // --------------------------------
  // Real Telegram Peer Full Info (Bio, Subscribers/Members, Username, etc.)
  // --------------------------------
  app.get('/api/telegram/chat-info/:peerId', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const peerId = req.params.peerId;
      if (!peerId) {
        return res.status(400).json({ success: false, error: 'peerId is required' });
      }

      const info = await getTelegramChatInfo(sessionString, peerId);
      res.json({ success: true, info });
    } catch (err: any) {
      console.error('Error fetching chat info:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل جلب معلومات المحادثة',
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
      const { peerId, message, replyTo, silent, scheduleDate } = req.body;
      if (!peerId || !message) {
        return res.status(400).json({ success: false, error: 'المعرف والرسالة مطلوبان' });
      }
      const sent = await sendTelegramMessage(
        sessionString,
        peerId,
        message,
        replyTo ? Number(replyTo) : undefined,
        { silent: !!silent, scheduleDate: scheduleDate ? Number(scheduleDate) : undefined }
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
      const {
        peerId,
        fileBase64,
        fileName,
        caption,
        voiceNote,
        isRoundVideo,
        mimeType,
        replyTo,
        silent,
        scheduleDate,
      } = req.body;
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
        isRoundVideo: !!isRoundVideo,
        mimeType: mimeType || 'application/octet-stream',
        replyTo: replyTo ? Number(replyTo) : undefined,
        silent: !!silent,
        scheduleDate: scheduleDate ? Number(scheduleDate) : undefined,
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

  // Forward Messages (with option to hide author / sender name)
  app.post('/api/telegram/forward-messages', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { toPeerId, fromPeerId, messageIds, dropAuthor, silent } = req.body;
      if (!toPeerId || !fromPeerId || !Array.isArray(messageIds) || messageIds.length === 0) {
        return res.status(400).json({ success: false, error: 'معرفات الوجهة والمصدر والرسائل مطلوبة' });
      }

      const result = await forwardTelegramMessages(
        sessionString,
        toPeerId,
        fromPeerId,
        messageIds.map((id) => Number(id)),
        !!dropAuthor,
        !!silent
      );
      res.json(result);
    } catch (err: any) {
      console.error('Error forwarding messages:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل إعادة توجيه الرسائل',
      });
    }
  });

  // Pin Message in chat
  app.post('/api/telegram/messages/pin', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { peerId, messageId, silent, pmOneSide } = req.body;
      if (!peerId || !messageId) {
        return res.status(400).json({ success: false, error: 'معرف المحادثة ورقم الرسالة مطلوبان' });
      }

      const result = await pinTelegramMessage(
        sessionString,
        peerId,
        Number(messageId),
        !!silent,
        !!pmOneSide
      );
      res.json(result);
    } catch (err: any) {
      console.error('Error pinning message:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل تثبيت الرسالة',
      });
    }
  });

  // Unpin Message in chat
  app.post('/api/telegram/messages/unpin', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { peerId, messageId } = req.body;
      if (!peerId) {
        return res.status(400).json({ success: false, error: 'معرف المحادثة مطلوب' });
      }

      const result = await unpinTelegramMessage(
        sessionString,
        peerId,
        messageId ? Number(messageId) : undefined
      );
      res.json(result);
    } catch (err: any) {
      console.error('Error unpinning message:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل إلغاء تثبيت الرسالة',
      });
    }
  });

  // Send Poll / Quiz
  app.post('/api/telegram/send-poll', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { peerId, question, answers, options } = req.body;
      if (!peerId || !question || !Array.isArray(answers) || answers.length < 2) {
        return res.status(400).json({ success: false, error: 'السؤال وخياران على الأقل مطلوبان' });
      }

      const sent = await sendTelegramPoll(sessionString, peerId, question, answers, options);
      res.json({ success: true, message: sent });
    } catch (err: any) {
      console.error('Error sending poll:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل إنشاء الاستطلاع في تليجرام',
      });
    }
  });

  // Vote on Poll
  app.post('/api/telegram/vote-poll', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { peerId, messageId, options } = req.body;
      if (!peerId || !messageId || !Array.isArray(options)) {
        return res.status(400).json({ success: false, error: 'المعطيات غير مكتملة للتصويت' });
      }

      const result = await voteTelegramPoll(sessionString, peerId, Number(messageId), options);
      res.json(result);
    } catch (err: any) {
      console.error('Error voting on poll:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل تسجيل التصويت',
      });
    }
  });

  // Smart Link / WebPage Preview Scraper
  app.get('/api/telegram/preview-url', async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl || !targetUrl.startsWith('http')) {
        return res.status(400).json({ success: false, error: 'الرابط غير صالح' });
      }

      const parsedUrl = new URL(targetUrl);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TelegramBot/1.0; +https://telegram.org/bot)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
      clearTimeout(timeout);

      const html = await response.text();

      const getMeta = (prop: string): string => {
        const regex1 = new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i');
        const match1 = html.match(regex1);
        if (match1) return match1[1];
        const regex2 = new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i');
        const match2 = html.match(regex2);
        return match2 ? match2[1] : '';
      };

      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = getMeta('og:title') || getMeta('twitter:title') || (titleMatch ? titleMatch[1] : parsedUrl.hostname);
      const description = getMeta('og:description') || getMeta('twitter:description') || getMeta('description') || '';
      let imageUrl = getMeta('og:image') || getMeta('twitter:image') || '';
      if (imageUrl && !imageUrl.startsWith('http')) {
        try {
          imageUrl = new URL(imageUrl, targetUrl).toString();
        } catch (_) {}
      }
      const siteName = getMeta('og:site_name') || parsedUrl.hostname;

      res.json({
        success: true,
        preview: {
          url: targetUrl,
          displayUrl: parsedUrl.hostname + (parsedUrl.pathname !== '/' ? parsedUrl.pathname.slice(0, 20) : ''),
          domain: parsedUrl.hostname,
          siteName,
          title: title.trim().slice(0, 100),
          description: description.trim().slice(0, 200),
          imageUrl,
          hasPhoto: !!imageUrl,
        },
      });
    } catch (err: any) {
      res.json({
        success: false,
        error: err.message || 'تعذر جلب معاينة الرابط',
      });
    }
  });

  // Bot Callback Answer / Inline Button Click
  app.post('/api/telegram/bot/callback', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { peerId, msgId, data } = req.body;
      if (!peerId || !msgId || !data) {
        return res.status(400).json({ success: false, error: 'معطيات الزر مطلوبة' });
      }

      const result = await sendBotCallbackAnswer(sessionString, peerId, Number(msgId), data);
      res.json({ success: true, result });
    } catch (err: any) {
      console.error('Error sending bot callback answer:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل معالجة استجابة البوت',
      });
    }
  });

  // --------------------------------
  // Contacts Book Routes
  // --------------------------------

  // Get Contacts List
  app.get('/api/telegram/contacts', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const contacts = await getTelegramContacts(sessionString);
      res.json({ success: true, contacts });
    } catch (err: any) {
      console.error('Error fetching contacts:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل جلب جهات الاتصال',
      });
    }
  });

  // Add Contact
  app.post('/api/telegram/contacts/add', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { phone, firstName, lastName } = req.body;
      if (!phone || !firstName) {
        return res.status(400).json({ success: false, error: 'رقم الهاتف والاسم الأول مطلوبان' });
      }

      const result = await addTelegramContact(sessionString, phone, firstName, lastName || '');
      res.json(result);
    } catch (err: any) {
      console.error('Error adding contact:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل إضافة جهة الاتصال',
      });
    }
  });

  // --------------------------------
  // Profile Management Routes
  // --------------------------------

  // Get Full Profile
  app.get('/api/telegram/profile/full', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const profile = await getTelegramUserProfile(sessionString);
      res.json({ success: true, profile });
    } catch (err: any) {
      console.error('Error fetching user profile:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل جلب الملف الشخصي',
      });
    }
  });

  // Update Profile Name and Bio
  app.post('/api/telegram/profile/update', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { firstName, lastName, about } = req.body;
      if (!firstName) {
        return res.status(400).json({ success: false, error: 'الاسم الأول مطلوب' });
      }

      const user = await updateTelegramUserProfile(sessionString, firstName, lastName || '', about || '');
      res.json({ success: true, user });
    } catch (err: any) {
      console.error('Error updating profile:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل تحديث البيانات الشخصية',
      });
    }
  });

  // Update Username
  app.post('/api/telegram/profile/username', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { username } = req.body;
      const user = await updateTelegramUsername(sessionString, username || '');
      res.json({ success: true, user });
    } catch (err: any) {
      console.error('Error updating username:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل تحديث اسم المستخدم',
      });
    }
  });

  // Upload Profile Photo
  app.post('/api/telegram/profile/photo', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { photoBase64, fileName } = req.body;
      if (!photoBase64) {
        return res.status(400).json({ success: false, error: 'صورة الملف الشخصي مطلوبة' });
      }

      const cleanBase64 = photoBase64.includes(';base64,')
        ? photoBase64.split(';base64,')[1]
        : photoBase64;
      const buffer = Buffer.from(cleanBase64, 'base64');

      const user = await uploadTelegramProfilePhoto(sessionString, buffer, fileName || 'avatar.jpg');
      res.json({ success: true, user });
    } catch (err: any) {
      console.error('Error uploading profile photo:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل رفع الصورة الشخصية',
      });
    }
  });

  // --------------------------------
  // Active Sessions & Devices Routes
  // --------------------------------

  // Get Active Authorizations
  app.get('/api/telegram/sessions/active', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const sessions = await getTelegramActiveSessions(sessionString);
      res.json({ success: true, sessions });
    } catch (err: any) {
      console.error('Error fetching sessions:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل جلب الجلسات النشطة',
      });
    }
  });

  // Terminate a specific session
  app.post('/api/telegram/sessions/terminate', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { hash } = req.body;
      if (!hash) {
        return res.status(400).json({ success: false, error: 'معرف الجلسة مطلوب' });
      }

      const result = await terminateTelegramSession(sessionString, hash);
      res.json(result);
    } catch (err: any) {
      console.error('Error terminating session:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل إنهاء الجلسة',
      });
    }
  });

  // Terminate all other sessions
  app.post('/api/telegram/sessions/terminate-all', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const result = await terminateAllOtherTelegramSessions(sessionString);
      res.json(result);
    } catch (err: any) {
      console.error('Error terminating all sessions:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل إنهاء الجلسات الأخرى',
      });
    }
  });

  // --------------------------------
  // Privacy & Security Settings Routes
  // --------------------------------

  // Get Privacy Settings
  app.get('/api/telegram/privacy', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const privacy = await getTelegramPrivacySettings(sessionString);
      res.json({ success: true, privacy });
    } catch (err: any) {
      console.error('Error fetching privacy settings:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل جلب إعدادات الخصوصية',
      });
    }
  });

  // Update Privacy Rule
  app.post('/api/telegram/privacy/set', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { key, value } = req.body;
      if (!key || !value) {
        return res.status(400).json({ success: false, error: 'المعطيات غير مكتملة' });
      }

      const result = await setTelegramPrivacyRule(sessionString, key, value);
      res.json(result);
    } catch (err: any) {
      console.error('Error setting privacy rule:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل تحديث قاعدة الخصوصية',
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
  // Chat Folders & Archive Management
  // --------------------------------

  // Get Archived Dialogs
  app.get('/api/telegram/dialogs/archived', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const dialogs = await getTelegramArchivedDialogs(sessionString);
      res.json({ success: true, dialogs });
    } catch (err: any) {
      console.error('Error getting archived dialogs:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل جلب المحادثات المؤرشفة',
      });
    }
  });

  // Archive / Unarchive Chat
  app.post('/api/telegram/dialogs/archive', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { peerId, archive } = req.body;
      if (!peerId) {
        return res.status(400).json({ success: false, error: 'معرف المحادثة مطلوب' });
      }
      const result = await toggleArchiveTelegramChat(sessionString, peerId, archive !== false);
      res.json(result);
    } catch (err: any) {
      console.error('Error archiving chat:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل تحديث أرشفة المحادثة',
      });
    }
  });

  // Get Cloud Dialog Folders / Filters
  app.get('/api/telegram/folders', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const folders = await getTelegramFolders(sessionString);
      res.json({ success: true, folders });
    } catch (err: any) {
      console.error('Error getting folders:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل جلب مجلدات المحادثات',
      });
    }
  });

  // Create or Update Cloud Dialog Folder
  app.post('/api/telegram/folders', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { folder } = req.body;
      if (!folder || !folder.title) {
        return res.status(400).json({ success: false, error: 'عنوان المجلد مطلوب' });
      }
      const result = await updateTelegramFolder(sessionString, folder);
      res.json(result);
    } catch (err: any) {
      console.error('Error updating folder:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل حفظ المجلد',
      });
    }
  });

  // Delete Dialog Folder
  app.delete('/api/telegram/folders/:id', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const id = Number(req.params.id);
      const result = await deleteTelegramFolder(sessionString, id);
      res.json(result);
    } catch (err: any) {
      console.error('Error deleting folder:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل حذف المجلد',
      });
    }
  });

  // --------------------------------
  // Global Search (Cloud Contacts, Channels, Messages)
  // --------------------------------
  app.get('/api/telegram/search/global', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const q = (req.query.q as string) || '';
      const results = await searchTelegramGlobal(sessionString, q);
      res.json({ success: true, ...results });
    } catch (err: any) {
      console.error('Error in global search:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل البحث العام في سحابة تليجرام',
      });
    }
  });

  // --------------------------------
  // In-Chat Search (Search Messages in Specific Chat via Cloud MTProto)
  // --------------------------------
  app.get('/api/telegram/search/chat', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const chatId = req.query.chatId as string;
      if (!chatId) {
        return res.status(400).json({ success: false, error: 'chatId مطلوب للبحث' });
      }
      const q = (req.query.q as string) || '';
      const minDate = parseInt(req.query.minDate as string, 10) || 0;
      const maxDate = parseInt(req.query.maxDate as string, 10) || 0;
      const limit = parseInt(req.query.limit as string, 10) || 50;

      const result = await searchTelegramChatMessages(sessionString, chatId, q, {
        minDate,
        maxDate,
        limit,
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error('Error in in-chat search:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل البحث في رسائل المحادثة',
      });
    }
  });

  // --------------------------------
  // Create New Chats & Channels & Resolve Users
  // --------------------------------
  app.post('/api/telegram/chat/create-group', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { title, users, about } = req.body;
      if (!title) {
        return res.status(400).json({ success: false, error: 'اسم المجموعة مطلوب' });
      }
      const result = await createTelegramGroup(sessionString, title, users || [], about || '');
      res.json(result);
    } catch (err: any) {
      console.error('Error creating group:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل إنشاء المجموعة',
      });
    }
  });

  app.post('/api/telegram/chat/create-channel', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { title, about } = req.body;
      if (!title) {
        return res.status(400).json({ success: false, error: 'اسم القناة مطلوب' });
      }
      const result = await createTelegramChannel(sessionString, title, about || '');
      res.json(result);
    } catch (err: any) {
      console.error('Error creating channel:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل إنشاء القناة',
      });
    }
  });

  app.post('/api/telegram/contacts/resolve', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { identifier } = req.body;
      if (!identifier) {
        return res.status(400).json({ success: false, error: 'اسم المعرف مطلوب' });
      }
      const contact = await resolveTelegramContact(sessionString, identifier);
      res.json(contact);
    } catch (err: any) {
      console.error('Error resolving contact:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'تعذر العثور على جهة الاتصال أو القناة',
      });
    }
  });

  // --------------------------------
  // WebRTC 1-on-1 Calls Signaling & Voice Chats
  // --------------------------------
  app.post('/api/telegram/calls/signal', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const result = await handleCallSignal(sessionString, req.body);
      res.json(result);
    } catch (err: any) {
      console.error('Error handling call signal:', err);
      res.status(500).json({
        success: false,
        error: err.errorMessage || err.message || 'فشل معالجة إشارة الاتصال',
      });
    }
  });

  app.get('/api/telegram/voice-chat/:chatId', (req, res) => {
    try {
      const { chatId } = req.params;
      const title = req.query.title as string | undefined;
      const isChannel = req.query.isChannel === 'true' || req.query.isChannel === '1';
      const space = getVoiceChatSpace(chatId, title, isChannel);
      res.json({ success: true, space });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/telegram/voice-chat/:chatId/join', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { chatId } = req.params;
      const { title, isChannel } = req.body;
      const space = await joinVoiceChatSpace(sessionString, chatId, title, isChannel);
      res.json({ success: true, space });
    } catch (err: any) {
      console.error('Error joining voice chat:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/telegram/voice-chat/:chatId/leave', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { chatId } = req.params;
      const space = await leaveVoiceChatSpace(sessionString, chatId);
      res.json({ success: true, space });
    } catch (err: any) {
      console.error('Error leaving voice chat:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/telegram/voice-chat/:chatId/state', async (req, res) => {
    try {
      const sessionString = req.headers['x-telegram-session'] as string;
      if (!sessionString) {
        return res.status(401).json({ success: false, error: 'غير مصرح' });
      }
      const { chatId } = req.params;
      const space = await updateVoiceChatState(sessionString, chatId, req.body);
      res.json({ success: true, space });
    } catch (err: any) {
      console.error('Error updating voice chat state:', err);
      res.status(500).json({ success: false, error: err.message });
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
