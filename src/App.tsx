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
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState<boolean>(false);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  // Load Dialogs from Telegram Cloud
  const loadDialogs = useCallback(async (quiet = false) => {
    if (!quiet) setIsRefreshing(true);
    try {
      const chatList = await telegramApi.getDialogs(50);
      setDialogs(chatList);
      // Update selected chat reference if active
      if (selectedChat) {
        const updated = chatList.find((d) => d.id === selectedChat.id);
        if (updated) setSelectedChat(updated);
      }
    } catch (err) {
      console.error('Failed to load dialogs from Telegram:', err);
    } finally {
      if (!quiet) setIsRefreshing(false);
    }
  }, [selectedChat]);

  // Initial Check
  const checkAuthAndInit = useCallback(async () => {
    setLoadingInitial(true);
    try {
      const serverStatus = await telegramApi.getStatus();
      setStatus(serverStatus);

      const hasSession = !!telegramApi.getSession();
      if (hasSession) {
        try {
          const currentUser = await telegramApi.getMe();
          setUser(currentUser);
          setIsAuth(true);
          await loadDialogs(true);
        } catch (err) {
          console.warn('Session expired or unauthorized:', err);
          telegramApi.clearSession();
          setIsAuth(false);
          setUser(null);
        }
      } else {
        setIsAuth(false);
      }
    } catch (err) {
      console.error('Failed to get status:', err);
    } finally {
      setLoadingInitial(false);
    }
  }, [loadDialogs]);

  useEffect(() => {
    checkAuthAndInit();
  }, [checkAuthAndInit]);

  // Periodic Cloud Sync every 15 seconds
  useEffect(() => {
    if (!isAuth) return;
    const syncInterval = setInterval(() => {
      loadDialogs(true);
    }, 15000);
    return () => clearInterval(syncInterval);
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

  if (loadingInitial) {
    return (
      <div className="h-screen w-screen bg-[#0e1621] flex flex-col items-center justify-center text-white select-none">
        <div className="w-12 h-12 border-3 border-[#54a9eb] border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-medium text-slate-300">جاري الاتصال بسحابة تليجرام الرسمية...</p>
        <span className="text-xs text-slate-500 mt-1 font-mono">MTProto API: 22043994</span>
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
            />
          </div>

          {/* Chat Conversation Column (hidden on mobile if in list view) */}
          <div className={`${mobileView === 'list' ? 'hidden md:flex' : 'flex'} flex-1 h-full`}>
            <ChatView
              chat={selectedChat}
              onBackMobile={() => setMobileView('list')}
              onMessageSent={() => loadDialogs(true)}
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
