import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  Pin,
  PinOff,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Users,
  Volume2,
  User,
  MessageSquare,
  MoreVertical,
  Trash2,
  LogOut,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { TelegramDialog } from '../types';

interface ChatListProps {
  dialogs: TelegramDialog[];
  selectedChatId: string | null;
  onSelectChat: (dialog: TelegramDialog) => void;
  isLoading: boolean;
  onPinChat?: (dialog: TelegramDialog, pinned: boolean) => Promise<void>;
  onMuteChat?: (dialog: TelegramDialog, muted: boolean) => Promise<void>;
  onClearHistory?: (dialog: TelegramDialog, revoke: boolean) => Promise<void>;
  onLeaveChat?: (dialog: TelegramDialog) => Promise<void>;
}

type FilterTab = 'all' | 'users' | 'groups' | 'channels';

export const ChatList: React.FC<ChatListProps> = ({
  dialogs,
  selectedChatId,
  onSelectChat,
  isLoading,
  onPinChat,
  onMuteChat,
  onClearHistory,
  onLeaveChat,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');

  // Context menu state
  const [activeMenuChatId, setActiveMenuChatId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Modals state
  const [chatToClear, setChatToClear] = useState<TelegramDialog | null>(null);
  const [clearRevoke, setClearRevoke] = useState(true);
  const [isClearing, setIsClearing] = useState(false);

  const [chatToLeave, setChatToLeave] = useState<TelegramDialog | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenuChatId(null);
        setMenuPosition(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredDialogs = useMemo(() => {
    const filtered = dialogs.filter((dialog) => {
      // Filter by tab
      if (filterTab === 'users' && !dialog.isUser) return false;
      if (filterTab === 'groups' && !dialog.isGroup) return false;
      if (filterTab === 'channels' && !dialog.isChannel) return false;

      // Filter by search
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const titleMatch = (dialog.title || dialog.name || '').toLowerCase().includes(term);
      const textMatch = (dialog.lastMessage?.text || '').toLowerCase().includes(term);
      const usernameMatch = (dialog.entity?.username || '').toLowerCase().includes(term);
      return titleMatch || textMatch || usernameMatch;
    });

    // Sort: Pinned chats at the top, then newest date
    return filtered.sort((a, b) => {
      const aPinned = !!a.pinned;
      const bPinned = !!b.pinned;
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      const dateA = a.lastMessage?.date || a.date || 0;
      const dateB = b.lastMessage?.date || b.date || 0;
      return dateB - dateA;
    });
  }, [dialogs, filterTab, searchTerm]);

  // Format timestamp like Telegram
  const formatTime = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    return date.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
  };

  // Color generator for avatar initials
  const getAvatarColor = (title: string) => {
    const colors = [
      'bg-red-500',
      'bg-amber-600',
      'bg-emerald-600',
      'bg-cyan-600',
      'bg-blue-600',
      'bg-indigo-600',
      'bg-violet-600',
      'bg-rose-600',
    ];
    let hash = 0;
    for (let i = 0; i < title.length; i++) {
      hash = title.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const handleOpenMenu = (dialog: TelegramDialog, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setActiveMenuChatId(dialog.id);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPosition({
      x: Math.min(window.innerWidth - 220, rect.left),
      y: Math.min(window.innerHeight - 240, rect.bottom + 4),
    });
  };

  const handleConfirmClear = async () => {
    if (!chatToClear || !onClearHistory) return;
    try {
      setIsClearing(true);
      await onClearHistory(chatToClear, clearRevoke);
      setChatToClear(null);
    } catch (err: any) {
      alert(`فشل مسح المحادثة: ${err.message || 'خطأ غير متوقع'}`);
    } finally {
      setIsClearing(false);
    }
  };

  const handleConfirmLeave = async () => {
    if (!chatToLeave || !onLeaveChat) return;
    try {
      setIsLeaving(true);
      await onLeaveChat(chatToLeave);
      setChatToLeave(null);
    } catch (err: any) {
      alert(`فشل مغادرة المحادثة: ${err.message || 'خطأ غير متوقع'}`);
    } finally {
      setIsLeaving(false);
    }
  };

  return (
    <div className="w-full md:w-80 lg:w-96 bg-[#17212b] border-l border-[#242f3d] flex flex-col h-full shrink-0 select-none relative">
      {/* Search Input */}
      <div className="p-3 border-b border-[#242f3d]/60">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="بحث في المحادثات..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#242f3d] rounded-xl pr-9 pl-3 py-2 text-xs text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#54a9eb] transition-all"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 mt-2.5 overflow-x-auto pb-0.5 text-[11px] scrollbar-none">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-3 py-1 rounded-full whitespace-nowrap transition-colors cursor-pointer ${
              filterTab === 'all'
                ? 'bg-[#2b5278] text-white font-medium'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#242f3d]'
            }`}
          >
            الكل ({dialogs.length})
          </button>
          <button
            onClick={() => setFilterTab('users')}
            className={`px-3 py-1 rounded-full whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1 ${
              filterTab === 'users'
                ? 'bg-[#2b5278] text-white font-medium'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#242f3d]'
            }`}
          >
            <User className="w-3 h-3" />
            <span>خاص</span>
          </button>
          <button
            onClick={() => setFilterTab('groups')}
            className={`px-3 py-1 rounded-full whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1 ${
              filterTab === 'groups'
                ? 'bg-[#2b5278] text-white font-medium'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#242f3d]'
            }`}
          >
            <Users className="w-3 h-3" />
            <span>المجموعات</span>
          </button>
          <button
            onClick={() => setFilterTab('channels')}
            className={`px-3 py-1 rounded-full whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1 ${
              filterTab === 'channels'
                ? 'bg-[#2b5278] text-white font-medium'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#242f3d]'
            }`}
          >
            <Volume2 className="w-3 h-3" />
            <span>القنوات</span>
          </button>
        </div>
      </div>

      {/* Chat List Body */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#242f3d]/40">
        {isLoading && dialogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <div className="w-8 h-8 border-2 border-[#54a9eb] border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-xs">جاري مزامنة المحادثات من سحابة تليجرام...</p>
          </div>
        ) : filteredDialogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <MessageSquare className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-xs">لا توجد محادثات تطابق بحثك</p>
          </div>
        ) : (
          filteredDialogs.map((dialog) => {
            const isSelected = selectedChatId === dialog.id;
            const displayName = dialog.title || dialog.name || 'محادثة تليجرام';
            const initial = displayName.trim().charAt(0) || 'T';
            const avatarBg = getAvatarColor(displayName);

            return (
              <div
                key={dialog.id}
                onClick={() => onSelectChat(dialog)}
                onContextMenu={(e) => handleOpenMenu(dialog, e)}
                className={`group flex items-center gap-3 p-3 transition-colors cursor-pointer relative ${
                  isSelected
                    ? 'bg-[#2b5278] text-white'
                    : 'hover:bg-[#202b36] text-slate-200'
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-12 h-12 rounded-full ${avatarBg} flex items-center justify-center text-white font-bold text-base shrink-0 shadow`}
                >
                  {dialog.isChannel ? (
                    <Volume2 className="w-5 h-5 text-white/90" />
                  ) : dialog.isGroup ? (
                    <Users className="w-5 h-5 text-white/90" />
                  ) : (
                    <span>{initial}</span>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-semibold text-sm truncate block leading-tight">
                        {displayName}
                      </span>
                      {dialog.entity?.verified && (
                        <Check className="w-3.5 h-3.5 text-[#54a9eb] shrink-0" />
                      )}
                    </div>
                    <span
                      className={`text-[10px] shrink-0 ${
                        isSelected ? 'text-slate-200' : 'text-slate-400'
                      }`}
                    >
                      {formatTime(dialog.lastMessage?.date || dialog.date)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-1 text-xs">
                    <p
                      className={`truncate text-xs ${
                        isSelected ? 'text-slate-200' : 'text-slate-400'
                      }`}
                    >
                      {dialog.lastMessage?.out && (
                        <span className="inline-block ml-1 text-[#54a9eb]">
                          <CheckCheck className="w-3.5 h-3.5 inline" />
                        </span>
                      )}
                      {dialog.lastMessage?.text || 'لا توجد رسائل'}
                    </p>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Pinned Icon */}
                      {dialog.pinned && (
                        <span title="محادثة مثبتة">
                          <Pin className="w-3.5 h-3.5 text-[#54a9eb] fill-[#54a9eb]/30 rotate-45" />
                        </span>
                      )}

                      {/* Muted Icon */}
                      {dialog.muted && (
                        <span title="الإشعارات مكتومة">
                          <BellOff className="w-3.5 h-3.5 text-slate-400" />
                        </span>
                      )}

                      {/* Unread badge */}
                      {dialog.unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 min-w-5 h-5 rounded-full bg-[#54a9eb] text-white font-bold text-[10px] flex items-center justify-center">
                          {dialog.unreadCount}
                        </span>
                      )}

                      {/* Context menu action trigger button (visible on hover) */}
                      <button
                        type="button"
                        onClick={(e) => handleOpenMenu(dialog, e)}
                        title="خيارات المحادثة"
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-white/10 text-slate-300 hover:text-white transition-opacity cursor-pointer"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Chat Options Context Menu Dropdown */}
      {activeMenuChatId && (
        (() => {
          const targetDialog = dialogs.find((d) => d.id === activeMenuChatId);
          if (!targetDialog) return null;

          return (
            <div
              ref={menuRef}
              style={{
                position: 'fixed',
                top: menuPosition ? `${menuPosition.y}px` : '40%',
                left: menuPosition ? `${menuPosition.x}px` : '20%',
              }}
              className="z-50 w-52 bg-[#1e2c3a] border border-[#2c3e50] rounded-2xl shadow-2xl py-1.5 text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-100"
              dir="rtl"
            >
              {/* Pin / Unpin */}
              {onPinChat && (
                <button
                  type="button"
                  onClick={async () => {
                    const willPin = !targetDialog.pinned;
                    setActiveMenuChatId(null);
                    await onPinChat(targetDialog, willPin);
                  }}
                  className="w-full px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-[#242f3d] text-right transition-colors cursor-pointer"
                >
                  {targetDialog.pinned ? (
                    <>
                      <PinOff className="w-4 h-4 text-slate-400" />
                      <span>إلغاء تثبيت المحادثة</span>
                    </>
                  ) : (
                    <>
                      <Pin className="w-4 h-4 text-[#54a9eb]" />
                      <span>تثبيت المحادثة في الأعلى</span>
                    </>
                  )}
                </button>
              )}

              {/* Mute / Unmute */}
              {onMuteChat && (
                <button
                  type="button"
                  onClick={async () => {
                    const willMute = !targetDialog.muted;
                    setActiveMenuChatId(null);
                    await onMuteChat(targetDialog, willMute);
                  }}
                  className="w-full px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-[#242f3d] text-right transition-colors cursor-pointer"
                >
                  {targetDialog.muted ? (
                    <>
                      <Bell className="w-4 h-4 text-[#54a9eb]" />
                      <span>تفعيل الإشعارات (إلغاء الكتم)</span>
                    </>
                  ) : (
                    <>
                      <BellOff className="w-4 h-4 text-slate-400" />
                      <span>كتم الإشعارات (Mute)</span>
                    </>
                  )}
                </button>
              )}

              <div className="h-px bg-white/5 my-1" />

              {/* Clear History */}
              {onClearHistory && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveMenuChatId(null);
                    setChatToClear(targetDialog);
                  }}
                  className="w-full px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-[#242f3d] text-amber-400 text-right transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 text-amber-400" />
                  <span>مسح سجل المحادثة (Clear History)</span>
                </button>
              )}

              {/* Leave Chat / Group */}
              {onLeaveChat && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveMenuChatId(null);
                    setChatToLeave(targetDialog);
                  }}
                  className="w-full px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-[#242f3d] text-rose-400 text-right transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4 text-rose-400" />
                  <span>
                    {targetDialog.isGroup
                      ? 'مغادرة المجموعة'
                      : targetDialog.isChannel
                      ? 'مغادرة القناة'
                      : 'حذف ومغادرة المحادثة'}
                  </span>
                </button>
              )}
            </div>
          );
        })()
      )}

      {/* Clear History Modal */}
      {chatToClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-[#1e2c3a] border border-[#2c3e50] rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4" dir="rtl">
            <div className="flex items-center gap-2.5 text-amber-400">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-white">مسح سجل المحادثة</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              هل أنت متأكد من مسح جميع الرسائل في محادثة{' '}
              <span className="font-bold text-white">
                "{chatToClear.title || chatToClear.name}"
              </span>
              ؟ لن تتمكن من استرجاعها بعد ذلك.
            </p>

            <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#17212b] border border-white/5 cursor-pointer hover:border-white/10 transition-colors">
              <input
                type="checkbox"
                checked={clearRevoke}
                onChange={(e) => setClearRevoke(e.target.checked)}
                className="w-4 h-4 accent-[#54a9eb] rounded cursor-pointer"
              />
              <span className="text-xs text-slate-200">
                مسح السجل أيضاً لدى الطرف الآخر (Revoke)
              </span>
            </label>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={() => setChatToClear(null)}
                disabled={isClearing}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-white/5 transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmClear}
                disabled={isClearing}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5 shadow transition-colors cursor-pointer disabled:opacity-50"
              >
                {isClearing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>مسح السجل الآن</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Chat Modal */}
      {chatToLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-[#1e2c3a] border border-[#2c3e50] rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4" dir="rtl">
            <div className="flex items-center gap-2.5 text-rose-400">
              <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-white">
                {chatToLeave.isGroup ? 'مغادرة المجموعة' : 'مغادرة المحادثة'}
              </h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              هل أنت متأكد من مغادرة{' '}
              <span className="font-bold text-white">
                "{chatToLeave.title || chatToLeave.name}"
              </span>
              ؟ سيتم إزالتها من قائمة محادثاتك في تليجرام.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={() => setChatToLeave(null)}
                disabled={isLeaving}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-white/5 transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmLeave}
                disabled={isLeaving}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 shadow transition-colors cursor-pointer disabled:opacity-50"
              >
                {isLeaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>تأكيد المغادرة</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
