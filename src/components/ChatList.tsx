import React, { useState, useMemo } from 'react';
import { Search, Pin, Check, CheckCheck, Users, Volume2, User, Sparkles, MessageSquare } from 'lucide-react';
import { TelegramDialog } from '../types';

interface ChatListProps {
  dialogs: TelegramDialog[];
  selectedChatId: string | null;
  onSelectChat: (dialog: TelegramDialog) => void;
  isLoading: boolean;
}

type FilterTab = 'all' | 'users' | 'groups' | 'channels';

export const ChatList: React.FC<ChatListProps> = ({
  dialogs,
  selectedChatId,
  onSelectChat,
  isLoading,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');

  const filteredDialogs = useMemo(() => {
    return dialogs.filter((dialog) => {
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

  return (
    <div className="w-full md:w-80 lg:w-96 bg-[#17212b] border-l border-[#242f3d] flex flex-col h-full shrink-0 select-none">
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
        <div className="flex items-center gap-1 mt-2.5 overflow-x-auto pb-0.5 text-[11px]">
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
                className={`flex items-center gap-3 p-3 transition-colors cursor-pointer relative ${
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

                    <div className="flex items-center gap-1 shrink-0">
                      {dialog.pinned && (
                        <Pin className="w-3 h-3 text-slate-400 rotate-45" />
                      )}
                      {dialog.unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 min-w-5 h-5 rounded-full bg-[#54a9eb] text-white font-bold text-[10px] flex items-center justify-center">
                          {dialog.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
