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
  Reply,
  Smile,
  Pencil,
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

const QUICK_REACTIONS = ['👍', '❤️', '🔥', '🎉', '👏', '😂', '😮', '😢'];

export const ChatView: React.FC<ChatViewProps> = ({ chat, onBackMobile, onMessageSent }) => {
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<PendingAttachment | null>(null);
  const [replyingTo, setReplyingTo] = useState<TelegramMessage | null>(null);
  const [activeReactionPickerMsgId, setActiveReactionPickerMsgId] = useState<number | null>(null);
  const [editingMessage, setEditingMessage] = useState<TelegramMessage | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<TelegramMessage | null>(null);
  const [deleteRevoke, setDeleteRevoke] = useState(true);
  const [deleting, setDeleting] = useState(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
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

  const handleReaction = async (messageId: number, emoji: string) => {
    setActiveReactionPickerMsgId(null);
    const targetMsg = messages.find((m) => m.id === messageId);
    if (!targetMsg || !chat) return;

    const existingChosen = targetMsg.reactions?.find((r) => r.chosen);
    const isSameEmoji = existingChosen?.emoticon === emoji;
    const newEmoji = isSameEmoji ? null : emoji;

    // Optimistic UI update
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        let nextReactions = [...(m.reactions || [])];

        if (existingChosen) {
          nextReactions = nextReactions
            .map((r) =>
              r.emoticon === existingChosen.emoticon
                ? { ...r, count: Math.max(0, r.count - 1), chosen: false }
                : r
            )
            .filter((r) => r.count > 0);
        }

        if (newEmoji) {
          const found = nextReactions.find((r) => r.emoticon === newEmoji);
          if (found) {
            nextReactions = nextReactions.map((r) =>
              r.emoticon === newEmoji ? { ...r, count: r.count + 1, chosen: true } : r
            );
          } else {
            nextReactions.push({ emoticon: newEmoji, count: 1, chosen: true });
          }
        }

        return { ...m, reactions: nextReactions };
      })
    );

    try {
      await telegramApi.sendReaction(chat.id, messageId, newEmoji);
    } catch (err: any) {
      console.error('Failed to send reaction to Telegram:', err);
    }
  };

  const handleStartEdit = (msg: TelegramMessage) => {
    setEditingMessage(msg);
    setInputText(msg.text || '');
    setReplyingTo(null);
    setPendingFile(null);
    setTimeout(() => {
      textInputRef.current?.focus();
    }, 50);
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setInputText('');
  };

  const handleDeleteConfirm = async () => {
    if (!messageToDelete || !chat || deleting) return;
    const targetId = messageToDelete.id;
    const revoke = deleteRevoke;
    setDeleting(true);

    // Optimistic removal from message list
    setMessages((prev) => prev.filter((m) => m.id !== targetId));
    setMessageToDelete(null);

    try {
      await telegramApi.deleteMessages(chat.id, [targetId], revoke);
      onMessageSent();
    } catch (err: any) {
      alert(`فشل حذف الرسالة في تليجرام: ${err.message || 'خطأ'}`);
      // Re-fetch to restore state if deletion failed
      try {
        const msgs = await telegramApi.getMessages(chat.id, 50);
        setMessages([...msgs].reverse());
      } catch (_) {}
    } finally {
      setDeleting(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chat || sending) return;

    // 0. Handle Editing an existing message
    if (editingMessage) {
      const newText = inputText.trim();
      if (!newText) return;
      const editMsgId = editingMessage.id;
      setSending(true);
      setEditingMessage(null);
      setInputText('');

      // Optimistic update
      setMessages((prev) =>
        prev.map((m) =>
          m.id === editMsgId
            ? { ...m, text: newText, editDate: Math.floor(Date.now() / 1000) }
            : m
        )
      );

      try {
        await telegramApi.editMessage(chat.id, editMsgId, newText);
        onMessageSent();
      } catch (err: any) {
        alert(`فشل تعديل الرسالة: ${err.message || 'خطأ'}`);
        try {
          const msgs = await telegramApi.getMessages(chat.id, 50);
          setMessages([...msgs].reverse());
        } catch (_) {}
      } finally {
        setSending(false);
      }
      return;
    }

    const replyToId = replyingTo?.id;
    setReplyingTo(null);

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
        replyToMsgId: replyToId,
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
          replyTo: replyToId,
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
      replyToMsgId: replyToId,
      views: null,
      forwards: null,
    };

    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const sent = await telegramApi.sendMessage(chat.id, textToSend, replyToId);
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

    const replyToId = replyingTo?.id;
    setReplyingTo(null);
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
          replyToMsgId: replyToId,
          views: null,
          forwards: null,
        };

        setMessages((prev) => [...prev, optimisticMsg]);

        const sent = await telegramApi.sendFile(chat.id, {
          fileBase64,
          fileName: `voice_${tempId}.ogg`,
          voiceNote: true,
          mimeType: 'audio/ogg',
          replyTo: replyToId,
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
            const parentMsg = msg.replyToMsgId
              ? messages.find((m) => m.id === msg.replyToMsgId)
              : null;

            return (
              <div
                key={msg.id}
                id={`msg-${msg.id}`}
                className={`group flex items-end gap-1.5 transition-all ${
                  isOut ? 'justify-start flex-row' : 'justify-end flex-row-reverse'
                }`}
              >
                {/* Message Bubble */}
                <div
                  className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2 shadow-md relative break-words text-sm transition-all ${
                    isOut
                      ? 'bg-[#2b5278] text-white rounded-br-xs'
                      : 'bg-[#182533] text-slate-100 rounded-bl-xs border border-[#242f3d]/60'
                  }`}
                >
                  {/* Floating Quick Reaction Picker */}
                  {activeReactionPickerMsgId === msg.id && (
                    <div
                      className={`absolute -top-11 ${
                        isOut ? 'right-0' : 'left-0'
                      } bg-[#1e2c3a] border border-[#2c3e50] rounded-full px-2 py-1 shadow-2xl flex items-center gap-1 z-30 animate-in fade-in zoom-in-95`}
                    >
                      {QUICK_REACTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleReaction(msg.id, emoji)}
                          className="w-7 h-7 flex items-center justify-center hover:scale-130 rounded-full transition-transform text-base cursor-pointer"
                          title={`تفاعل بـ ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Quoted Reply Banner */}
                  {msg.replyToMsgId && (
                    <div
                      onClick={() => {
                        const el = document.getElementById(`msg-${msg.replyToMsgId}`);
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          el.classList.add('ring-2', 'ring-[#54a9eb]');
                          setTimeout(() => el.classList.remove('ring-2', 'ring-[#54a9eb]'), 1500);
                        }
                      }}
                      className="mb-1.5 px-2.5 py-1 rounded bg-black/25 border-r-2 border-[#54a9eb] text-xs cursor-pointer hover:bg-black/35 transition-colors"
                    >
                      <div className="font-semibold text-[11px] text-[#54a9eb] flex items-center gap-1">
                        <Reply className="w-3 h-3 -scale-x-100" />
                        <span>
                          {parentMsg ? (parentMsg.out ? 'أنت' : chatTitle) : `رسالة #${msg.replyToMsgId}`}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 truncate max-w-[240px]">
                        {parentMsg
                          ? parentMsg.text ||
                            (parentMsg.mediaType === 'photo'
                              ? '📷 صورة'
                              : parentMsg.mediaType === 'voice'
                              ? '🎤 تسجيل صوتي'
                              : parentMsg.mediaType === 'video'
                              ? '🎬 فيديو'
                              : parentMsg.mediaType === 'document'
                              ? '📄 ملف'
                              : 'مرفق وسائط')
                          : 'انقر لعرض الرسالة الأصلية'}
                      </p>
                    </div>
                  )}

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

                  {/* Emoji Reactions List */}
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5 pt-1 border-t border-white/10">
                      {msg.reactions.map((r) => (
                        <button
                          key={r.emoticon}
                          type="button"
                          onClick={() => handleReaction(msg.id, r.emoticon)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all cursor-pointer select-none ${
                            r.chosen
                              ? 'bg-[#54a9eb]/30 border border-[#54a9eb] text-white shadow-sm font-semibold'
                              : 'bg-black/30 hover:bg-black/50 border border-white/10 text-slate-200'
                          }`}
                          title={`تفاعل: ${r.emoticon} (${r.count})`}
                        >
                          <span className="text-sm leading-none">{r.emoticon}</span>
                          <span className="text-[11px] font-mono">{r.count}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Time & Sent status */}
                  <div
                    className={`flex items-center gap-1 text-[10px] mt-1 select-none ${
                      isOut ? 'text-slate-300 justify-end' : 'text-slate-400 justify-start'
                    }`}
                  >
                    {msg.editDate && (
                      <span className="text-[9px] text-slate-300/80 mr-0.5 font-sans select-none">
                        معدلة
                      </span>
                    )}
                    <span>{formatMsgTime(msg.date)}</span>
                    {isOut && <CheckCheck className="w-3.5 h-3.5 text-[#54a9eb]" />}
                  </div>
                </div>

                {/* Message Hover Actions (Reply, Reaction, Edit, Delete) */}
                <div
                  className={`opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 self-center shrink-0 pb-1`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setActiveReactionPickerMsgId(
                        activeReactionPickerMsgId === msg.id ? null : msg.id
                      )
                    }
                    className="p-1.5 rounded-full bg-[#1e2c3a] hover:bg-[#2b5278] text-slate-400 hover:text-white border border-[#2c3e50] shadow cursor-pointer transition-transform hover:scale-110"
                    title="تفاعل بالرموز التعبيرية"
                  >
                    <Smile className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setReplyingTo(msg);
                      setEditingMessage(null);
                    }}
                    className="p-1.5 rounded-full bg-[#1e2c3a] hover:bg-[#2b5278] text-slate-400 hover:text-white border border-[#2c3e50] shadow cursor-pointer transition-transform hover:scale-110"
                    title="رد على الرسالة"
                  >
                    <Reply className="w-3.5 h-3.5 -scale-x-100" />
                  </button>

                  {/* Edit Button (Only for own messages with text) */}
                  {isOut && msg.text && (
                    <button
                      type="button"
                      onClick={() => handleStartEdit(msg)}
                      className="p-1.5 rounded-full bg-[#1e2c3a] hover:bg-[#2b5278] text-slate-400 hover:text-amber-400 border border-[#2c3e50] shadow cursor-pointer transition-transform hover:scale-110"
                      title="تعديل الرسالة"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Delete Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setMessageToDelete(msg);
                      setDeleteRevoke(true);
                    }}
                    className="p-1.5 rounded-full bg-[#1e2c3a] hover:bg-rose-900/50 text-slate-400 hover:text-rose-300 border border-[#2c3e50] shadow cursor-pointer transition-transform hover:scale-110"
                    title="حذف الرسالة"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
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

      {/* Reply Preview Tray (if replying to a message) */}
      {replyingTo && (
        <div className="bg-[#1e2c3a] border-t border-[#2c3e50] px-4 py-2 flex items-center justify-between gap-3 z-10 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-1 h-9 bg-[#54a9eb] rounded-full shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#54a9eb]">
                <Reply className="w-3.5 h-3.5 -scale-x-100" />
                <span>
                  الرد على {replyingTo.out ? 'رسالتك' : (chat.title || chat.name || 'المستخدم')}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 truncate max-w-[260px] md:max-w-md">
                {replyingTo.text ||
                  (replyingTo.mediaType === 'photo'
                    ? '📷 صورة'
                    : replyingTo.mediaType === 'voice'
                    ? '🎤 تسجيل صوتي'
                    : replyingTo.mediaType === 'video'
                    ? '🎬 فيديو'
                    : replyingTo.mediaType === 'document'
                    ? '📄 مستند'
                    : 'مرفق وسائط')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setReplyingTo(null)}
            className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="إلغاء الرد"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Edit Preview Tray (if editing a message) */}
      {editingMessage && (
        <div className="bg-[#1e2c3a] border-t border-[#2c3e50] px-4 py-2 flex items-center justify-between gap-3 z-10 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-1 h-9 bg-amber-400 rounded-full shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                <Pencil className="w-3.5 h-3.5" />
                <span>تعديل الرسالة</span>
              </div>
              <p className="text-[11px] text-slate-300 truncate max-w-[260px] md:max-w-md">
                {editingMessage.text}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCancelEdit}
            className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="إلغاء التعديل"
          >
            <X className="w-4 h-4" />
          </button>
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
            {/* Attachment Button (Disabled during edit) */}
            {!editingMessage && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                title="إرفاق صورة أو ملف أو فيديو"
                className="p-2.5 text-slate-400 hover:text-[#54a9eb] hover:bg-[#242f3d] rounded-full transition-colors cursor-pointer shrink-0 disabled:opacity-40"
              >
                <Paperclip className="w-5 h-5" />
              </button>
            )}

            {/* Text / Caption Input */}
            <input
              ref={textInputRef}
              type="text"
              placeholder={
                editingMessage
                  ? 'تعديل نص الرسالة...'
                  : pendingFile
                  ? 'أضف تعليقاً على المرفق (اختياري)...'
                  : 'اكتب رسالة...'
              }
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={sending}
              className={`flex-1 bg-[#242f3d] border rounded-2xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-400 focus:outline-none transition-all ${
                editingMessage
                  ? 'border-amber-400/50 focus:border-amber-400'
                  : 'border-transparent focus:border-[#54a9eb]'
              }`}
            />

            {/* Editing Save Button */}
            {editingMessage ? (
              <button
                type="submit"
                disabled={sending || !inputText.trim()}
                title="حفظ التعديل"
                className="w-10 h-10 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center justify-center transition-all disabled:opacity-40 shadow cursor-pointer shrink-0"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                ) : (
                  <Check className="w-4 h-4 text-slate-950 stroke-[3]" />
                )}
              </button>
            ) : !inputText.trim() && !pendingFile ? (
              /* Mic Button (Voice Note) */
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

      {/* Delete Confirmation Modal */}
      {messageToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-[#1e2c3a] border border-[#2c3e50] rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-rose-400">
              <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-white">حذف الرسالة</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              هل أنت متأكد من رغبتك في حذف هذه الرسالة من المحادثة؟
            </p>

            {/* Message snippet preview */}
            <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 text-xs text-slate-300 truncate max-w-full">
              {messageToDelete.text ||
                (messageToDelete.mediaType === 'photo'
                  ? '📷 صورة'
                  : messageToDelete.mediaType === 'voice'
                  ? '🎤 تسجيل صوتي'
                  : messageToDelete.mediaType === 'video'
                  ? '🎬 فيديو'
                  : messageToDelete.mediaType === 'document'
                  ? '📄 مستند'
                  : 'مرفق وسائط')}
            </div>

            {/* Revoke options: Delete for everyone vs For me only */}
            {messageToDelete.out && (
              <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#17212b] border border-white/5 cursor-pointer hover:border-white/10 transition-colors">
                <input
                  type="checkbox"
                  checked={deleteRevoke}
                  onChange={(e) => setDeleteRevoke(e.target.checked)}
                  className="w-4 h-4 accent-[#54a9eb] rounded cursor-pointer"
                />
                <span className="text-xs text-slate-200">
                  الحذف لدى الجميع ({chat?.title || chat?.name || 'الطرف الآخر'})
                </span>
              </label>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={() => setMessageToDelete(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-white/5 transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 shadow transition-colors cursor-pointer disabled:opacity-50"
              >
                {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>حذف</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
