import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Shield,
  Smartphone,
  Camera,
  Check,
  Loader2,
  Trash2,
  LogOut,
  Lock,
  Eye,
  Phone,
  Image as ImageIcon,
  Share2,
} from 'lucide-react';
import { TelegramUser, TelegramActiveSession, TelegramPrivacySettings } from '../types';
import { telegramApi } from '../api/telegramApi';
import { Avatar } from './Avatar';

interface SettingsModalProps {
  user: TelegramUser | null;
  onClose: () => void;
  onUserUpdated: (user: TelegramUser) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  user,
  onClose,
  onUserUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'sessions' | 'privacy'>('profile');

  // Profile Form state
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Photo Upload
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Active Sessions state
  const [sessions, setSessions] = useState<TelegramActiveSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [terminatingHash, setTerminatingHash] = useState<string | null>(null);

  // Privacy state
  const [privacy, setPrivacy] = useState<TelegramPrivacySettings>({
    phone: 'everybody',
    last_seen: 'everybody',
    photo: 'everybody',
    forwards: 'everybody',
  });
  const [loadingPrivacy, setLoadingPrivacy] = useState(false);
  const [savingPrivacyKey, setSavingPrivacyKey] = useState<string | null>(null);

  useEffect(() => {
    loadFullProfile();
  }, []);

  useEffect(() => {
    if (activeTab === 'sessions') {
      loadSessions();
    } else if (activeTab === 'privacy') {
      loadPrivacy();
    }
  }, [activeTab]);

  const loadFullProfile = async () => {
    try {
      const data = await telegramApi.getFullProfile();
      if (data) {
        setFirstName(data.firstName || '');
        setLastName(data.lastName || '');
        setUsername(data.username || '');
        setBio(data.bio || '');
      }
    } catch (err) {
      console.warn('Could not load full profile:', err);
    }
  };

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const list = await telegramApi.getActiveSessions();
      setSessions(list);
    } catch (err) {
      console.error('Failed to load active sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  const loadPrivacy = async () => {
    setLoadingPrivacy(true);
    try {
      const p = await telegramApi.getPrivacySettings();
      setPrivacy(p);
    } catch (err) {
      console.error('Failed to load privacy:', err);
    } finally {
      setLoadingPrivacy(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileError(null);
    setProfileSuccess(false);

    try {
      // 1. Update Profile name & bio
      let updatedUser = await telegramApi.updateProfile(firstName.trim(), lastName.trim(), bio.trim());

      // 2. Update username if changed
      if (username !== (user?.username || '')) {
        updatedUser = await telegramApi.updateUsername(username.trim());
      }

      onUserUpdated(updatedUser);
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 2500);
    } catch (err: any) {
      setProfileError(err.message || 'فشل حفظ الملف الشخصي');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const updated = await telegramApi.uploadProfilePhoto(base64, file.name);
        onUserUpdated(updated);
        setUploadingPhoto(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      alert(`فشل رفع الصورة: ${err.message || 'خطأ'}`);
      setUploadingPhoto(false);
    }
  };

  const handleTerminateSession = async (hash: string) => {
    if (!confirm('هل تريد إنهاء هذه الجلسة؟')) return;
    setTerminatingHash(hash);
    try {
      await telegramApi.terminateSession(hash);
      setSessions((prev) => prev.filter((s) => s.hash !== hash));
    } catch (err: any) {
      alert(`فشل إنهاء الجلسة: ${err.message || 'خطأ'}`);
    } finally {
      setTerminatingHash(null);
    }
  };

  const handleTerminateAllOther = async () => {
    if (!confirm('هل أنت متأكد من إنهاء جميع الجلسات والأجهزة الأخرى؟')) return;
    setLoadingSessions(true);
    try {
      await telegramApi.terminateAllOtherSessions();
      await loadSessions();
    } catch (err: any) {
      alert(`فشل إنهاء الجلسات: ${err.message || 'خطأ'}`);
    } finally {
      setLoadingSessions(false);
    }
  };

  const handlePrivacyChange = async (
    key: 'phone' | 'last_seen' | 'photo' | 'forwards',
    val: 'everybody' | 'contacts' | 'nobody'
  ) => {
    setSavingPrivacyKey(key);
    try {
      await telegramApi.setPrivacyRule(key, val);
      setPrivacy((prev) => ({ ...prev, [key]: val }));
    } catch (err: any) {
      alert(`فشل تحديث الخصوصية: ${err.message || 'خطأ'}`);
    } finally {
      setSavingPrivacyKey(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm select-none animate-in fade-in duration-200">
      <div className="bg-[#17212b] border border-[#242f3d] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Header */}
        <div className="px-5 py-4 border-b border-[#242f3d] flex items-center justify-between bg-[#141d26]">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <span>الإعدادات والملف الشخصي</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs Bar */}
        <div className="flex border-b border-[#242f3d] bg-[#141d26] px-3 gap-2">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'profile'
                ? 'border-[#54a9eb] text-[#54a9eb]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-4 h-4" />
            <span>الملف الشخصي</span>
          </button>

          <button
            onClick={() => setActiveTab('sessions')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'sessions'
                ? 'border-[#54a9eb] text-[#54a9eb]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>الأجهزة والجلسات</span>
          </button>

          <button
            onClick={() => setActiveTab('privacy')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'privacy'
                ? 'border-[#54a9eb] text-[#54a9eb]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>الخصوصية والأمان</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* 1. Profile Tab */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              {/* Avatar Upload */}
              <div className="flex flex-col items-center gap-3 pb-2">
                <div className="relative group">
                  <Avatar
                    peerId={user?.id}
                    name={`${firstName || ''} ${lastName || ''}`.trim() || user?.username || 'User'}
                    size="2xl"
                    isBig
                    className="border-2 border-white/10 shadow-lg"
                  />
                  <label className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white cursor-pointer transition-opacity z-10">
                    <Camera className="w-5 h-5 mb-0.5" />
                    <span className="text-[9px]">تغيير</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      disabled={uploadingPhoto}
                      className="hidden"
                    />
                  </label>
                  {uploadingPhoto && (
                    <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center z-20">
                      <Loader2 className="w-6 h-6 animate-spin text-[#54a9eb]" />
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">انقر لتحديث الصورة الشخصية على تليجرام</p>
              </div>

              {/* Names */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">الاسم الأول</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    className="w-full bg-[#242f3d] border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#54a9eb]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">الاسم الأخير</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full bg-[#242f3d] border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#54a9eb]"
                  />
                </div>
              </div>

              {/* Username */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  اسم المستخدم (المعرف)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-mono">@</span>
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                    className="w-full bg-[#242f3d] border border-slate-700/60 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#54a9eb]"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  يمكن للآخرين العثور عليك في تليجرام والتواصل معك عبر هذا المعرف.
                </p>
              </div>

              {/* Bio */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">النبذة التعريفية (Bio)</label>
                <textarea
                  rows={2}
                  placeholder="اكتب نبذة مختصرة عنك..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={70}
                  className="w-full bg-[#242f3d] border border-slate-700/60 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#54a9eb]"
                />
                <p className="text-[10px] text-slate-400 text-left font-mono">{bio.length}/70</p>
              </div>

              {profileError && (
                <div className="p-3 bg-rose-900/60 text-rose-200 text-xs rounded-xl border border-rose-700/50">
                  {profileError}
                </div>
              )}

              {profileSuccess && (
                <div className="p-3 bg-emerald-900/60 text-emerald-200 text-xs rounded-xl border border-emerald-700/50 flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>تم حفظ التعديلات في حسابك على تليجرام بنجاح</span>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-5 py-2 rounded-xl bg-[#54a9eb] hover:bg-[#4698d8] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow cursor-pointer disabled:opacity-50"
                >
                  {savingProfile ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>حفظ التعديلات</span>
                </button>
              </div>
            </form>
          )}

          {/* 2. Active Sessions Tab */}
          {activeTab === 'sessions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white">الجلسات والأجهزة النشطة</h4>
                  <p className="text-[11px] text-slate-400">
                    الأجهزة المرتبطة بحساب تليجرام الخاص بك عبر MTProto
                  </p>
                </div>
                {sessions.length > 1 && (
                  <button
                    type="button"
                    onClick={handleTerminateAllOther}
                    className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 text-[11px] font-semibold transition-colors cursor-pointer border border-rose-500/30"
                  >
                    إنهاء باقي الجلسات
                  </button>
                )}
              </div>

              {loadingSessions ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-[#54a9eb]" />
                  <span className="text-xs">جاري فحص الجلسات من خادم تليجرام...</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {sessions.map((sess) => (
                    <div
                      key={sess.hash}
                      className={`p-3 rounded-xl border flex items-center justify-between ${
                        sess.isCurrent ?? sess.current
                          ? 'bg-[#1e2c3a] border-[#54a9eb]/40'
                          : 'bg-[#242f3d]/60 border-slate-700/40'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            sess.isCurrent ?? sess.current ? 'bg-[#54a9eb] text-white' : 'bg-slate-700 text-slate-300'
                          }`}
                        >
                          <Smartphone className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-white">
                              {sess.deviceModel || 'جهاز تليجرام'}
                            </p>
                            {(sess.isCurrent ?? sess.current) && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
                                هذه الجلسة الحالية
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-300">
                            {sess.appName} {sess.appVersion} • {sess.platform}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {sess.ip} • {sess.country || 'سحابي'} • {sess.dateActive}
                          </p>
                        </div>
                      </div>

                      {!(sess.isCurrent ?? sess.current) && (
                        <button
                          type="button"
                          onClick={() => handleTerminateSession(sess.hash)}
                          disabled={terminatingHash === sess.hash}
                          className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                          title="إنهاء هذه الجلسة"
                        >
                          {terminatingHash === sess.hash ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 3. Privacy & Security Tab */}
          {activeTab === 'privacy' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-bold text-white">إعدادات الخصوصية والأمان</h4>
                <p className="text-[11px] text-slate-400">
                  تحكم في من يمكنه رؤية معلوماتك والتواصل معك على تليجرام
                </p>
              </div>

              {loadingPrivacy ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-[#54a9eb]" />
                  <span className="text-xs">جاري جلب إعدادات الخصوصية...</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Phone Privacy */}
                  <div className="p-3 bg-[#1e2c3a] border border-[#242f3d] rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Phone className="w-4 h-4 text-[#54a9eb]" />
                      <div>
                        <p className="text-xs font-semibold text-white">رقم الهاتف</p>
                        <p className="text-[10px] text-slate-400">من يمكنه رؤية رقم هاتفي</p>
                      </div>
                    </div>
                    <select
                      value={privacy.phone}
                      onChange={(e) =>
                        handlePrivacyChange('phone', e.target.value as any)
                      }
                      disabled={savingPrivacyKey === 'phone'}
                      className="bg-[#242f3d] text-white text-xs rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:border-[#54a9eb] cursor-pointer"
                    >
                      <option value="everybody">الجميع</option>
                      <option value="contacts">جهات اتصالي</option>
                      <option value="nobody">لا أحد</option>
                    </select>
                  </div>

                  {/* Last Seen Privacy */}
                  <div className="p-3 bg-[#1e2c3a] border border-[#242f3d] rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Eye className="w-4 h-4 text-emerald-400" />
                      <div>
                        <p className="text-xs font-semibold text-white">آخر ظهور ومتصل</p>
                        <p className="text-[10px] text-slate-400">من يمكنه رؤية وقت نشاطي</p>
                      </div>
                    </div>
                    <select
                      value={privacy.last_seen}
                      onChange={(e) =>
                        handlePrivacyChange('last_seen', e.target.value as any)
                      }
                      disabled={savingPrivacyKey === 'last_seen'}
                      className="bg-[#242f3d] text-white text-xs rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:border-[#54a9eb] cursor-pointer"
                    >
                      <option value="everybody">الجميع</option>
                      <option value="contacts">جهات اتصالي</option>
                      <option value="nobody">لا أحد</option>
                    </select>
                  </div>

                  {/* Profile Photo Privacy */}
                  <div className="p-3 bg-[#1e2c3a] border border-[#242f3d] rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <ImageIcon className="w-4 h-4 text-purple-400" />
                      <div>
                        <p className="text-xs font-semibold text-white">الصور الشخصية</p>
                        <p className="text-[10px] text-slate-400">من يمكنه رؤية صورتي</p>
                      </div>
                    </div>
                    <select
                      value={privacy.photo}
                      onChange={(e) =>
                        handlePrivacyChange('photo', e.target.value as any)
                      }
                      disabled={savingPrivacyKey === 'photo'}
                      className="bg-[#242f3d] text-white text-xs rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:border-[#54a9eb] cursor-pointer"
                    >
                      <option value="everybody">الجميع</option>
                      <option value="contacts">جهات اتصالي</option>
                      <option value="nobody">لا أحد</option>
                    </select>
                  </div>

                  {/* Forward Messages Privacy */}
                  <div className="p-3 bg-[#1e2c3a] border border-[#242f3d] rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <Share2 className="w-4 h-4 text-amber-400" />
                      <div>
                        <p className="text-xs font-semibold text-white">الرسائل المعاد توجيهها</p>
                        <p className="text-[10px] text-slate-400">رابط حسابي عند إعادة التوجيه</p>
                      </div>
                    </div>
                    <select
                      value={privacy.forwards}
                      onChange={(e) =>
                        handlePrivacyChange('forwards', e.target.value as any)
                      }
                      disabled={savingPrivacyKey === 'forwards'}
                      className="bg-[#242f3d] text-white text-xs rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:border-[#54a9eb] cursor-pointer"
                    >
                      <option value="everybody">الجميع</option>
                      <option value="contacts">جهات اتصالي</option>
                      <option value="nobody">لا أحد</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
