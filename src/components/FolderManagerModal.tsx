import React, { useState } from 'react';
import {
  Folder,
  X,
  Plus,
  Trash2,
  Check,
  Smile,
  Shield,
  Users,
  MessageSquare,
  Bot,
  VolumeX,
  CheckCheck,
  Archive,
  Loader2,
} from 'lucide-react';
import { ChatFolder } from '../types';
import { telegramApi } from '../api/telegramApi';

interface FolderManagerModalProps {
  folders: ChatFolder[];
  onFoldersChanged: () => void;
  onClose: () => void;
}

const COMMON_EMOJIS = ['📁', '💼', '⭐', '🔥', '👥', '📢', '💬', '🤖', '📚', '🎯', '🚀', '⚡'];

export const FolderManagerModal: React.FC<FolderManagerModalProps> = ({
  folders,
  onFoldersChanged,
  onClose,
}) => {
  const [selectedFolder, setSelectedFolder] = useState<Partial<ChatFolder> | null>(null);
  const [title, setTitle] = useState('');
  const [emoticon, setEmoticon] = useState('📁');
  const [contacts, setContacts] = useState(true);
  const [nonContacts, setNonContacts] = useState(true);
  const [groups, setGroups] = useState(true);
  const [broadcasts, setBroadcasts] = useState(true);
  const [bots, setBots] = useState(false);
  const [excludeMuted, setExcludeMuted] = useState(false);
  const [excludeRead, setExcludeRead] = useState(false);
  const [excludeArchived, setExcludeArchived] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startNewFolder = () => {
    setSelectedFolder({});
    setTitle('');
    setEmoticon('📁');
    setContacts(true);
    setNonContacts(true);
    setGroups(true);
    setBroadcasts(true);
    setBots(false);
    setExcludeMuted(false);
    setExcludeRead(false);
    setExcludeArchived(true);
    setError(null);
  };

  const editFolder = (f: ChatFolder) => {
    setSelectedFolder(f);
    setTitle(f.title);
    setEmoticon(f.emoticon || '📁');
    setContacts(!!f.contacts);
    setNonContacts(!!f.nonContacts);
    setGroups(!!f.groups);
    setBroadcasts(!!f.broadcasts);
    setBots(!!f.bots);
    setExcludeMuted(!!f.excludeMuted);
    setExcludeRead(!!f.excludeRead);
    setExcludeArchived(f.excludeArchived !== false);
    setError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('يرجى إدخال اسم المجلد');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await telegramApi.saveFolder({
        id: selectedFolder?.id,
        title: title.trim(),
        emoticon,
        contacts,
        nonContacts,
        groups,
        broadcasts,
        bots,
        excludeMuted,
        excludeRead,
        excludeArchived,
      });
      onFoldersChanged();
      setSelectedFolder(null);
    } catch (err: any) {
      setError(err.message || 'فشل حفظ المجلد في سحابة تليجرام');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (folderId: number | string) => {
    if (!confirm('هل أنت متأكد من حذف هذا المجلد؟ لن يتم حذف أي رسائل أو محادثات.')) {
      return;
    }
    setDeletingId(folderId);
    try {
      await telegramApi.deleteFolder(folderId);
      onFoldersChanged();
      if (selectedFolder?.id === folderId) {
        setSelectedFolder(null);
      }
    } catch (err: any) {
      alert(err.message || 'فشل حذف المجلد');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#17212b] border border-[#2b5278]/40 rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[88vh]">
        {/* Header */}
        <div className="p-5 border-b border-[#242f3d] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#54a9eb]/15 flex items-center justify-center text-[#54a9eb]">
              <Folder className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">مجلدات المحادثات</h3>
              <p className="text-xs text-slate-400">تنظيم المحادثات وتبويبها عبر سحابة تليجرام</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-medium">
              {error}
            </div>
          )}

          {selectedFolder ? (
            /* Edit / Create Form */
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[#242f3d]">
                <h4 className="text-sm font-bold text-white">
                  {selectedFolder.id ? 'تعديل المجلد' : 'مجلد جديد'}
                </h4>
                <button
                  type="button"
                  onClick={() => setSelectedFolder(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  إلغاء
                </button>
              </div>

              {/* Title & Emoji */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  اسم المجلد
                </label>
                <div className="flex gap-2">
                  <div className="relative">
                    <button
                      type="button"
                      className="w-11 h-11 rounded-xl bg-[#242f3d] border border-[#2b5278]/40 flex items-center justify-center text-lg"
                    >
                      {emoticon}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="مثال: العمل، الأصدقاء، قنواتي..."
                    className="flex-1 bg-[#242f3d] border border-[#2b5278]/40 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#54a9eb]"
                    maxLength={32}
                    required
                  />
                </div>

                {/* Common Emoji picker */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {COMMON_EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setEmoticon(e)}
                      className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center transition ${
                        emoticon === e ? 'bg-[#54a9eb]/30 border border-[#54a9eb]' : 'bg-[#242f3d] hover:bg-white/10'
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              {/* Included Chat Types */}
              <div className="pt-2">
                <span className="block text-xs font-bold text-slate-300 mb-2">المحادثات المضمنة</span>
                <div className="space-y-2 bg-[#1e2a38]/60 p-3 rounded-2xl border border-[#2b5278]/20">
                  <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                    <span className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-emerald-400" />
                      <span>جهات الاتصال (شخصي)</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={contacts}
                      onChange={(e) => setContacts(e.target.checked)}
                      className="w-4 h-4 rounded text-[#54a9eb] focus:ring-0 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                    <span className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-blue-400" />
                      <span>غير جهات الاتصال</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={nonContacts}
                      onChange={(e) => setNonContacts(e.target.checked)}
                      className="w-4 h-4 rounded text-[#54a9eb] focus:ring-0 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                    <span className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-purple-400" />
                      <span>المجموعات (Groups)</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={groups}
                      onChange={(e) => setGroups(e.target.checked)}
                      className="w-4 h-4 rounded text-[#54a9eb] focus:ring-0 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                    <span className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-amber-400" />
                      <span>القنوات الرسمية (Channels)</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={broadcasts}
                      onChange={(e) => setBroadcasts(e.target.checked)}
                      className="w-4 h-4 rounded text-[#54a9eb] focus:ring-0 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                    <span className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-cyan-400" />
                      <span>البوتات (Bots)</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={bots}
                      onChange={(e) => setBots(e.target.checked)}
                      className="w-4 h-4 rounded text-[#54a9eb] focus:ring-0 cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Exclusions */}
              <div className="pt-2">
                <span className="block text-xs font-bold text-slate-300 mb-2">استبعاد من المجلد</span>
                <div className="space-y-2 bg-[#1e2a38]/60 p-3 rounded-2xl border border-[#2b5278]/20">
                  <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                    <span className="flex items-center gap-2">
                      <VolumeX className="w-4 h-4 text-slate-400" />
                      <span>استبعاد المكتومة (Muted)</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={excludeMuted}
                      onChange={(e) => setExcludeMuted(e.target.checked)}
                      className="w-4 h-4 rounded text-[#54a9eb] focus:ring-0 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                    <span className="flex items-center gap-2">
                      <CheckCheck className="w-4 h-4 text-slate-400" />
                      <span>استبعاد المقروءة (Read)</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={excludeRead}
                      onChange={(e) => setExcludeRead(e.target.checked)}
                      className="w-4 h-4 rounded text-[#54a9eb] focus:ring-0 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between text-xs text-slate-200 cursor-pointer">
                    <span className="flex items-center gap-2">
                      <Archive className="w-4 h-4 text-slate-400" />
                      <span>استبعاد المؤرشفة (Archived)</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={excludeArchived}
                      onChange={(e) => setExcludeArchived(e.target.checked)}
                      className="w-4 h-4 rounded text-[#54a9eb] focus:ring-0 cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl bg-[#54a9eb] hover:bg-[#4397d9] text-white font-bold text-xs shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>{selectedFolder.id ? 'حفظ التعديلات' : 'إنشاء المجلد'}</span>
                </button>
              </div>
            </form>
          ) : (
            /* Folder List */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">مجلداتك الحالية ({folders.length})</span>
                <button
                  onClick={startNewFolder}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#54a9eb] hover:bg-[#4397d9] text-white text-xs font-bold transition shadow cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>إنشاء مجلد جديد</span>
                </button>
              </div>

              {folders.length === 0 ? (
                <div className="text-center py-8 bg-[#1e2a38]/40 rounded-2xl border border-dashed border-[#2b5278]/30 p-6">
                  <Folder className="w-10 h-10 text-slate-500 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-300">لا توجد مجلدات مخصصة بعد</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                    يمكنك إنشاء مجلدات لتصنيف محادثاتك مثل العمل، القنوات، الأصدقاء.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {folders.map((f) => (
                    <div
                      key={f.id}
                      className="p-3.5 rounded-2xl bg-[#1e2a38]/60 border border-[#2b5278]/20 hover:border-[#2b5278]/40 flex items-center justify-between group transition"
                    >
                      <div
                        onClick={() => editFolder(f)}
                        className="flex items-center gap-3 cursor-pointer flex-1"
                      >
                        <div className="w-9 h-9 rounded-xl bg-[#242f3d] flex items-center justify-center text-base">
                          {f.emoticon || '📁'}
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-white group-hover:text-[#54a9eb] transition">
                            {f.title}
                          </h4>
                          <span className="text-[10px] text-slate-400">
                            {[
                              f.groups && 'مجموعات',
                              f.broadcasts && 'قنوات',
                              f.contacts && 'شخصي',
                              f.bots && 'بوتات',
                            ]
                              .filter(Boolean)
                              .join(' • ') || 'تخصيص يدوي'}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleDelete(f.id)}
                        disabled={deletingId === f.id}
                        className="p-2 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition cursor-pointer"
                        title="حذف المجلد"
                      >
                        {deletingId === f.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
