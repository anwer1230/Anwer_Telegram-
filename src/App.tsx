import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { AuthView } from './components/AuthView';
import { ChatList } from './components/ChatList';
import { ChatView } from './components/ChatView';
import { OfficialInfoModal } from './components/OfficialInfoModal';
import { TelegramDialog, TelegramServerStatus, TelegramUser } from './types';
import { telegramApi } from './api/telegramApi';

export default function App() {
  const [status, setStatus] = useState<TelegramServerStatus | null>(null);
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [dialogs, setDialogs] = useState<TelegramDialog[]>([]);
  const [selectedChat, setSelectedChat] = useState<TelegramDialog | null>(null);
  const [isAuth, setIsAuth] = useState<boolean>(false);
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [slowLoading, setSlowLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState<boolean>(false);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  const selectedChatIdRef = React.useRef<string | undefined>(selectedChat?.id);
  selectedChatIdRef.current = selectedChat?.id;

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

  // Load Dialogs from Telegram Cloud (stable callback with functional state update)
  const loadDialogs = useCallback(async (quiet = false, retry = true) => {
    if (!quiet) setIsRefreshing(true);
    try {
      const chatList = await telegramApi.getDialogs(40);
      setDialogs(chatList);
      // Update selected chat reference if active without re-triggering callback
      setSelectedChat((prev) => {
        if (!prev) return null;
        const updated = chatList.find((d) => d.id === prev.id);
        return updated || prev;
      });
    } catch (err: any) {
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
          console.warn('Telegram status check warning:', err);
          return null;
        });

        if (isMounted && serverStatus) {
          setStatus(serverStatus);
        }

        const hasSession = !!telegramApi.getSession();
        if (hasSession) {
          try {
            const currentUser = await telegramApi.getMe();
            if (isMounted) {
              setUser(currentUser);
              setIsAuth(true);
              await loadDialogs(true);
            }
          } catch (sessionErr) {
            console.warn('Session expired or unauthorized, clearing stored session:', sessionErr);
            telegramApi.clearSession();
            if (isMounted) {
              setIsAuth(false);
              setUser(null);
            }
          }
        } else {
          if (isMounted) {
            setIsAuth(false);
          }
        }
      } catch (err) {
        console.error('App initialization error:', err);
      } finally {
        clearTimeout(watchdogTimer);
        if (isMounted) {
          setLoadingInitial(false);
        }
      }
    };

    initApp();

    return () => {
      isMounted = false;
      clearTimeout(watchdogTimer);
    };
  }, [loadDialogs]);

  // Periodic Cloud Sync every 45 seconds as a fallback
  useEffect(() => {
    if (!isAuth) return;
    const syncInterval = setInterval(() => {
      loadDialogs(true);
    }, 45000);
    return () => clearInterval(syncInterval);
  }, [isAuth, loadDialogs]);

  // Real-time live events subscription for instant dialogs list updates
  useEffect(() => {
    if (!isAuth) return;

    const unsubscribe = telegramApi.subscribeToEvents({
      onNewMessage: (data) => {
        setDialogs((prev) => {
          const cleanDataChatId = data.chatId.replace(/^-100/, '').replace(/^-/, '');
          const matchIdx = prev.findIndex((d) => {
            const cleanDId = d.id.replace(/^-100/, '').replace(/^-/, '');
            return d.id === data.chatId || cleanDId === cleanDataChatId;
          });

          if (matchIdx !== -1) {
            const existing = prev[matchIdx];
            const updatedDialog: TelegramDialog = {
              ...existing,
              lastMessage: {
                text: data.message.text || (data.message.mediaType ? 'مرفق وسائط' : ''),
                date: data.message.date,
                out: data.message.out,
                senderId: data.message.senderId,
              },
              date: data.message.date,
              unreadCount:
                !data.message.out && selectedChatIdRef.current !== existing.id
                  ? (existing.unreadCount || 0) + 1
                  : existing.unreadCount,
            };
            const copy = [...prev];
            copy.splice(matchIdx, 1);
            return [updatedDialog, ...copy];
          }

          // If conversation isn't in current list, load dialogs to include it
          loadDialogs(true);
          return prev;
        });
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
        <div className="w-12 h-12 border-3 border-[#54a9eb] border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-base font-semibold text-slate-200">جاري الاتصال بسحابة تليجرام الرسمية...</p>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-slate-400 font-mono bg-slate-800/80 px-2.5 py-1 rounded border border-slate-700/60">
            MTProto Layer 198 (API: 22043994)
          </span>
          <span className="text-xs text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            سيرفر رسمي (DC2)
          </span>
        </div>

        {slowLoading && (
          <div className="mt-6 flex flex-col items-center gap-3 animate-fade-in max-w-sm text-center">
            <p className="text-xs text-slate-400">
              يستغرق التحقق وقتاً إضافياً بسبب سرعة استجابة الشبكة مع سحابة تليجرام
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLoadingInitial(false)}
                className="px-4 py-2 bg-[#2b5278] hover:bg-[#33618f] text-white rounded-lg text-xs font-medium transition cursor-pointer shadow-md"
              >
                المتابعة إلى تسجيل الدخول
              </button>
              <button
                type="button"
                onClick={() => {
                  telegramApi.clearSession();
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
              onPinChat={handlePinChat}
              onMuteChat={handleMuteChat}
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
    </div>
  );
}
