import React, { useState } from 'react';
import {
  Users,
  Radio,
  UserPlus,
  X,
  Check,
  Loader2,
  Search,
  AlertCircle,
  Hash,
} from 'lucide-react';
import { TelegramDialog } from '../types';
import { telegramApi } from '../api/telegramApi';

interface NewChatModalProps {
  onClose: () => void;
  onChatCreated: (chat: TelegramDialog) => void;
}

type TabType = 'group' | 'channel' | 'private';

export const NewChatModal: React.FC<NewChatModalProps> = ({
  onClose,
  onChatCreated,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('group');

  // Form states
  const [title, setTitle] = useState('');
  const [about, setAbout] = useState('');
  const [membersInput, setMembersInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group creation
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const usernames = membersInput
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await telegramApi.createGroup(title.trim(), usernames, about.trim());
      const newDialog: TelegramDialog = {
        id: res.chatId,
        title: res.title,
        isGroup: true,
        isChannel: false,
        isUser: false,
        unreadCount: 0,
        date: Math.floor(Date.now() / 1000),
      };
      onChatCreated(newDialog);
      onClose();
    } catch (err: any) {
      setError(err.message || 'فشل إنشاء المجموعة');
    } finally {
      setLoading(false);
    }
  };

  // Channel creation
  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const res = await telegramApi.createChannel(title.trim(), about.trim());
      const newDialog: TelegramDialog = {
        id: res.chatId,
        title: res.title,
        isGroup: false,
        isChannel: true,
        isUser: false,
        unreadCount: 0,
        date: Math.floor(Date.now() / 1000),
      };
      onChatCreated(newDialog);
      onClose();
    } catch (err: any) {
      setError(err.message || 'فشل إنشاء القناة');
    } finally {
      setLoading(false);
    }
  };

  // Start private chat via @username resolution
  const handleStartPrivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const res = await telegramApi.resolveContact(usernameInput.trim());
      const newDialog: TelegramDialog = {
        id: res.id,
        title: res.title,
        isUser: res.isUser,
        isGroup: res.isGroup,
        isChannel: res.isChannel,
        unreadCount: 0,
        date: Math.floor(Date.now() / 1000),
        entity: {
          username: res.username,
          phone: res.phone,
        },
      };
      onChatCreated(newDialog);
      onClose();
    } catch (err: any) {
      setError(err.message || 'تعذر العثور على المستخدم في سحابة تليجرام');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#17212b] border border-[#2b5278]/40 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-[#242f3d] flex items-center justify-between">
          <h3 className="text-base font-bold text-white">محادثة جديدة</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#242f3d] bg-[#1e2a38]/40 px-2 pt-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('group');
              setError(null);
            }}
            className={`flex-1 pb-3 text-xs font-bold transition flex items-center justify-center gap-1.5 border-b-2 cursor-pointer ${
              activeTab === 'group'
                ? 'border-[#54a9eb] text-[#54a9eb]'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>مجموعة جديدة</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('channel');
              setError(null);
            }}
            className={`flex-1 pb-3 text-xs font-bold transition flex items-center justify-center gap-1.5 border-b-2 cursor-pointer ${
              activeTab === 'channel'
                ? 'border-[#54a9eb] text-[#54a9eb]'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>قناة جديدة</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('private');
              setError(null);
            }}
            className={`flex-1 pb-3 text-xs font-bold transition flex items-center justify-center gap-1.5 border-b-2 cursor-pointer ${
              activeTab === 'private'
                ? 'border-[#54a9eb] text-[#54a9eb]'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>محادثة خاصة</span>
          </button>
        </div>

        {/* Body Form */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {activeTab === 'group' && (
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  اسم المجموعة
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: فريق العمل، العائلة..."
                  className="w-full bg-[#242f3d] border border-[#2b5278]/40 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#54a9eb]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  وصف المجموعة (اختياري)
                </label>
                <textarea
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                  placeholder="نبذة عن موضوع ونشاط المجموعة..."
                  rows={2}
                  className="w-full bg-[#242f3d] border border-[#2b5278]/40 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#54a9eb] resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  إضافة أعضاء (اختياري)
                </label>
                <input
                  type="text"
                  value={membersInput}
                  onChange={(e) => setMembersInput(e.target.value)}
                  placeholder="اكتب المعرفات مثل: @user1, @user2"
                  className="w-full bg-[#242f3d] border border-[#2b5278]/40 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#54a9eb]"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  افصل بين المعرفات بمسافة أو فاصلة
                </span>
              </div>

              <button
                type="submit"
                disabled={loading || !title.trim()}
                className="w-full py-3 rounded-xl bg-[#54a9eb] hover:bg-[#4397d9] text-white font-bold text-xs shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>إنشاء المجموعة الآن</span>
              </button>
            </form>
          )}

          {activeTab === 'channel' && (
            <form onSubmit={handleCreateChannel} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  اسم القناة
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: أخبار التقنية، التحديثات..."
                  className="w-full bg-[#242f3d] border border-[#2b5278]/40 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#54a9eb]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  وصف القناة
                </label>
                <textarea
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                  placeholder="نبذة عن محتوى ومنشورات القناة..."
                  rows={3}
                  className="w-full bg-[#242f3d] border border-[#2b5278]/40 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#54a9eb] resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !title.trim()}
                className="w-full py-3 rounded-xl bg-[#54a9eb] hover:bg-[#4397d9] text-white font-bold text-xs shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>إنشاء القناة الرسمية</span>
              </button>
            </form>
          )}

          {activeTab === 'private' && (
            <form onSubmit={handleStartPrivate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  اسم المستخدم أو المعرف في تليجرام
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="مثال: durov أو @username"
                    className="w-full bg-[#242f3d] border border-[#2b5278]/40 rounded-xl pl-4 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#54a9eb]"
                    required
                  />
                  <div className="absolute right-3.5 top-3 text-slate-400">
                    <Search className="w-4 h-4" />
                  </div>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  سيتم البحث في قاعدة بيانات سحابة تليجرام وبدء المحادثة فوراً
                </span>
              </div>

              <button
                type="submit"
                disabled={loading || !usernameInput.trim()}
                className="w-full py-3 rounded-xl bg-[#54a9eb] hover:bg-[#4397d9] text-white font-bold text-xs shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>البحث وبدء المحادثة</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
