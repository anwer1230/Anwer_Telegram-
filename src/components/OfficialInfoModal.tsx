import React, { useState } from 'react';
import { X, ShieldCheck, Check, Copy, Server, Radio, Key, Hash, Cpu } from 'lucide-react';
import { TelegramServerStatus, TelegramUser } from '../types';
import { telegramApi } from '../api/telegramApi';

interface OfficialInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: TelegramServerStatus | null;
  user: TelegramUser | null;
}

export const OfficialInfoModal: React.FC<OfficialInfoModalProps> = ({
  isOpen,
  onClose,
  status,
  user,
}) => {
  const [copiedSession, setCopiedSession] = useState(false);

  if (!isOpen) return null;

  const session = telegramApi.getSession();

  const handleCopySession = () => {
    if (session) {
      navigator.clipboard.writeText(session);
      setCopiedSession(true);
      setTimeout(() => setCopiedSession(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm select-none">
      <div className="w-full max-w-lg bg-[#17212b] border border-[#242f3d] rounded-2xl p-6 shadow-2xl relative text-right animate-in fade-in zoom-in-95">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-[#242f3d] transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">معلومات الاتصال الرسمي بسحابة تليجرام</h3>
            <p className="text-xs text-slate-400">بروتوكول MTProto الرسمي معتمد بالكامل</p>
          </div>
        </div>

        {/* Credentials Grid */}
        <div className="space-y-3 mb-6">
          <div className="p-3 bg-[#0e1621] border border-[#242f3d] rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-[#54a9eb]" />
              <span className="text-xs text-slate-300 font-medium">معرف التطبيق (TELEGRAM_API_ID)</span>
            </div>
            <span className="font-mono text-xs font-bold text-white bg-[#17212b] px-2.5 py-1 rounded border border-slate-700">
              22043994
            </span>
          </div>

          <div className="p-3 bg-[#0e1621] border border-[#242f3d] rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-[#54a9eb]" />
              <span className="text-xs text-slate-300 font-medium">مفتاح التطبيق (TELEGRAM_API_HASH)</span>
            </div>
            <span className="font-mono text-xs font-bold text-white bg-[#17212b] px-2.5 py-1 rounded border border-slate-700">
              56f64582b363d367280db96586b97801
            </span>
          </div>

          <div className="p-3 bg-[#0e1621] border border-[#242f3d] rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-slate-300 font-medium">مركز بيانات تليجرام (Connected DC)</span>
            </div>
            <span className="font-mono text-xs text-emerald-400 font-semibold">
              {status?.connectedDc || '149.154.167.91 (DC2 Europe)'}
            </span>
          </div>

          <div className="p-3 bg-[#0e1621] border border-[#242f3d] rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span className="text-xs text-slate-300 font-medium">طبقة بروتوكول MTProto Layer</span>
            </div>
            <span className="font-mono text-xs text-cyan-400 font-semibold">
              Layer {status?.mtprotoLayer || 198} (Official)
            </span>
          </div>
        </div>

        {/* User Info if authorized */}
        {user && (
          <div className="p-3.5 bg-[#1e2c3a] border border-[#2c3e50] rounded-xl mb-6">
            <div className="text-xs font-semibold text-slate-200 mb-2 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              <span>الحساب المصرح به حالياً في السحابة:</span>
            </div>
            <div className="text-xs text-slate-300 space-y-1">
              <div>
                الاسم: <span className="text-white font-medium">{user.firstName} {user.lastName}</span>
              </div>
              <div>
                معرف تليجرام: <span className="text-[#54a9eb] font-mono">{user.id}</span>
              </div>
              {user.phone && (
                <div>
                  الهاتف: <span className="text-slate-400 font-mono" dir="ltr">{user.phone}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Session String Backup */}
        {session && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-slate-300">نسخ الجلسة المشفرة (Session String)</span>
              <button
                onClick={handleCopySession}
                className="flex items-center gap-1 text-xs text-[#54a9eb] hover:text-[#7bbdf0] cursor-pointer"
              >
                {copiedSession ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">تم النسخ!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>نسخ الجلسة</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              يمكنك الاحتفاظ بنص الجلسة لتسجيل الدخول فوراً في أي وقت دون طلب كود جديد.
            </p>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-2.5 bg-[#2b5278] hover:bg-[#356391] text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
        >
          إغلاق
        </button>
      </div>
    </div>
  );
};
