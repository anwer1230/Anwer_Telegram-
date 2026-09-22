import React, { useState, useEffect, useCallback } from 'react';
import { WifiOff } from 'lucide-react';
import { Header } from './components/Header';
import { AuthView } from './components/AuthView';
import { ChatList } from './components/ChatList';
import { ChatView } from './components/ChatView';
import { OfficialInfoModal } from './components/OfficialInfoModal';
import { CallModal } from './components/CallModal';
import { VoiceChatModal } from './components/VoiceChatModal';
import { FolderManagerModal } from './components/FolderManagerModal';
import { NewChatModal } from './components/NewChatModal';
import {
  TelegramDialog,
  TelegramServerStatus,
  TelegramUser,
  TypingStatus,
  ChatFolder,
  CallSession,
} from './types';
import { telegramApi } from './api/telegramApi';
import { indexedDbCache } from './utils/indexedDbCache';

export default function App() {
  const [status, setStatus] = useState<TelegramServerStatus | null>(null);
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [dialogs, setDialogs] = useState<TelegramDialog[]>([]);
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [selectedChat, setSelectedChat] = useState<TelegramDialog | null>(null);
  const [isAuth, setIsAuth] = useState<boolean>(false);
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [slowLoading, setSlowLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState<boolean>(false);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [typingStatuses, setTypingStatuses] = useState<Record<string, TypingStatus>>({});
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);

  // New features modals & state
  const [isFolderManagerOpen, setIsFolderManagerOpen] = useState(false);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [activeVoiceChat, setActiveVoiceChat] = useState<{
    chatId: string;
    title: string;
    isChannel: boolean;
  } | null>(null);

  const selectedChatIdRef = React.useRef<string | undefined>(selectedChat?.id);
  selectedChatIdRef.current = selectedChat?.id;

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Track slow loading to provide skip and clear actions
  useEffect(() => {
    if (!loadingInitial) {
      setSlowLoading(false);
      return;
    }
    const timer = setTimeout(() => {
      setSlowLoading(true);
    }, 2200);
    return () => clearTimeout(timer);
  }, [loadingInitial]);

  // Load Dialogs from Telegram Cloud & Cache to IndexedDB
  const loadDialogs = useCallback(async (quiet = false, retry = true) => {
    if (!quiet) setIsRefreshing(true);
    try {
      const chatList = await telegramApi.getDialogs(40);
      setDialogs(chatList);
      indexedDbCache.saveDialogs(chatList);

      // Update selected chat reference if active without re-triggering callback
      setSelectedChat((prev) => {
        if (!prev) return null;
        const updated = chatList.find((d) => d.id === prev.id);
        return updated || prev;
      });
    } catch (err: any) {
      // Offline fallback: load dialogs from IndexedDB
      const cached = await indexedDbCache.getCachedDialogs();
      if (cached.length > 0) {
        setDialogs(cached);
      }

      if (retry) {
        console.warn('Initial dialog fetch hiccup, retrying gracefully in background...');
        setTimeout(() => {
          loadDialogs(quiet, false);
        }, 1200);
      } else {
        console.error('Failed to load dialogs from Telegram:', err);
      }
    } finally {
      if (!quiet) setIsRefreshing(false);
    }
  }, []);

  // Load Chat Folders from Telegram Cloud (account.getDialogFilters)
  const loadFolders = useCallback(async () => {
    try {
      const list = await telegramApi.getFolders();
      setFolders(list);
    } catch (err) {
      console.warn('Failed to load chat folders:', err);
    }
  }, []);

  // Initial check on mount - runs strictly once
  useEffect(() => {
    let isMounted = true;

    // Safety watchdog: ensure loading screen NEVER hangs longer than 4 seconds
    const watchdogTimer = setTimeout(() => {
      if (isMounted) {
        setLoadingInitial(false);
      }
    }, 4000);

    const initApp = async () => {
      try {
        const serverStatus = await telegramApi.getStatus().catch((err) => {
          console.warn('Backend status probe returned error:', err);
          return {
            connected: false,
            authorized: false,
            configured: false,
            apiIdPresent: false,
            apiHashPresent: false,
          } as unknown as TelegramServerStatus;
        });

        if (!isMounted) return;
        setStatus(serverStatus);

        if (serverStatus.authorized) {
          setIsAuth(true);

          try {
            const me = await telegramApi.getMe();
            if (isMounted) setUser(me);
          } catch (e) {
            console.warn('Failed to get me profile:', e);
          }

          if (isMounted) {
            loadDialogs(true);
            loadFolders();
          }
        }
      } catch (err) {
        console.error('Initial bootstrap failed:', err);
      } finally {
        if (isMounted) {
          clearTimeout(watchdogTimer);
          setLoadingInitial(false);
        }
      }
    };

    initApp();

    return () => {
      isMounted = false;
      clearTimeout(watchdogTimer);
    };
  }, [loadDialogs, loadFolders]);

  // Subscribe to real-time events via Server-Sent Events (SSE)
  useEffect(() => {
    if (!isAuth) return;

    const unsubscribe = telegramApi.subscribeToEvents({
      onNewMessage: () => {
        // Refresh dialogs list to show latest snippet and unread counter
        loadDialogs(true);
      },
      onTypingStatus: (data) => {
        const cleanChatId = data.chatId.replace(/^-100/, '').replace(/^-/, '');
        if (data.actionType === 'cancel') {
          setTypingStatuses((prev) => {
            const next = { ...prev };
            delete next[data.chatId];
            delete next[cleanChatId];
            return next;
          });
        } else {
          setTypingStatuses((prev) => ({
            ...prev,
            [data.chatId]: data,
            [cleanChatId]: data,
          }));
          setTimeout(() => {
            setTypingStatuses((prev) => {
              const next = { ...prev };
              delete next[data.chatId];
              delete next[cleanChatId];
              return next;
            });
          }, 6000);
        }
      },
      onReadReceipt: (data) => {
        const cleanChatId = data.chatId.replace(/^-100/, '').replace(/^-/, '');
        setDialogs((prev) => {
          const next = prev.map((d) => {
            const dClean = d.id.replace(/^-100/, '').replace(/^-/, '');
            if (d.id === data.chatId || dClean === cleanChatId) {
              if (d.lastMessage && d.lastMessage.out && d.lastMessage.id && d.lastMessage.id <= data.maxId) {
                return {
                  ...d,
                  lastMessage: {
                    ...d.lastMessage,
                    unread: false,
                  },
                };
              }
            }
            return d;
          });
          indexedDbCache.saveDialogs(next);
          return next;
        });
      },
      // Real-time WebRTC Calls Signaling Events
      onCallIncoming: (data) => {
        setActiveCall({
          callId: data.callId,
          peerId: data.callerId,
          peerName: data.callerName || 'مستخدم تليجرام',
          isVideo: !!data.isVideo,
          isOutgoing: false,
          status: 'calling',
          sdp: data.sdp,
        });
      },
      onCallAnswered: (data) => {
        setActiveCall((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            status: 'connected',
            sdp: data.sdp,
          };
        });
      },
      onCallEnded: () => {
        setActiveCall(null);
      },
    });

    return () => {
      unsubscribe();
    };
  }, [isAuth, loadDialogs]);

  // Handle Authentication Success
  const handleAuthSuccess = async () => {
    setLoadingInitial(true);
    try {
      const currentUser = await telegramApi.getMe();
      setUser(currentUser);
      setIsAuth(true);
      await loadDialogs();
      await loadFolders();
    } catch (err) {
      console.error('Post-auth fetch failed:', err);
    } finally {
      setLoadingInitial(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    if (window.confirm('هل أنت متأكد من تسجيل الخروج من جلسة تليجرام؟')) {
      await telegramApi.logout();
      setIsAuth(false);
      setUser(null);
      setDialogs([]);
      setSelectedChat(null);
    }
  };

  // Handle selecting chat
  const handleSelectChat = (dialog: TelegramDialog) => {
    setSelectedChat(dialog);
    setMobileView('chat');
  };

  // Pin / Unpin chat
  const handlePinChat = async (dialog: TelegramDialog, pinned: boolean) => {
    try {
      await telegramApi.pinChat(dialog.id, pinned);
      setDialogs((prev) =>
        prev.map((d) => (d.id === dialog.id ? { ...d, pinned } : d))
      );
      if (selectedChat?.id === dialog.id) {
        setSelectedChat((prev) => (prev ? { ...prev, pinned } : null));
      }
    } catch (err: any) {
      alert(`فشل تحديث تثبيت المحادثة: ${err.message || 'خطأ'}`);
    }
  };

  // Mute / Unmute chat
  const handleMuteChat = async (dialog: TelegramDialog, muted: boolean) => {
    try {
      await telegramApi.muteChat(dialog.id, muted);
      setDialogs((prev) =>
        prev.map((d) => (d.id === dialog.id ? { ...d, muted } : d))
      );
      if (selectedChat?.id === dialog.id) {
        setSelectedChat((prev) => (prev ? { ...prev, muted } : null));
      }
    } catch (err: any) {
      alert(`فشل تحديث كتم الإشعارات: ${err.message || 'خطأ'}`);
    }
  };

  // Archive / Unarchive chat
  const handleArchiveChat = async (dialog: TelegramDialog, archive: boolean) => {
    try {
      await telegramApi.toggleArchive(dialog.id, archive);
      setDialogs((prev) =>
        prev.map((d) =>
          d.id === dialog.id ? { ...d, isArchived: archive, folderId: archive ? 1 : 0 } : d
        )
      );
      if (selectedChat?.id === dialog.id) {
        setSelectedChat((prev) => (prev ? { ...prev, isArchived: archive } : null));
      }
    } catch (err: any) {
      alert(`فشل أرشفة المحادثة: ${err.message || 'خطأ'}`);
    }
  };

  // Start outgoing Call (Phone or Video)
  const handleStartCall = (chat: TelegramDialog, isVideo: boolean) => {
    const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    setActiveCall({
      callId,
      peerId: chat.id,
      peerName: chat.title || chat.name || 'مستخدم تليجرام',
      isVideo,
      isOutgoing: true,
      status: 'calling',
    });
  };

  // End Call
  const handleEndCall = () => {
    if (activeCall) {
      telegramApi.sendCallSignal({
        action: 'call_end',
        callId: activeCall.callId,
        peerId: activeCall.peerId,
      }).catch(() => {});
    }
    setActiveCall(null);
  };

  // Answer Call
  const handleAnswerCall = () => {
    setActiveCall((prev) => (prev ? { ...prev, status: 'connected' } : null));
  };

  // Leave chat / group
  const handleLeaveChat = async (dialog: TelegramDialog) => {
    try {
      await telegramApi.leaveChat(dialog.id);
      setDialogs((prev) => prev.filter((d) => d.id !== dialog.id));
      if (selectedChat?.id === dialog.id) {
        setSelectedChat(null);
        setMobileView('list');
      }
    } catch (err: any) {
      alert(`فشل مغادرة المحادثة: ${err.message || 'خطأ'}`);
    }
  };

  // Clear chat history
  const handleClearHistory = async (dialog: TelegramDialog, revoke: boolean) => {
    try {
      await telegramApi.clearChatHistory(dialog.id, revoke);
      setDialogs((prev) =>
        prev.map((d) =>
          d.id === dialog.id
            ? { ...d, lastMessage: { text: 'تم مسح السجل', date: Math.floor(Date.now() / 1000), out: true, senderId: 'me' }, unreadCount: 0 }
            : d
        )
      );
      await loadDialogs(true);
    } catch (err: any) {
      alert(`فشل مسح سجل المحادثة: ${err.message || 'خطأ'}`);
    }
  };

  if (loadingInitial) {
    return (
      <div className="h-screen w-screen bg-[#0e1621] flex flex-col items-center justify-center text-white select-none px-4">
        <div className="relative mb-6">
          <div className="w-16 h-16 rounded-full border-4 border-[#2b5278] border-t-[#54a9eb] animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-[#54a9eb] flex items-center justify-center shadow-lg">
              <span className="text-white font-black text-sm">T</span>
            </div>
          </div>
        </div>
        <h2 className="text-lg font-bold mb-2">جاري الاتصال بسحابة تليجرام</h2>
        <p className="text-xs text-slate-400 text-center max-w-sm">
          جاري مزامنة المحادثات والمجلدات عبر بروتوكول MTProto الرسمي...
        </p>

        {slowLoading && (
          <div className="mt-8 flex flex-col items-center gap-3 animate-in fade-in duration-300">
            <p className="text-[11px] text-amber-400 bg-amber-950/40 px-3 py-1.5 rounded-lg border border-amber-800/40">
              يستغرق الاتصال وقتاً أطول من المعتاد
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setLoadingInitial(false)}
                className="px-4 py-2 bg-[#2b5278] hover:bg-[#3b6a99] text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow"
              >
                تخطي والدخول الآن
              </button>
              <button
                onClick={() => {
                  indexedDbCache.clearAllCache();
                  window.location.reload();
                }}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition cursor-pointer border border-slate-700"
              >
                مسح الجلسة وإعادة المحاولة
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0e1621] text-slate-100 overflow-hidden font-['Tajawal','Plus_Jakarta_Sans',system-ui,sans-serif]" dir="rtl">
      {/* Top Header */}
      <Header
        status={status}
        user={user}
        onOpenInfo={() => setIsInfoModalOpen(true)}
        onLogout={handleLogout}
        onRefresh={() => loadDialogs(false)}
        isRefreshing={isRefreshing}
      />

      {/* Offline Status Warning Banner */}
      {isOffline && (
        <div className="bg-amber-600/90 text-white text-xs px-3 py-1 flex items-center justify-center gap-2 font-medium z-40 border-b border-amber-500/50 shadow">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>أنت في وضع عدم الاتصال - يتم عرض المحادثات والرسائل من التخزين المؤقت المحلي (IndexedDB).</span>
        </div>
      )}

      {/* Main Container */}
      {!isAuth ? (
        <AuthView onAuthSuccess={handleAuthSuccess} />
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Chat List Column (hidden on mobile if in chat view) */}
          <div className={`${mobileView === 'chat' ? 'hidden md:flex' : 'flex'} w-full md:w-auto h-full`}>
            <ChatList
              dialogs={dialogs}
              selectedChatId={selectedChat?.id || null}
              onSelectChat={handleSelectChat}
              isLoading={isRefreshing}
              typingStatuses={typingStatuses}
              folders={folders}
              onOpenFolderManager={() => setIsFolderManagerOpen(true)}
              onOpenNewChat={() => setIsNewChatOpen(true)}
              onPinChat={handlePinChat}
              onMuteChat={handleMuteChat}
              onArchiveChat={handleArchiveChat}
              onClearHistory={handleClearHistory}
              onLeaveChat={handleLeaveChat}
            />
          </div>

          {/* Chat Conversation Column (hidden on mobile if in list view) */}
          <div className={`${mobileView === 'list' ? 'hidden md:flex' : 'flex'} flex-1 h-full`}>
            <ChatView
              chat={selectedChat}
              onBackMobile={() => setMobileView('list')}
              onMessageSent={() => loadDialogs(true)}
              onPinChat={handlePinChat}
              onMuteChat={handleMuteChat}
              onArchiveChat={handleArchiveChat}
              onStartCall={handleStartCall}
              onOpenVoiceChat={(chat) =>
                setActiveVoiceChat({
                  chatId: chat.id,
                  title: chat.title || chat.name || 'محادثة صوتية',
                  isChannel: !!chat.isChannel,
                })
              }
              onClearHistory={handleClearHistory}
              onLeaveChat={handleLeaveChat}
            />
          </div>
        </div>
      )}

      {/* Official MTProto Information Modal */}
      <OfficialInfoModal
        isOpen={isInfoModalOpen}
        onClose={() => setIsInfoModalOpen(false)}
        status={status}
        user={user}
      />

      {/* Folders Manager Modal */}
      {isFolderManagerOpen && (
        <FolderManagerModal
          folders={folders}
          onFoldersChanged={loadFolders}
          onClose={() => setIsFolderManagerOpen(false)}
        />
      )}

      {/* New Group / Channel / Private Chat Modal */}
      {isNewChatOpen && (
        <NewChatModal
          onClose={() => setIsNewChatOpen(false)}
          onChatCreated={(newChat) => {
            setDialogs((prev) => [newChat, ...prev.filter((d) => d.id !== newChat.id)]);
            handleSelectChat(newChat);
          }}
        />
      )}

      {/* WebRTC Video & Audio Call Modal */}
      {activeCall && (
        <CallModal
          call={activeCall}
          onEndCall={handleEndCall}
          onAnswerCall={handleAnswerCall}
        />
      )}

      {/* Voice Chat Space & Live Stream Modal */}
      {activeVoiceChat && (
        <VoiceChatModal
          chatId={activeVoiceChat.chatId}
          chatTitle={activeVoiceChat.title}
          isChannel={activeVoiceChat.isChannel}
          onClose={() => setActiveVoiceChat(null)}
        />
      )}
    </div>
  );
}
