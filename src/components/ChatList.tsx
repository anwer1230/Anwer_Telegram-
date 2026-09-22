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
  Folder,
  FolderPlus,
  Archive,
  ArchiveRestore,
  Plus,
  ArrowRight,
  Globe,
  Radio,
  SlidersHorizontal,
  X,
  Settings,
} from 'lucide-react';
import { TelegramDialog, TypingStatus, ChatFolder, GlobalSearchResult } from '../types';
import { telegramApi } from '../api/telegramApi';

interface ChatListProps {
  dialogs: TelegramDialog[];
  selectedChatId: string | null;
  onSelectChat: (dialog: TelegramDialog) => void;
  isLoading: boolean;
  typingStatuses?: Record<string, TypingStatus>;
  folders?: ChatFolder[];
  onOpenFolderManager?: () => void;
  onOpenNewChat?: () => void;
  onPinChat?: (dialog: TelegramDialog, pinned: boolean) => Promise<void>;
  onMuteChat?: (dialog: TelegramDialog, muted: boolean) => Promise<void>;
  onArchiveChat?: (dialog: TelegramDialog, archive: boolean) => Promise<void>;
  onClearHistory?: (dialog: TelegramDialog, revoke: boolean) => Promise<void>;
  onLeaveChat?: (dialog: TelegramDialog) => Promise<void>;
  onOpenContacts?: () => void;
  onOpenSettings?: () => void;
}

export const ChatList: React.FC<ChatListProps> = ({
  dialogs,
  selectedChatId,
  onSelectChat,
  isLoading,
  typingStatuses = {},
  folders = [],
  onOpenFolderManager,
  onOpenNewChat,
  onPinChat,
  onMuteChat,
  onArchiveChat,
  onClearHistory,
  onLeaveChat,
  onOpenContacts,
  onOpenSettings,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFolderId, setActiveFolderId] = useState<string | number>('all');
  const [isViewingArchive, setIsViewingArchive] = useState(false);

  // Global Cloud Search State
  const [globalResults, setGlobalResults] = useState<GlobalSearchResult | null>(null);
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);

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

  // Debounced Global Search in Telegram Cloud
  useEffect(() => {
    const clean = searchTerm.trim();
    if (clean.length < 2) {
      setGlobalResults(null);
      setIsSearchingGlobal(false);
      return;
    }

    setIsSearchingGlobal(true);
    const timer = setTimeout(async () => {
      try {
        const results = await telegramApi.searchGlobal(clean);
        setGlobalResults(results);
      } catch (err) {
        console.warn('Global cloud search failed:', err);
      } finally {
        setIsSearchingGlobal(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Separate non-archived vs archived dialogs
  const { regularDialogs, archivedDialogs } = useMemo(() => {
    const regular: TelegramDialog[] = [];
    const archived: TelegramDialog[] = [];
    for (const d of dialogs) {
      if (d.isArchived || d.folderId === 1) {
        archived.push(d);
      } else {
        regular.push(d);
      }
    }
    return { regularDialogs: regular, archivedDialogs: archived };
  }, [dialogs]);

  // Total unread count in archive
  const archivedUnreadCount = useMemo(() => {
    return archivedDialogs.reduce((sum, d) => sum + (d.unreadCount || 0), 0);
  }, [archivedDialogs]);

  // Filter dialogs according to active folder / tab
  const displayedDialogs = useMemo(() => {
    const baseList = isViewingArchive ? archivedDialogs : regularDialogs;

    return baseList.filter((dialog) => {
      // If inside archive view, just filter by search
      if (isViewingArchive) {
        if (!searchTerm.trim()) return true;
        const term = searchTerm.toLowerCase();
        return (
          (dialog.title || dialog.name || '').toLowerCase().includes(term) ||
          (dialog.lastMessage?.text || '').toLowerCase().includes(term)
        );
      }

      // Filter by standard tabs
      if (activeFolderId === 'all') {
        // all non-archived
      } else if (activeFolderId === 'unread') {
        if (!dialog.unreadCount || dialog.unreadCount <= 0) return false;
      } else if (activeFolderId === 'users') {
        if (!dialog.isUser) return false;
      } else if (activeFolderId === 'groups') {
        if (!dialog.isGroup) return false;
      } else if (activeFolderId === 'channels') {
        if (!dialog.isChannel) return false;
      } else {
        // Custom cloud folder
        const customFolder = folders.find((f) => f.id === activeFolderId);
        if (customFolder) {
          if (customFolder.excludeMuted && dialog.muted) return false;
          if (customFolder.excludeRead && (!dialog.unreadCount || dialog.unreadCount === 0)) return false;

          let match = false;
          if (customFolder.contacts && dialog.isUser) match = true;
          if (customFolder.nonContacts && dialog.isUser) match = true;
          if (customFolder.groups && dialog.isGroup) match = true;
          if (customFolder.broadcasts && dialog.isChannel) match = true;
          if (customFolder.includePeerIds && customFolder.includePeerIds.includes(dialog.id)) match = true;
          if (!match && (customFolder.contacts || customFolder.groups || customFolder.broadcasts)) {
            return false;
          }
        }
      }

      // Local search term
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const titleMatch = (dialog.title || dialog.name || '').toLowerCase().includes(term);
      const textMatch = (dialog.lastMessage?.text || '').toLowerCase().includes(term);
      const usernameMatch = (dialog.entity?.username || '').toLowerCase().includes(term);
      return titleMatch || textMatch || usernameMatch;
    }).sort((a, b) => {
      const aPinned = !!a.pinned;
      const bPinned = !!b.pinned;
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      const dateA = a.lastMessage?.date || a.date || 0;
      const dateB = b.lastMessage?.date || b.date || 0;
      return dateB - dateA;
    });
  }, [
    isViewingArchive,
    archivedDialogs,
    regularDialogs,
    activeFolderId,
    folders,
    searchTerm,
  ]);

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

  const getAvatarColor = (title: string) => {
    const colors = [
      'bg-red-500',
      'bg-orange-500',
      'bg-amber-600',
      'bg-emerald-600',
      'bg-teal-600',
      'bg-cyan-600',
      'bg-blue-600',
      'bg-indigo-600',
      'bg-purple-600',
      'bg-pink-600',
    ];
    let hash = 0;
    for (let i = 0; i < title.length; i++) {
      hash = title.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  // Open Context Menu
  const handleOpenMenu = (dialog: TelegramDialog, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveMenuChatId(dialog.id);
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 260);
    setMenuPosition({ x, y });
  };

  // Clear Chat History Confirmation
  const confirmClearChat = async () => {
    if (!chatToClear || !onClearHistory) return;
    setIsClearing(true);
    try {
      await onClearHistory(chatToClear, clearRevoke);
      setChatToClear(null);
    } finally {
      setIsClearing(false);
    }
  };

  // Leave Chat Confirmation
  const confirmLeaveChat = async () => {
    if (!chatToLeave || !onLeaveChat) return;
    setIsLeaving(true);
    try {
      await onLeaveChat(chatToLeave);
      setChatToLeave(null);
    } finally {
      setIsLeaving(false);
    }
  };

  const activeMenuChat = dialogs.find((d) => d.id === activeMenuChatId);

  return (
    <div className="w-full md:w-80 lg:w-96 h-full flex flex-col bg-[#17212b] border-l border-[#242f3d] select-none relative">
      {/* Top Search Bar & New Chat Button */}
      <div className="p-3 border-b border-[#242f3d] bg-[#17212b] flex items-center gap-2">
        {isViewingArchive ? (
          <button
            onClick={() => setIsViewingArchive(false)}
            className="p-2 text-slate-300 hover:text-white rounded-xl hover:bg-white/5 transition flex items-center gap-1 cursor-pointer"
            title="العودة للمحادثات الرئيسية"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
        ) : null}

        <div className="relative flex-1">
          <input
            type="text"
            placeholder={
              isViewingArchive
                ? 'البحث في المحادثات المؤرشفة...'
                : 'البحث في المحادثات وسحابة تليجرام...'
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#242f3d] text-white text-xs rounded-xl pl-8 pr-9 py-2 focus:outline-none focus:ring-1 focus:ring-[#54a9eb] placeholder-slate-400"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute left-2.5 top-2.5 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Contacts Button */}
        {onOpenContacts && !isViewingArchive && (
          <button
            onClick={onOpenContacts}
            className="p-2 rounded-xl bg-[#242f3d] hover:bg-[#2c3848] text-slate-300 hover:text-white transition cursor-pointer shrink-0"
            title="جهات الاتصال"
          >
            <Users className="w-4 h-4 text-[#54a9eb]" />
          </button>
        )}

        {/* Settings Button */}
        {onOpenSettings && !isViewingArchive && (
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-xl bg-[#242f3d] hover:bg-[#2c3848] text-slate-300 hover:text-white transition cursor-pointer shrink-0"
            title="الإعدادات والملف الشخصي"
          >
            <Settings className="w-4 h-4 text-[#54a9eb]" />
          </button>
        )}

        {/* New Chat Button */}
        {onOpenNewChat && !isViewingArchive && (
          <button
            onClick={onOpenNewChat}
            className="p-2 rounded-xl bg-[#54a9eb] hover:bg-[#4397d9] text-white shadow-md transition cursor-pointer shrink-0"
            title="إنشاء محادثة، مجموعة، أو قناة جديدة"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Chat Folders Tab Bar (Tabs for All, Unread, Personal, Groups, Channels, and Cloud Folders) */}
      {!isViewingArchive && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-[#242f3d] bg-[#141d26] overflow-x-auto no-scrollbar">
          {/* All Chats Tab */}
          <button
            onClick={() => setActiveFolderId('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
              activeFolderId === 'all'
                ? 'bg-[#2b5278] text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#202b36]'
            }`}
          >
            <span>الكل</span>
            <span className="text-[10px] opacity-75 font-mono">({regularDialogs.length})</span>
          </button>

          {/* Unread Tab */}
          <button
            onClick={() => setActiveFolderId('unread')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
              activeFolderId === 'unread'
                ? 'bg-[#2b5278] text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#202b36]'
            }`}
          >
            <span>غير مقروء</span>
          </button>

          {/* Personal (Users) Tab */}
          <button
            onClick={() => setActiveFolderId('users')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
              activeFolderId === 'users'
                ? 'bg-[#2b5278] text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#202b36]'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>شخصي</span>
          </button>

          {/* Groups Tab */}
          <button
            onClick={() => setActiveFolderId('groups')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
              activeFolderId === 'groups'
                ? 'bg-[#2b5278] text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#202b36]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>مجموعات</span>
          </button>

          {/* Channels Tab */}
          <button
            onClick={() => setActiveFolderId('channels')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
              activeFolderId === 'channels'
                ? 'bg-[#2b5278] text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#202b36]'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>قنوات</span>
          </button>

          {/* Custom Telegram Cloud Folders */}
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFolderId(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                activeFolderId === f.id
                  ? 'bg-[#2b5278] text-white shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#202b36]'
              }`}
            >
              <span>{f.emoticon || '📁'}</span>
              <span>{f.title}</span>
            </button>
          ))}

          {/* Manage Folders Button */}
          {onOpenFolderManager && (
            <button
              onClick={onOpenFolderManager}
              className="p-1.5 text-slate-400 hover:text-[#54a9eb] hover:bg-[#202b36] rounded-xl transition cursor-pointer shrink-0 mr-auto"
              title="إدارة مجلدات المحادثات (Chat Folders)"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Chat List Body */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#242f3d]/40">
        {/* Archived Chats Row (Shown when not already inside archive and archive exists) */}
        {!isViewingArchive && archivedDialogs.length > 0 && !searchTerm && (
          <div
            onClick={() => setIsViewingArchive(true)}
            className="flex items-center gap-3 p-3 bg-[#1e2a38]/40 hover:bg-[#202b36] transition cursor-pointer group border-b border-[#242f3d]/60"
          >
            <div className="w-12 h-12 rounded-full bg-[#242f3d] flex items-center justify-center text-[#54a9eb] shadow shrink-0 group-hover:scale-105 transition-transform">
              <Archive className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white group-hover:text-[#54a9eb] transition">
                  المحادثات المؤرشفة
                </h4>
                <span className="text-[11px] text-slate-400">
                  {archivedDialogs.length} محادثات
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                اسحب أو انقر لعرض محادثات الأرشيف
              </p>
            </div>

            {archivedUnreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[#54a9eb] text-white text-[10px] font-bold">
                {archivedUnreadCount}
              </span>
            )}
          </div>
        )}

        {/* Loading Spinner */}
        {isLoading && dialogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <div className="w-8 h-8 border-2 border-[#54a9eb] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-xs">جاري مزامنة المحادثات من سحابة تليجرام...</p>
          </div>
        ) : displayedDialogs.length === 0 && (!globalResults || (!globalResults.contacts.length && !globalResults.chats.length && !globalResults.messages.length)) ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
            {isViewingArchive ? (
              <>
                <Archive className="w-8 h-8 text-slate-600 mb-2" />
                <p className="text-xs">لا توجد محادثات في الأرشيف حالياً</p>
              </>
            ) : (
              <>
                <MessageSquare className="w-8 h-8 text-slate-600 mb-2" />
                <p className="text-xs">لا توجد محادثات تطابق هذا التبويب</p>
              </>
            )}
          </div>
        ) : (
          displayedDialogs.map((dialog) => {
            const isSelected = selectedChatId === dialog.id;
            const displayName = dialog.title || dialog.name || 'محادثة تليجرام';
            const initial = displayName.trim().charAt(0) || 'T';
            const avatarBg = getAvatarColor(displayName);

            const cleanId = dialog.id.replace(/^-100/, '').replace(/^-/, '');
            const activeTyping = typingStatuses[dialog.id] || typingStatuses[cleanId];

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
                  className={`w-12 h-12 rounded-full ${avatarBg} flex items-center justify-center text-white font-bold text-base shrink-0 shadow relative`}
                >
                  {dialog.isChannel ? (
                    <Volume2 className="w-5 h-5 text-white/90" />
                  ) : dialog.isGroup ? (
                    <Users className="w-5 h-5 text-white/90" />
                  ) : (
                    initial
                  )}
                  {dialog.isArchived && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#17212b] border border-[#2b5278] flex items-center justify-center text-slate-300">
                      <Archive className="w-2.5 h-2.5" />
                    </div>
                  )}
                </div>

                {/* Dialog Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3
                      className={`text-xs font-bold truncate flex items-center gap-1 ${
                        isSelected ? 'text-white' : 'text-slate-100'
                      }`}
                    >
                      <span className="truncate">{displayName}</span>
                      {dialog.muted && (
                        <BellOff className="w-3 h-3 text-slate-400 shrink-0" />
                      )}
                      {dialog.pinned && (
                        <Pin className="w-3 h-3 text-[#54a9eb] fill-[#54a9eb] shrink-0" />
                      )}
                    </h3>
                    <span
                      className={`text-[10px] whitespace-nowrap ml-1 ${
                        isSelected ? 'text-white/80' : 'text-slate-400'
                      }`}
                    >
                      {formatTime(dialog.lastMessage?.date || dialog.date)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    {activeTyping ? (
                      <div className="flex items-center gap-1.5 text-[#54a9eb] font-medium text-[11px] animate-pulse">
                        <span className="flex gap-0.5 items-center">
                          <span className="w-1 h-1 rounded-full bg-[#54a9eb] animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-1 h-1 rounded-full bg-[#54a9eb] animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-1 h-1 rounded-full bg-[#54a9eb] animate-bounce" />
                        </span>
                        <span className="truncate">{activeTyping.actionText}</span>
                      </div>
                    ) : (
                      <p
                        className={`truncate text-[11px] flex items-center gap-1 ${
                          isSelected ? 'text-white/80' : 'text-slate-400'
                        }`}
                      >
                        {dialog.lastMessage?.out && (
                          <span
                            className="inline-flex shrink-0"
                            title={dialog.lastMessage.unread ? 'تم الإرسال (غير مقروءة)' : 'مقروءة'}
                          >
                            {dialog.lastMessage.unread ? (
                              <Check className="w-3.5 h-3.5 text-slate-400" />
                            ) : (
                              <CheckCheck className="w-3.5 h-3.5 text-[#54a9eb]" />
                            )}
                          </span>
                        )}
                        <span className="truncate">
                          {dialog.lastMessage?.text || 'لا توجد رسائل بعد'}
                        </span>
                      </p>
                    )}

                    <div className="flex items-center gap-1 shrink-0 mr-1">
                      {dialog.unreadCount > 0 && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            dialog.muted
                              ? 'bg-slate-700 text-slate-300'
                              : 'bg-[#54a9eb] text-white'
                          }`}
                        >
                          {dialog.unreadCount}
                        </span>
                      )}

                      {/* Quick 3-dots trigger button */}
                      <button
                        type="button"
                        onClick={(e) => handleOpenMenu(dialog, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition"
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

        {/* Global Cloud Search Results Section */}
        {searchTerm.trim().length >= 2 && (
          <div className="p-3 bg-[#131b24] border-t border-[#242f3d]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-[#54a9eb] flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                <span>نتائج البحث العام في سحابة تليجرام</span>
              </span>
              {isSearchingGlobal && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#54a9eb]" />
              )}
            </div>

            {/* Global Contacts & Users */}
            {globalResults?.contacts && globalResults.contacts.length > 0 && (
              <div className="space-y-1 mb-3">
                <span className="text-[10px] font-semibold text-slate-400 block px-1">
                  المستخدمون وجهات الاتصال
                </span>
                {globalResults.contacts.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      onSelectChat({
                        id: c.id,
                        title: c.title,
                        isUser: true,
                        isGroup: false,
                        isChannel: false,
                        unreadCount: 0,
                        date: Math.floor(Date.now() / 1000),
                        entity: { username: c.username, phone: c.phone },
                      });
                    }}
                    className="p-2 rounded-xl bg-[#1e2a38]/60 hover:bg-[#2b5278] transition cursor-pointer flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-[#54a9eb]/20 text-[#54a9eb] flex items-center justify-center font-bold text-xs">
                        {c.title.charAt(0)}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">{c.title}</h4>
                        <span className="text-[10px] text-slate-400">
                          {c.username ? `@${c.username}` : 'مستخدم'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Global Public Channels & Groups */}
            {globalResults?.chats && globalResults.chats.length > 0 && (
              <div className="space-y-1 mb-3">
                <span className="text-[10px] font-semibold text-slate-400 block px-1">
                  القنوات والمجموعات العامة
                </span>
                {globalResults.chats.map((ch) => (
                  <div
                    key={ch.id}
                    onClick={() => {
                      onSelectChat({
                        id: ch.id,
                        title: ch.title,
                        isUser: false,
                        isGroup: ch.isGroup,
                        isChannel: ch.isChannel,
                        unreadCount: 0,
                        date: Math.floor(Date.now() / 1000),
                        entity: { username: ch.username },
                      });
                    }}
                    className="p-2 rounded-xl bg-[#1e2a38]/60 hover:bg-[#2b5278] transition cursor-pointer flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs">
                        {ch.isChannel ? <Volume2 className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white">{ch.title}</h4>
                        <span className="text-[10px] text-slate-400">
                          {ch.username ? `@${ch.username}` : ch.isChannel ? 'قناة عامة' : 'مجموعة'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Global Cloud Messages */}
            {globalResults?.messages && globalResults.messages.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] font-semibold text-slate-400 block px-1">
                  الرسائل السحابية
                </span>
                {globalResults.messages.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => {
                      if (m.chatId) {
                        const existing = dialogs.find((d) => d.id === m.chatId);
                        if (existing) {
                          onSelectChat(existing);
                        } else {
                          onSelectChat({
                            id: m.chatId,
                            title: 'محادثة',
                            isUser: true,
                            isGroup: false,
                            isChannel: false,
                            unreadCount: 0,
                            date: m.date,
                          });
                        }
                      }
                    }}
                    className="p-2 rounded-xl bg-[#1e2a38]/40 hover:bg-[#2b5278] transition cursor-pointer"
                  >
                    <p className="text-xs text-white truncate">{m.text}</p>
                    <span className="text-[10px] text-slate-400">{formatTime(m.date)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Custom Context Menu */}
      {activeMenuChat && menuPosition && (
        <div
          ref={menuRef}
          style={{ top: `${menuPosition.y}px`, left: `${menuPosition.x}px` }}
          className="fixed z-50 w-52 bg-[#1e2a38] border border-[#2b5278]/50 rounded-2xl shadow-2xl py-1.5 backdrop-blur-md animate-in fade-in duration-100 select-none text-xs"
        >
          {/* Pin / Unpin */}
          {onPinChat && (
            <button
              onClick={() => {
                onPinChat(activeMenuChat, !activeMenuChat.pinned);
                setActiveMenuChatId(null);
              }}
              className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-slate-200 hover:bg-[#2b5278] hover:text-white transition cursor-pointer text-right"
            >
              {activeMenuChat.pinned ? (
                <>
                  <PinOff className="w-4 h-4 text-slate-400" />
                  <span>إلغاء التثبيت</span>
                </>
              ) : (
                <>
                  <Pin className="w-4 h-4 text-[#54a9eb]" />
                  <span>تثبيت في الأعلى</span>
                </>
              )}
            </button>
          )}

          {/* Mute / Unmute */}
          {onMuteChat && (
            <button
              onClick={() => {
                onMuteChat(activeMenuChat, !activeMenuChat.muted);
                setActiveMenuChatId(null);
              }}
              className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-slate-200 hover:bg-[#2b5278] hover:text-white transition cursor-pointer text-right"
            >
              {activeMenuChat.muted ? (
                <>
                  <Bell className="w-4 h-4 text-emerald-400" />
                  <span>تفعيل الإشعارات</span>
                </>
              ) : (
                <>
                  <BellOff className="w-4 h-4 text-amber-400" />
                  <span>كتم الإشعارات</span>
                </>
              )}
            </button>
          )}

          {/* Archive / Unarchive */}
          {onArchiveChat && (
            <button
              onClick={() => {
                onArchiveChat(activeMenuChat, !activeMenuChat.isArchived);
                setActiveMenuChatId(null);
              }}
              className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-slate-200 hover:bg-[#2b5278] hover:text-white transition cursor-pointer text-right"
            >
              {activeMenuChat.isArchived ? (
                <>
                  <ArchiveRestore className="w-4 h-4 text-[#54a9eb]" />
                  <span>إلغاء الأرشفة</span>
                </>
              ) : (
                <>
                  <Archive className="w-4 h-4 text-slate-400" />
                  <span>أرشفة المحادثة</span>
                </>
              )}
            </button>
          )}

          <div className="h-px bg-[#242f3d] my-1" />

          {/* Clear History */}
          {onClearHistory && (
            <button
              onClick={() => {
                setChatToClear(activeMenuChat);
                setActiveMenuChatId(null);
              }}
              className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-amber-400 hover:bg-amber-500/10 transition cursor-pointer text-right"
            >
              <Trash2 className="w-4 h-4" />
              <span>مسح سجل المحادثة</span>
            </button>
          )}

          {/* Leave Chat */}
          {onLeaveChat && (
            <button
              onClick={() => {
                setChatToLeave(activeMenuChat);
                setActiveMenuChatId(null);
              }}
              className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-rose-400 hover:bg-rose-500/10 transition cursor-pointer text-right"
            >
              <LogOut className="w-4 h-4" />
              <span>
                {activeMenuChat.isGroup || activeMenuChat.isChannel
                  ? 'مغادرة المجموعة/القناة'
                  : 'حذف المحادثة'}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Clear History Modal */}
      {chatToClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-[#17212b] border border-[#2b5278]/40 rounded-2xl shadow-2xl p-5 text-right">
            <div className="flex items-center gap-3 text-amber-400 mb-3">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-sm text-white">مسح سجل المحادثة</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              هل أنت متأكد من رغبتك في مسح سجل الرسائل مع{' '}
              <span className="font-bold text-white">
                {chatToClear.title || chatToClear.name}
              </span>
              ؟
            </p>

            <label className="flex items-center gap-2 mb-5 cursor-pointer text-xs text-slate-200 select-none">
              <input
                type="checkbox"
                checked={clearRevoke}
                onChange={(e) => setClearRevoke(e.target.checked)}
                className="w-4 h-4 rounded text-[#54a9eb] focus:ring-0 cursor-pointer"
              />
              <span>حذف الرسائل لدى الطرف الآخر أيضاً</span>
            </label>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setChatToClear(null)}
                disabled={isClearing}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={confirmClearChat}
                disabled={isClearing}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition flex items-center gap-2 cursor-pointer shadow-lg disabled:opacity-50"
              >
                {isClearing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>مسح السجل</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Chat Modal */}
      {chatToLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-[#17212b] border border-[#2b5278]/40 rounded-2xl shadow-2xl p-5 text-right">
            <div className="flex items-center gap-3 text-rose-400 mb-3">
              <LogOut className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-sm text-white">
                {chatToLeave.isGroup || chatToLeave.isChannel
                  ? 'مغادرة القناة/المجموعة'
                  : 'حذف المحادثة'}
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed mb-5">
              هل أنت متأكد من مغادرة{' '}
              <span className="font-bold text-white">
                {chatToLeave.title || chatToLeave.name}
              </span>
              ؟ لن تتلقى تحديثات جديدة بعد ذلك.
            </p>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setChatToLeave(null)}
                disabled={isLeaving}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={confirmLeaveChat}
                disabled={isLeaving}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition flex items-center gap-2 cursor-pointer shadow-lg disabled:opacity-50"
              >
                {isLeaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>مغادرة</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
