import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  ArrowRight,
  Check,
  CheckCheck,
  Paperclip,
  Mic,
  Video,
  FileText,
  X,
  Trash2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { TelegramDialog, TelegramMessage } from '../types';
import { telegramApi } from '../api/telegramApi';
import { MediaRenderer } from './MediaRenderer';

interface ChatViewProps {
  chat: TelegramDialog | null;
  onBackMobile: () => void;
  onMessageSent: () => void;
}

interface PendingAttachment {
  file: File;
  previewUrl?: string;
  name: string;
  size: number;
  type: string;
}

export const ChatView: React.FC<ChatViewProps> = ({ chat, onBackMobile, onMessageSent }) => {
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<PendingAttachment | null>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Load messages when active chat changes
  useEffect(() => {
    if (!chat) return;

    let isMounted = true;
    const fetchMessages = async () => {
      setLoading(true);
      try {
        const msgs = await telegramApi.getMessages(chat.id, 50);
        if (isMounted) {
          // Telegram messages usually come newest first, reverse for chronological top-to-bottom chat
          setMessages([...msgs].reverse());
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load messages:', err);
        if (isMounted) setLoading(false);
      }
    };

    fetchMessages();

    // Auto-refresh chat messages every 6 seconds for live sync
    const interval = setInterval(async () => {
      try {
        const msgs = await telegramApi.getMessages(chat.id, 50);
        if (isMounted) {
          setMessages([...msgs].reverse());
        }
      } catch (_) {}
    }, 6000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [chat?.id]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Convert File / Blob to Base64
  const readFileAsBase64 = (fileOrBlob: File | Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(fileOrBlob);
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let previewUrl: string | undefined = undefined;
    if (file.type.startsWith('image/')) {
      previewUrl = URL.createObjectURL(file);
    }

    setPendingFile({
      file,
      previewUrl,
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClearPendingFile = () => {
    if (pendingFile?.previewUrl) {
      URL.revokeObjectURL(pendingFile.previewUrl);
    }
    setPendingFile(null);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chat || sending) return;

    // 1. Send file attachment if present
    if (pendingFile) {
      const fileToSend = pendingFile.file;
      const captionToSend = inputText.trim();
      setSending(true);

      const isImage = fileToSend.type.startsWith('image/');
      const tempId = Date.now();
      const optimisticMsg: TelegramMessage = {
        id: tempId,
        text: captionToSend,
        date: Math.floor(Date.now() / 1000),
        out: true,
        senderId: 'me',
        mediaType: isImage ? 'photo' : 'document',
        mediaInfo: {
          type: isImage ? 'photo' : 'document',
          fileName: fileToSend.name,
          mimeType: fileToSend.type,
          size: fileToSend.size,
          hasMedia: true,
        },
        views: null,
        forwards: null,
      };

      setMessages((prev) => [...prev, optimisticMsg]);
      setInputText('');
      handleClearPendingFile();

      try {
        const fileBase64 = await readFileAsBase64(fileToSend);
        const sent = await telegramApi.sendFile(chat.id, {
          fileBase64,
          fileName: fileToSend.name,
          caption: captionToSend,
          mimeType: fileToSend.type,
        });

        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, id: sent.id, date: sent.date } : m))
        );
        onMessageSent();
      } catch (err: any) {
        alert(`فشل إرسال الملف إلى تليجرام: ${err.message || 'خطأ'}`);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      } finally {
        setSending(false);
      }
      return;
    }

    // 2. Normal text message
    if (!inputText.trim()) return;

    const textToSend = inputText.trim();
    setInputText('');
    setSending(true);

    const tempId = Date.now();
    const optimisticMsg: TelegramMessage = {
      id: tempId,
      text: textToSend,
      date: Math.floor(Date.now() / 1000),
      out: true,
      senderId: 'me',
      mediaType: null,
      views: null,
      forwards: null,
    };

    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const sent = await telegramApi.sendMessage(chat.id, textToSend);
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, id: sent.id, date: sent.date } : m))
      );
      onMessageSent();
    } catch (err: any) {
      alert(`فشل إرسال الرسالة إلى تليجرام: ${err.message || 'خطأ غير معروف'}`);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
    }
  };

  // Voice recording helpers
  const startRecording = async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      let mimeType = '';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
          mimeType = 'audio/ogg;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        }
      }

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingDuration(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Microphone access failed:', err);
      setMicError('تعذر الوصول إلى الميكروفون. يرجى السماح بصلاحية الميكروفون في المتصفح.');
      setTimeout(() => setMicError(null), 6000);
    }
  };

  const cancelRecording = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
    setRecordingDuration(0);
    audioChunksRef.current = [];
  };

  const stopAndSendRecording = () => {
    if (!mediaRecorderRef.current || !chat) return;

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    const tracks = streamRef.current?.getTracks();

    setIsRecording(false);
    setSending(true);

    recorder.onstop = async () => {
      try {
        if (tracks) {
          tracks.forEach((track) => track.stop());
        }
        streamRef.current = null;

        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/ogg',
        });

        if (audioBlob.size === 0) {
          setSending(false);
          return;
        }

        const fileBase64 = await readFileAsBase64(audioBlob);
        const tempId = Date.now();

        const optimisticMsg: TelegramMessage = {
          id: tempId,
          text: '',
          date: Math.floor(Date.now() / 1000),
          out: true,
          senderId: 'me',
          mediaType: 'voice',
          mediaInfo: {
            type: 'voice',
            mimeType: 'audio/ogg',
            duration: recordingDuration || 1,
            size: audioBlob.size,
            hasMedia: true,
          },
          views: null,
          forwards: null,
        };

        setMessages((prev) => [...prev, optimisticMsg]);

        const sent = await telegramApi.sendFile(chat.id, {
          fileBase64,
          fileName: `voice_${tempId}.ogg`,
          voiceNote: true,
          mimeType: 'audio/ogg',
        });

        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, id: sent.id, date: sent.date } : m))
        );
        onMessageSent();
      } catch (err: any) {
        alert(`فشل إرسال الرسالة الصوتية إلى تليجرام: ${err.message || 'خطأ'}`);
      } finally {
        setSending(false);
        setRecordingDuration(0);
        audioChunksRef.current = [];
      }
    };

    recorder.stop();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatMsgTime = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  if (!chat) {
    return (
      <div className="flex-1 hidden md:flex flex-col items-center justify-center p-8 text-center tg-chat-bg">
        <div className="w-16 h-16 rounded-full bg-[#1e2c3a] border border-[#2c3e50] flex items-center justify-center text-[#54a9eb] mb-4 shadow-xl">
          <Send className="w-8 h-8 -rotate-45 ml-1" />
        </div>
        <h3 className="text-base font-semibold text-slate-200 mb-1">حدد محادثة للبدء</h3>
        <p className="text-xs text-slate-400 max-w-xs">
          جميع الرسائل متزامنة مباشرة وحقيقياً مع سحابة تليجرام الرسمية.
        </p>
      </div>
    );
  }

  const chatTitle = chat.title || chat.name || 'محادثة تليجرام';
  const initial = chatTitle.trim().charAt(0) || 'T';

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0e1621] relative overflow-hidden">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar,.tar"
      />

      {/* Chat Top Header */}
      <div className="h-16 bg-[#17212b] border-b border-[#242f3d] px-4 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackMobile}
            className="md:hidden p-1.5 -mr-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
          >
            <ArrowRight className="w-5 h-5" />
          </button>

          <div className="w-10 h-10 rounded-full bg-[#2b5278] flex items-center justify-center text-white font-bold text-sm shadow">
            {initial}
          </div>

          <div>
            <h2 className="text-sm font-bold text-white leading-tight flex items-center gap-1.5">
              <span>{chatTitle}</span>
              {chat.entity?.verified && (
                <Check className="w-3.5 h-3.5 text-[#54a9eb]" />
              )}
            </h2>
            <p className="text-[11px] text-slate-400">
              {chat.isChannel
                ? 'قناة رسمية'
                : chat.isGroup
                ? 'مجموعة تليجرام'
                : chat.entity?.username
                ? `@${chat.entity.username}`
                : 'محادثة خاصة'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="hidden sm:inline-block px-2.5 py-1 rounded-md bg-[#242f3d] text-[10px] font-mono text-[#54a9eb]">
            MTProto ID: {chat.id}
          </span>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 tg-chat-bg">
        {loading && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-7 h-7 border-2 border-[#54a9eb] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 text-xs">
            <div className="p-3 bg-[#17212b]/80 border border-[#242f3d] rounded-xl text-center max-w-xs">
              <p>لا توجد رسائل سابقة في هذه المحادثة.</p>
              <p className="mt-1 text-[11px] text-[#54a9eb]">أرسل رسالة للبدء فوراً!</p>
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isOut = msg.out;
            return (
              <div
                key={msg.id}
                className={`flex ${isOut ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2 shadow-md relative break-words text-sm ${
                    isOut
                      ? 'bg-[#2b5278] text-white rounded-br-xs'
                      : 'bg-[#182533] text-slate-100 rounded-bl-xs border border-[#242f3d]/60'
                  }`}
                >
                  {/* Media Content with live preview and download */}
                  {msg.mediaType && (
                    <MediaRenderer message={msg} peerId={chat.id} />
                  )}

                  {/* Message Text */}
                  {msg.text && (
                    <p className="whitespace-pre-wrap leading-relaxed select-text">
                      {msg.text}
                    </p>
                  )}

                  {/* Time & Sent status */}
                  <div
                    className={`flex items-center gap-1 text-[10px] mt-1 select-none ${
                      isOut ? 'text-slate-300 justify-end' : 'text-slate-400 justify-start'
                    }`}
                  >
                    <span>{formatMsgTime(msg.date)}</span>
                    {isOut && <CheckCheck className="w-3.5 h-3.5 text-[#54a9eb]" />}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Microphone Error Alert */}
      {micError && (
        <div className="bg-rose-900/90 border-t border-rose-700/50 px-4 py-2 flex items-center gap-2 text-xs text-rose-200 shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{micError}</span>
        </div>
      )}

      {/* Attachment Preview Tray (if file selected) */}
      {pendingFile && (
        <div className="bg-[#1e2c3a] border-t border-[#2c3e50] px-4 py-2.5 flex items-center justify-between gap-3 z-10 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {pendingFile.previewUrl ? (
              <img
                src={pendingFile.previewUrl}
                alt="preview"
                className="w-11 h-11 rounded-lg object-cover border border-white/10 shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-lg bg-[#2b5278] text-[#54a9eb] flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-100 truncate max-w-[200px] md:max-w-md">
                {pendingFile.name}
              </p>
              <p className="text-[10px] text-slate-400">
                {formatFileSize(pendingFile.size)} • جاهز للإرسال
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClearPendingFile}
            className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="إلغاء المرفق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Message Composer Bar */}
      <div className="bg-[#17212b] border-t border-[#242f3d] p-3 z-10 shrink-0">
        {isRecording ? (
          /* Live Voice Recording UI */
          <div className="flex items-center justify-between max-w-4xl mx-auto bg-[#1e2c3a] rounded-2xl px-4 py-2 border border-rose-500/30 shadow-inner">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping shrink-0" />
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-rose-400">
                  {formatDuration(recordingDuration)}
                </span>
                <span className="text-xs text-slate-300">تسجيل صوتي...</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelRecording}
                className="px-3 py-1.5 rounded-xl text-xs text-rose-400 hover:bg-rose-500/10 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>إلغاء</span>
              </button>

              <button
                type="button"
                onClick={stopAndSendRecording}
                disabled={sending}
                className="px-3.5 py-1.5 rounded-xl bg-[#54a9eb] hover:bg-[#4698d8] text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow cursor-pointer"
              >
                {sending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5 -rotate-45" />
                )}
                <span>إرسال الصوت</span>
              </button>
            </div>
          </div>
        ) : (
          /* Standard Input Bar with File Upload & Mic */
          <form onSubmit={handleSendMessage} className="flex items-center gap-2 max-w-4xl mx-auto">
            {/* Attachment Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              title="إرفاق صورة أو ملف أو فيديو"
              className="p-2.5 text-slate-400 hover:text-[#54a9eb] hover:bg-[#242f3d] rounded-full transition-colors cursor-pointer shrink-0 disabled:opacity-40"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            {/* Text / Caption Input */}
            <input
              type="text"
              placeholder={pendingFile ? 'أضف تعليقاً على المرفق (اختياري)...' : 'اكتب رسالة...'}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={sending}
              className="flex-1 bg-[#242f3d] border border-transparent focus:border-[#54a9eb] rounded-2xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-400 focus:outline-none transition-all"
            />

            {/* Mic Button (Voice Note) */}
            {!inputText.trim() && !pendingFile ? (
              <button
                type="button"
                onClick={startRecording}
                disabled={sending}
                title="تسجيل رسالة صوتية"
                className="w-10 h-10 rounded-full bg-[#242f3d] hover:bg-[#2b5278] text-slate-300 hover:text-white flex items-center justify-center transition-all shadow cursor-pointer shrink-0 disabled:opacity-40"
              >
                <Mic className="w-4 h-4 text-[#54a9eb]" />
              </button>
            ) : (
              /* Send Button */
              <button
                type="submit"
                disabled={sending}
                title={pendingFile ? 'إرسال المرفق' : 'إرسال الرسالة'}
                className="w-10 h-10 rounded-full bg-[#2b5278] hover:bg-[#356391] text-white flex items-center justify-center transition-all disabled:opacity-40 disabled:hover:bg-[#2b5278] shadow cursor-pointer shrink-0"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 -rotate-45 ml-0.5" />
                )}
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
