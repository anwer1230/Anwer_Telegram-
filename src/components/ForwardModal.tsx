import React, { useState, useMemo } from 'react';
import { X, Search, Check, Send, User, Users, Radio, ShieldAlert, VolumeX, Loader2 } from 'lucide-react';
import { TelegramDialog } from '../types';
import { telegramApi } from '../api/telegramApi';

interface ForwardModalProps {
  isOpen?: boolean;
  dialogs: TelegramDialog[];
  fromPeerId: string;
  messageIds: number[];
  onClose: () => void;
  onForwardSuccess?: () => void;
  onForwardComplete?: () => void;
}

export const ForwardModal: React.FC<ForwardModalProps> = ({
  isOpen = true,
  dialogs,
  fromPeerId,
  messageIds,
  onClose,
  onForwardSuccess,
  onForwardComplete,
}) => {
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dropAuthor, setDropAuthor] = useState(false);
  const [silent, setSilent] = useState(false);
  const [forwarding, setForwarding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isOpen === false) return null;

  const filteredDialogs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return dialogs;
    return dialogs.filter((d) => {
      const title = (d.title || d.name || '').toLowerCase();
      const user = (d.entity?.username || '').toLowerCase();
      return title.includes(term) || user.includes(term);
    });
  }, [dialogs, searchTerm]);

  const handleForward = async () => {
    if (!selectedPeerId) {
      setError('يرجى اختيار المحادثة المراد التوجيه إليها');
      return;
    }

    setForwarding(true);
    setError(null);
    try {
      await telegramApi.forwardMessages(
        selectedPeerId,
        fromPeerId,
        messageIds,
        dropAuthor,
        silent
      );
      onForwardSuccess?.();
      onForwardComplete?.();
      onClose();
    } catch (err: any) {
      setError(err.message || 'فشل إعادة توجيه الرسائل');
      setForwarding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm select-none animate-in fade-in duration-200">
      <div className="bg-[#17212b] border border-[#242f3d] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#242f3d] flex items-center justify-between bg-[#141d26]">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Send className="w-4 h-4 text-[#54a9eb] -rotate-45" />
              <span>إعادة توجيه الرسائل</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              تم تحديد {messageIds.length} {messageIds.length === 1 ? 'رسالة' : 'رسائل'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options: Drop Author & Silent */}
        <div className="px-4 py-3 bg-[#1e2c3a] border-b border-[#242f3d] flex flex-col gap-2 text-xs">
          <label className="flex items-center justify-between cursor-pointer select-none">
            <span className="flex items-center gap-2 text-slate-200">
              <ShieldAlert className="w-4 h-4 text-emerald-400" />
              <span>إخفاء اسم المرسل الأصلي (إعادة توجيه مخفية)</span>
            </span>
            <input
              type="checkbox"
              checked={dropAuthor}
              onChange={(e) => setDropAuthor(e.target.checked)}
              className="w-4 h-4 rounded text-[#54a9eb] focus:ring-0 bg-[#242f3d] border-slate-600 cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer select-none">
            <span className="flex items-center gap-2 text-slate-200">
              <VolumeX className="w-4 h-4 text-amber-400" />
              <span>إرسال بدون صوت (Silent Message)</span>
            </span>
            <input
              type="checkbox"
              checked={silent}
              onChange={(e) => setSilent(e.target.checked)}
              className="w-4 h-4 rounded text-[#54a9eb] focus:ring-0 bg-[#242f3d] border-slate-600 cursor-pointer"
            />
          </label>
        </div>

        {/* Search Chat */}
        <div className="p-3 border-b border-[#242f3d]">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              placeholder="البحث عن محادثة..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#242f3d] text-white text-xs rounded-xl pl-3 pr-9 py-2 focus:outline-none focus:ring-1 focus:ring-[#54a9eb]"
            />
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-[#242f3d]/30">
          {filteredDialogs.map((dialog) => {
            const isSelected = selectedPeerId === dialog.id;
            return (
              <div
                key={dialog.id}
                onClick={() => setSelectedPeerId(dialog.id)}
                className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors ${
                  isSelected ? 'bg-[#2b5278] text-white' : 'hover:bg-[#202b36] text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#5288c1] flex items-center justify-center text-white font-bold shrink-0 shadow">
                    {(dialog.title || dialog.name || 'C').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">
                      {dialog.title || dialog.name}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {dialog.isChannel
                        ? 'قناة تليجرام'
                        : dialog.isGroup
                        ? 'مجموعة'
                        : 'محادثة خاصة'}
                    </p>
                  </div>
                </div>

                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-[#54a9eb] border-[#54a9eb] text-white'
                      : 'border-slate-500 bg-transparent'
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Error message */}
        {error && (
          <div className="px-4 py-2 bg-rose-900/60 text-rose-200 text-xs border-t border-rose-700/50">
            {error}
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-3 border-t border-[#242f3d] bg-[#141d26] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={forwarding}
            className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            إلغاء
          </button>

          <button
            type="button"
            onClick={handleForward}
            disabled={forwarding || !selectedPeerId}
            className="px-5 py-2 rounded-xl bg-[#54a9eb] hover:bg-[#4698d8] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40 shadow cursor-pointer"
          >
            {forwarding ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>جاري التوجيه...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5 -rotate-45" />
                <span>إعادة توجيه</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
