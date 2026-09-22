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
  logoutTelegramSession,
  getTelegramMe,
} from './server/telegramClient.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Health and Telegram Connection Status endpoint
  app.get('/api/telegram/status', async (req, res) => {
    try {
      const authHeader = req.headers['x-telegram-session'] as string | undefined;
      let user = null;
      let authorized = false;

      if (authHeader) {
        try {
          user = await getTelegramMe(authHeader);
          authorized = true;
        } catch (_) {
          authorized = false;
        }
      }

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
