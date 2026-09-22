import React, { useState } from 'react';
import { Send, Phone, Lock, KeyRound, CheckCircle2, AlertCircle, ArrowLeft, Shield, Terminal, Bot } from 'lucide-react';
import { AuthMode, AuthState } from '../types';
import { telegramApi } from '../api/telegramApi';

interface AuthViewProps {
  onAuthSuccess: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onAuthSuccess }) => {
  const [auth, setAuth] = useState<AuthState>({
    mode: 'phone',
    step: 'enter_phone',
    phone: '',
    phoneCodeHash: '',
    code: '',
    password: '',
    passwordHint: '',
    sessionStringInput: '',
    botTokenInput: '',
    loading: false,
    error: null,
  });

  const [countryCode, setCountryCode] = useState('+966');
  const [phoneNumberOnly, setPhoneNumberOnly] = useState('');

  // Handle Send Code to Phone
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullPhone = phoneNumberOnly.startsWith('+') ? phoneNumberOnly : `${countryCode}${phoneNumberOnly}`;
    if (!fullPhone || fullPhone.length < 8) {
      setAuth((prev) => ({ ...prev, error: 'يرجى إدخال رقم هاتف صالح بالصيغة الدولية' }));
      return;
    }

    setAuth((prev) => ({ ...prev, loading: true, error: null, phone: fullPhone }));
    try {
      const res = await telegramApi.sendCode(fullPhone);
      setAuth((prev) => ({
        ...prev,
        step: 'enter_code',
        phoneCodeHash: res.phoneCodeHash,
        loading: false,
      }));
    } catch (err: any) {
      setAuth((prev) => ({
        ...prev,
        loading: false,
        error: err.message || 'فشل إرسال كود التحقق من خوادم تليجرام',
      }));
    }
  };

  // Handle Verify Code
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.code || auth.code.length < 3) {
      setAuth((prev) => ({ ...prev, error: 'يرجى إدخال كود التحقق المستلم' }));
      return;
    }

    setAuth((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await telegramApi.signIn(auth.phone, auth.code, auth.phoneCodeHash);
      if (res.needsPassword) {
        setAuth((prev) => ({
          ...prev,
          step: 'enter_password',
          passwordHint: res.hint || '',
          loading: false,
        }));
      } else if (res.success) {
        onAuthSuccess();
      }
    } catch (err: any) {
      setAuth((prev) => ({
        ...prev,
        loading: false,
        error: err.message || 'رمز التحقق غير صحيح أو منتهي الصلاحية',
      }));
    }
  };

  // Handle 2FA Password
  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.password) {
      setAuth((prev) => ({ ...prev, error: 'يرجى إدخال كلمة سر التحقق بخطوتين' }));
      return;
    }

    setAuth((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await telegramApi.checkPassword(auth.phone, auth.password);
      if (res.success) {
        onAuthSuccess();
      }
    } catch (err: any) {
      setAuth((prev) => ({
        ...prev,
        loading: false,
        error: err.message || 'كلمة المرور غير صحيحة',
      }));
    }
  };

  // Handle Session String Import
  const handleImportSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.sessionStringInput.trim()) {
      setAuth((prev) => ({ ...prev, error: 'يرجى لصق نص الجلسة Session String' }));
      return;
    }

    setAuth((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await telegramApi.importSession(auth.sessionStringInput.trim());
      if (res.success) {
        onAuthSuccess();
      }
    } catch (err: any) {
      setAuth((prev) => ({
        ...prev,
        loading: false,
        error: err.message || 'جلسة تليجرام هذه غير صالحة أو منتهية',
      }));
    }
  };

  // Handle Bot Login
  const handleBotLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.botTokenInput.trim()) {
      setAuth((prev) => ({ ...prev, error: 'يرجى إدخال توكن البوت الرسمي' }));
      return;
    }

    setAuth((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await telegramApi.botLogin(auth.botTokenInput.trim());
      if (res.success) {
        onAuthSuccess();
      }
    } catch (err: any) {
      setAuth((prev) => ({
        ...prev,
        loading: false,
        error: err.message || 'توكن البوت غير صحيح',
      }));
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 bg-[#0e1621] relative overflow-y-auto">
      {/* Decorative background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#2b5278]/20 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md bg-[#17212b] border border-[#242f3d] rounded-2xl p-6 sm:p-8 shadow-2xl relative z-10">
        {/* Telegram Plane Logo */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#2b5278] to-[#54a9eb] flex items-center justify-center shadow-lg shadow-[#54a9eb]/20 mb-4 ring-4 ring-[#242f3d]">
            <Send className="w-10 h-10 -rotate-45 ml-1 text-white" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-wide">تسجيل الدخول إلى تليجرام</h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xs">
            اتصال حقيقي ومباشر بسحابة تليجرام الرسمية عبر بروتوكول MTProto v2.0
          </p>
        </div>

        {/* API ID & Hash Transparency Notice */}
        <div className="mb-6 p-3 bg-[#1e2c3a]/70 border border-[#2c3e50] rounded-xl text-[11px] text-slate-300">
          <div className="flex items-center gap-1.5 text-[#54a9eb] font-semibold mb-1">
            <Shield className="w-3.5 h-3.5" />
            <span>بيانات الاعتماد الرسمية المعتمدة (MTProto Official)</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-slate-400 font-mono text-[10px] mt-1.5">
            <div className="bg-[#17212b] p-1.5 rounded border border-slate-700/50">
              <span className="text-slate-500 block">API_ID:</span>
              <span className="text-white font-bold">22043994</span>
            </div>
            <div className="bg-[#17212b] p-1.5 rounded border border-slate-700/50">
              <span className="text-slate-500 block">API_HASH:</span>
              <span className="text-white font-bold truncate block">56f64582b36...</span>
            </div>
          </div>
        </div>

        {/* Mode Switcher Tabs */}
        {auth.step === 'enter_phone' && (
          <div className="flex bg-[#0e1621] p-1 rounded-xl mb-6 text-xs font-medium border border-[#242f3d]">
            <button
              onClick={() => setAuth((prev) => ({ ...prev, mode: 'phone', error: null }))}
              className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                auth.mode === 'phone'
                  ? 'bg-[#2b5278] text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Phone className="w-3.5 h-3.5" />
              <span>رقم الهاتف</span>
            </button>
            <button
              onClick={() => setAuth((prev) => ({ ...prev, mode: 'session', error: null }))}
              className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                auth.mode === 'session'
                  ? 'bg-[#2b5278] text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>رمز الجلسة</span>
            </button>
            <button
              onClick={() => setAuth((prev) => ({ ...prev, mode: 'bot', error: null }))}
              className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                auth.mode === 'bot'
                  ? 'bg-[#2b5278] text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>توكن البوت</span>
            </button>
          </div>
        )}

        {/* Error Alert */}
        {auth.error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-start gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <div className="flex-1">{auth.error}</div>
          </div>
        )}

        {/* Mode 1: Phone Login */}
        {auth.mode === 'phone' && (
          <div>
            {/* Step 1: Phone Number */}
            {auth.step === 'enter_phone' && (
              <form onSubmit={handleSendCode} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 text-right">
                    أدخل رقم هاتفك الدولي المسجل في تليجرام
                  </label>
                  <div className="flex gap-2" dir="ltr">
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="w-28 bg-[#0e1621] border border-[#242f3d] rounded-xl px-2.5 py-3 text-xs text-slate-200 focus:outline-none focus:border-[#54a9eb]"
                    >
                      <option value="+966">🇸🇦 +966</option>
                      <option value="+971">🇦🇪 +971</option>
                      <option value="+20">🇪🇬 +20</option>
                      <option value="+964">🇮🇶 +964</option>
                      <option value="+962">🇯🇴 +962</option>
                      <option value="+965">🇰🇼 +965</option>
                      <option value="+968">🇴🇲 +968</option>
                      <option value="+974">🇶🇦 +974</option>
                      <option value="+973">🇧🇭 +973</option>
                      <option value="+1">🇺🇸 +1</option>
                      <option value="+44">🇬🇧 +44</option>
                      <option value="+49">🇩🇪 +49</option>
                      <option value="+90">🇹🇷 +90</option>
                      <option value="+">مخصص (+)</option>
                    </select>
                    <input
                      type="tel"
                      placeholder="501234567"
                      value={phoneNumberOnly}
                      onChange={(e) => setPhoneNumberOnly(e.target.value)}
                      required
                      className="flex-1 bg-[#0e1621] border border-[#242f3d] rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-[#54a9eb] transition-colors"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2 text-right">
                    سيصلك كود التحقق الرسمي عبر تطبيق تليجرام على أجهزتك الأخرى أو عبر رسالة SMS.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={auth.loading}
                  className="w-full py-3 px-4 bg-gradient-to-r from-[#2b5278] to-[#54a9eb] hover:from-[#356391] hover:to-[#63b3f2] text-white font-semibold rounded-xl transition-all shadow-lg shadow-[#54a9eb]/20 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer text-sm"
                >
                  {auth.loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      جاري الاتصال بسحابة تليجرام...
                    </span>
                  ) : (
                    <span>إرسال كود التحقق</span>
                  )}
                </button>
              </form>
            )}

            {/* Step 2: Verification Code */}
            {auth.step === 'enter_code' && (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setAuth((prev) => ({ ...prev, step: 'enter_phone', error: null }))}
                    className="text-xs text-[#54a9eb] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>تغيير رقم الهاتف</span>
                  </button>
                  <span className="text-xs text-slate-400 font-mono" dir="ltr">{auth.phone}</span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 text-right">
                    أدخل كود التحقق المكون من 5 أرقام
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="12345"
                    value={auth.code}
                    onChange={(e) => setAuth((prev) => ({ ...prev, code: e.target.value }))}
                    autoFocus
                    required
                    className="w-full bg-[#0e1621] border border-[#242f3d] rounded-xl px-4 py-3 text-center text-xl font-mono tracking-widest text-white placeholder-slate-600 focus:outline-none focus:border-[#54a9eb]"
                  />
                  <p className="text-[11px] text-slate-400 mt-2 text-right">
                    تفقد إشعار تليجرام في أجهزتك المفتوحة أو رسائل SMS.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={auth.loading}
                  className="w-full py-3 px-4 bg-[#2b5278] hover:bg-[#356391] text-white font-semibold rounded-xl transition-all shadow flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer text-sm"
                >
                  {auth.loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      جاري التحقق من الرمز...
                    </span>
                  ) : (
                    <span>تأكيد وتسجيل الدخول</span>
                  )}
                </button>
              </form>
            )}

            {/* Step 3: 2FA Password */}
            {auth.step === 'enter_password' && (
              <form onSubmit={handleVerifyPassword} className="space-y-4">
                <div className="p-3 bg-[#1e2c3a] border border-[#2c3e50] rounded-xl text-xs text-slate-300 text-right">
                  <div className="flex items-center gap-1.5 text-amber-400 font-semibold mb-1">
                    <Lock className="w-4 h-4" />
                    <span>التحقق بخطوتين مطلوب (Two-Step Verification)</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">
                    حسابك محمي بكلمة مرور إضافية خاصة بالسحابة.
                  </p>
                  {auth.passwordHint && (
                    <div className="mt-2 text-[11px] text-[#54a9eb] bg-[#17212b] p-1.5 rounded">
                      تلميح كلمة المرور: {auth.passwordHint}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5 text-right">
                    كلمة المرور
                  </label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={auth.password}
                    onChange={(e) => setAuth((prev) => ({ ...prev, password: e.target.value }))}
                    autoFocus
                    required
                    className="w-full bg-[#0e1621] border border-[#242f3d] rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#54a9eb]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={auth.loading}
                  className="w-full py-3 px-4 bg-[#2b5278] hover:bg-[#356391] text-white font-semibold rounded-xl transition-all shadow flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer text-sm"
                >
                  {auth.loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      جاري التحقق من كلمة المرور...
                    </span>
                  ) : (
                    <span>تأكيد والدخول للمحادثات</span>
                  )}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Mode 2: Session String Import */}
        {auth.mode === 'session' && (
          <form onSubmit={handleImportSession} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 text-right">
                ألصق نص الجلسة (Telegram Session String)
              </label>
              <textarea
                rows={4}
                placeholder="1BJWap1wBu8... (نص الجلسة المصرح بها)"
                value={auth.sessionStringInput}
                onChange={(e) => setAuth((prev) => ({ ...prev, sessionStringInput: e.target.value }))}
                required
                className="w-full bg-[#0e1621] border border-[#242f3d] rounded-xl p-3 text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#54a9eb] transition-colors resize-none"
              />
              <p className="text-[11px] text-slate-400 mt-1 text-right">
                يتيح لك هذا الخيار استعادة جلستك المصرح بها فوراً دون الحاجة لانتظار كود الرسائل القصيرة.
              </p>
            </div>

            <button
              type="submit"
              disabled={auth.loading}
              className="w-full py-3 px-4 bg-gradient-to-r from-[#2b5278] to-[#54a9eb] hover:from-[#356391] hover:to-[#63b3f2] text-white font-semibold rounded-xl transition-all shadow flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer text-sm"
            >
              {auth.loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  جاري التحقق من الجلسة...
                </span>
              ) : (
                <span>استيراد وتفعيل الجلسة فوراً</span>
              )}
            </button>
          </form>
        )}

        {/* Mode 3: Bot Token Login */}
        {auth.mode === 'bot' && (
          <form onSubmit={handleBotLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 text-right">
                أدخل توكن البوت الرسمي (Bot Token من BotFather)
              </label>
              <input
                type="text"
                placeholder="1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                value={auth.botTokenInput}
                onChange={(e) => setAuth((prev) => ({ ...prev, botTokenInput: e.target.value }))}
                required
                className="w-full bg-[#0e1621] border border-[#242f3d] rounded-xl px-4 py-3 text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#54a9eb] transition-colors"
              />
              <p className="text-[11px] text-slate-400 mt-1 text-right">
                تسجيل الدخول كبوت رسمي لمشاهدة المحادثات والرسائل والتفاعل معها عبر MTProto.
              </p>
            </div>

            <button
              type="submit"
              disabled={auth.loading}
              className="w-full py-3 px-4 bg-gradient-to-r from-[#2b5278] to-[#54a9eb] hover:from-[#356391] hover:to-[#63b3f2] text-white font-semibold rounded-xl transition-all shadow flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer text-sm"
            >
              {auth.loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  جاري تسجيل دخول البوت...
                </span>
              ) : (
                <span>تسجيل دخول البوت</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
