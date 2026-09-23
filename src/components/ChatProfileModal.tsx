import React, { useState, useEffect } from 'react';
import {
  X,
  Phone,
  Video,
  Radio,
  Bell,
  BellOff,
  Pin,
  PinOff,
  Search,
  Copy,
  Check,
  Share2,
  Trash2,
  LogOut,
  ExternalLink,
  ShieldCheck,
  Users,
  AtSign,
  Info,
  Calendar,
  Lock,
} from 'lucide-react';
import { TelegramDialog, TelegramChatInfo } from '../types';
import { telegramApi } from '../api/telegramApi';
import { Avatar } from './Avatar';
import { MediaViewerModal } from './MediaViewerModal';

interface ChatProfileModalProps {
  chat: TelegramDialog;
  onClose: () => void;
  onMuteToggle?: (muted: boolean) => void;
  onPinToggle?: (pinned: boolean) => void;
  onStartCall?: (video: boolean) => void;
  onOpenVoiceChat?: () => void;
  onOpenSearch?: () => void;
  onClearHistory?: () => void;
  onLeaveChat?: () => void;
}

export const ChatProfileModal: React.FC<ChatProfileModalProps> = ({
  chat,
  onClose,
  onMuteToggle,
  onPinToggle,
  onStartCall,
  onOpenVoiceChat,
  onOpenSearch,
  onClearHistory,
  onLeaveChat,
}) => {
  const [chatInfo, setChatInfo] = useState<TelegramChatInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);

  const chatTitle =
    chatInfo?.title ||
    chat.title ||
    (chat.entity?.firstName
      ? `${chat.entity.firstName} ${chat.entity.lastName || ''}`.trim()
      : chat.entity?.username || `محادثة ${chat.id}`);

  const username = chatInfo?.username || chat.entity?.username;
  const phone = chatInfo?.phone || chat.entity?.phone;
  const bio = chatInfo?.about;

  useEffect(() => {
    let isMounted = true;
    async function loadInfo() {
      try {
        setLoading(true);
        const info = await telegramApi.getChatInfo(chat.id);
        if (isMounted) {
          setChatInfo(info);
        }
      } catch (err) {
        console.warn('Could not fetch full chat info:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadInfo();
    return () => {
      isMounted = false;
    };
  }, [chat.id]);

  const copyToClipboard = (text: string, field: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (_) {}
  };

  const photoUrl = `/api/telegram/avatar/${encodeURIComponent(chat.id)}?big=1`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm select-none animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="bg-[#17212b] border border-[#242f3d] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Header */}
        <div className="px-5 py-3.5 border-b border-[#242f3d] flex items-center justify-between bg-[#141d26]">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span>
              {chat.isChannel
                ? 'معلومات القناة'
                : chat.isGroup
                ? 'معلومات المجموعة'
                : 'الملف الشخصي'}
            </span>
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Main Peer Banner */}
          <div className="flex flex-col items-center text-center">
            <div
              className="relative group cursor-pointer mb-3"
              onClick={() => setIsPhotoViewerOpen(true)}
              title="انقر لعرض الصورة بالحجم الكامل"
            >
              <Avatar
                peerId={chat.id}
                name={chatTitle}
                size="2xl"
                isBig
                isGroup={chat.isGroup}
                isChannel={chat.isChannel}
                customSrc={chat.photoUrl}
                className="w-24 h-24 text-3xl shadow-xl ring-4 ring-[#242f3d] group-hover:scale-105 transition-transform"
              />
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                <ExternalLink className="w-6 h-6" />
              </div>
            </div>

            <h2 className="text-lg font-bold text-white flex items-center justify-center gap-1.5 leading-snug">
              <span>{chatTitle}</span>
              {(chat.entity?.verified || chatInfo?.verified) && (
                <ShieldCheck className="w-4 h-4 text-[#54a9eb]" />
              )}
            </h2>

            <p className="text-xs text-slate-400 mt-1">
              {chat.isChannel ? (
                chatInfo?.participantsCount ? (
                  <span>{chatInfo.participantsCount.toLocaleString()} مشترك</span>
                ) : (
                  'قناة تيليجرام رسمية'
                )
              ) : chat.isGroup ? (
                chatInfo?.participantsCount ? (
                  <span>{chatInfo.participantsCount.toLocaleString()} عضو</span>
                ) : (
                  'مجموعة تيليجرام'
                )
              ) : username ? (
                <span>@{username}</span>
              ) : (
                'مستخدم تيليجرام'
              )}
            </p>
          </div>

          {/* Quick Action Buttons Grid */}
          <div className="grid grid-cols-4 gap-2 pt-1 border-t border-[#242f3d]">
            {/* Call Voice */}
            {chat.isUser && onStartCall && (
              <button
                type="button"
                onClick={() => onStartCall(false)}
                className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-[#242f3d] hover:bg-[#2b5278] text-slate-200 transition cursor-pointer group"
              >
                <Phone className="w-4 h-4 mb-1 text-[#54a9eb] group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-medium">مكالمة</span>
              </button>
            )}

            {/* Call Video */}
            {chat.isUser && onStartCall && (
              <button
                type="button"
                onClick={() => onStartCall(true)}
                className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-[#242f3d] hover:bg-[#2b5278] text-slate-200 transition cursor-pointer group"
              >
                <Video className="w-4 h-4 mb-1 text-emerald-400 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-medium">فيديو</span>
              </button>
            )}

            {/* Voice Chat / Stream for Groups & Channels */}
            {(chat.isGroup || chat.isChannel) && onOpenVoiceChat && (
              <button
                type="button"
                onClick={onOpenVoiceChat}
                className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-[#242f3d] hover:bg-[#2b5278] text-slate-200 transition cursor-pointer group col-span-2"
              >
                <Radio className="w-4 h-4 mb-1 text-purple-400 animate-pulse" />
                <span className="text-[10px] font-medium">
                  {chat.isChannel ? 'بث مباشر' : 'مساحة صوتية'}
                </span>
              </button>
            )}

            {/* Mute Toggle */}
            {onMuteToggle && (
              <button
                type="button"
                onClick={() => onMuteToggle(!chat.muted)}
                className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-[#242f3d] hover:bg-[#2b5278] text-slate-200 transition cursor-pointer group"
              >
                {chat.muted ? (
                  <BellOff className="w-4 h-4 mb-1 text-amber-400 group-hover:scale-110 transition-transform" />
                ) : (
                  <Bell className="w-4 h-4 mb-1 text-slate-300 group-hover:scale-110 transition-transform" />
                )}
                <span className="text-[10px] font-medium">
                  {chat.muted ? 'مكتوم' : 'إشعارات'}
                </span>
              </button>
            )}

            {/* Pin Toggle */}
            {onPinToggle && (
              <button
                type="button"
                onClick={() => onPinToggle(!chat.pinned)}
                className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-[#242f3d] hover:bg-[#2b5278] text-slate-200 transition cursor-pointer group"
              >
                {chat.pinned ? (
                  <Pin className="w-4 h-4 mb-1 text-[#54a9eb] fill-[#54a9eb]/30 group-hover:scale-110 transition-transform" />
                ) : (
                  <PinOff className="w-4 h-4 mb-1 text-slate-400 group-hover:scale-110 transition-transform" />
                )}
                <span className="text-[10px] font-medium">
                  {chat.pinned ? 'مثبت' : 'تثبيت'}
                </span>
              </button>
            )}

            {/* Search in Chat */}
            {onOpenSearch && (
              <button
                type="button"
                onClick={onOpenSearch}
                className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-[#242f3d] hover:bg-[#2b5278] text-slate-200 transition cursor-pointer group"
              >
                <Search className="w-4 h-4 mb-1 text-slate-300 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-medium">بحث</span>
              </button>
            )}
          </div>

          {/* Details Section */}
          <div className="bg-[#1e2a38]/60 border border-[#2b5278]/40 rounded-xl p-3.5 space-y-3 text-xs">
            {/* Bio / Description */}
            {bio && (
              <div className="flex items-start justify-between gap-3 pb-2.5 border-b border-white/5">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-slate-400 block font-medium">الوصف / نبذة</span>
                  <p className="text-white text-xs leading-relaxed whitespace-pre-wrap">{bio}</p>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(bio, 'bio')}
                  title="نسخ النبذة"
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition"
                >
                  {copiedField === 'bio' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            )}

            {/* Username */}
            {username && (
              <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-white/5">
                <div className="flex items-center gap-2.5">
                  <AtSign className="w-4 h-4 text-[#54a9eb]" />
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">اسم المستخدم</span>
                    <span className="text-white font-mono text-xs">@{username}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(`@${username}`, 'username')}
                  title="نسخ اسم المستخدم"
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition"
                >
                  {copiedField === 'username' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            )}

            {/* Phone */}
            {phone && (
              <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-white/5">
                <div className="flex items-center gap-2.5">
                  <Phone className="w-4 h-4 text-emerald-400" />
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">رقم الهاتف</span>
                    <span className="text-white font-mono text-xs" dir="ltr">{phone}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(phone, 'phone')}
                  title="نسخ رقم الهاتف"
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition"
                >
                  {copiedField === 'phone' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            )}

            {/* Peer ID */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Lock className="w-4 h-4 text-slate-400" />
                <div>
                  <span className="text-[10px] text-slate-400 block font-medium">معرف تليجرام (MTProto Peer ID)</span>
                  <span className="text-white font-mono text-xs">{chat.id}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(chat.id, 'id')}
                title="نسخ المعرف"
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition"
              >
                {copiedField === 'id' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Danger Zone Actions */}
          <div className="pt-2 border-t border-[#242f3d] space-y-2">
            {onClearHistory && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onClearHistory();
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>مسح سجل المحادثة</span>
              </button>
            )}

            {onLeaveChat && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLeaveChat();
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>
                  {chat.isGroup
                    ? 'مغادرة المجموعة'
                    : chat.isChannel
                    ? 'مغادرة القناة'
                    : 'حذف المحادثة'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Photo Viewer Modal */}
      <MediaViewerModal
        isOpen={isPhotoViewerOpen}
        onClose={() => setIsPhotoViewerOpen(false)}
        mediaUrl={photoUrl}
        mediaType="photo"
        fileName={`${chatTitle}.jpg`}
        senderName={chatTitle}
      />
    </div>
  );
};
