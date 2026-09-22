import React from 'react';
import { Send, LogOut, Info, RefreshCw, Users, Settings } from 'lucide-react';
import { TelegramServerStatus, TelegramUser } from '../types';

interface HeaderProps {
  status: TelegramServerStatus | null;
  user: TelegramUser | null;
  onOpenInfo: () => void;
  onOpenContacts: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  user,
  onOpenInfo,
  onOpenContacts,
  onOpenSettings,
  onLogout,
  onRefresh,
  isRefreshing,
}) => {
  return (
    <header className="h-16 bg-[#17212b] border-b border-[#242f3d] px-4 flex items-center justify-between select-none z-10 shrink-0">
      {/* Brand & Connection Badge */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#2b5278] flex items-center justify-center text-white shadow-md">
          <Send className="w-5 h-5 -rotate-45 ml-0.5 text-[#54a9eb]" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-white tracking-wide">Telegram Web</h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#24374a] text-[#54a9eb] font-mono border border-[#2b5278]/40">
              API: 22043994
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] text-emerald-400 font-medium">سحابة تليجرام الرسمية متصلة</span>
            <span className="text-slate-500 text-[10px] hidden sm:inline">• DC2 MTProto L198</span>
          </div>
        </div>
      </div>

      {/* Actions & User */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Sync / Refresh */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          title="تحديث ومزامنة المحادثات"
          className="p-2 text-slate-300 hover:text-white hover:bg-[#242f3d] rounded-lg transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#54a9eb]' : ''}`} />
        </button>

        {/* Contacts Book Button */}
        {user && (
          <button
            onClick={onOpenContacts}
            title="جهات الاتصال"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-[#242f3d] hover:bg-[#2c3848] text-slate-200 rounded-lg transition-colors border border-slate-700/50 cursor-pointer"
          >
            <Users className="w-3.5 h-3.5 text-[#54a9eb]" />
            <span className="hidden md:inline">جهات الاتصال</span>
          </button>
        )}

        {/* Settings & Profile Button */}
        {user && (
          <button
            onClick={onOpenSettings}
            title="الإعدادات والملف الشخصي والأمان"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-[#242f3d] hover:bg-[#2c3848] text-slate-200 rounded-lg transition-colors border border-slate-700/50 cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5 text-[#54a9eb]" />
            <span className="hidden md:inline">الإعدادات</span>
          </button>
        )}

        {/* Official MTProto Info */}
        <button
          onClick={onOpenInfo}
          title="معلومات الاتصال الرسمي و MTProto"
          className="p-2 sm:px-2.5 sm:py-1.5 text-xs bg-[#242f3d] hover:bg-[#2c3848] text-slate-200 rounded-lg transition-colors border border-slate-700/50 cursor-pointer flex items-center gap-1"
        >
          <Info className="w-3.5 h-3.5 text-[#54a9eb]" />
          <span className="hidden xl:inline">تفاصيل الاتصال</span>
        </button>

        {user && (
          <div className="flex items-center gap-2 pl-1 border-r border-[#242f3d] pr-2">
            <div
              onClick={onOpenSettings}
              className="w-8 h-8 rounded-full bg-[#5288c1] hover:ring-2 hover:ring-[#54a9eb] flex items-center justify-center text-white text-xs font-bold uppercase shadow-inner cursor-pointer transition-all"
              title="تعديل الملف الشخصي"
            >
              {user.firstName ? user.firstName.charAt(0) : 'U'}
            </div>
            <div
              onClick={onOpenSettings}
              className="hidden lg:block text-right cursor-pointer group"
              title="تعديل الملف الشخصي"
            >
              <div className="text-xs font-semibold text-slate-200 leading-tight group-hover:text-[#54a9eb] transition-colors">
                {user.firstName} {user.lastName}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                {user.username ? `@${user.username}` : user.phone || 'حساب رسمي'}
              </div>
            </div>
            <button
              onClick={onLogout}
              title="تسجيل الخروج من الجلسة"
              className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer mr-1"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
