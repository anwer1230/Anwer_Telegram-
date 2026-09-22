import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, UserPlus, Phone, User, MessageSquare, Loader2, Check } from 'lucide-react';
import { TelegramContact } from '../types';
import { telegramApi } from '../api/telegramApi';

interface ContactsModalProps {
  onClose: () => void;
  onSelectContact: (contact: TelegramContact) => void;
}

export const ContactsModal: React.FC<ContactsModalProps> = ({ onClose, onSelectContact }) => {
  const [contacts, setContacts] = useState<TelegramContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // New Contact form
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    setLoading(true);
    try {
      const list = await telegramApi.getContacts();
      setContacts(list);
    } catch (err) {
      console.error('Failed to load contacts:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredContacts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter((c) => {
      const name = `${c.firstName} ${c.lastName || ''}`.toLowerCase();
      const user = (c.username || '').toLowerCase();
      const ph = (c.phone || '').toLowerCase();
      return name.includes(term) || user.includes(term) || ph.includes(term);
    });
  }, [contacts, searchTerm]);

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !phone.trim()) {
      setAddError('يرجى ملء الاسم الأول ورقم الهاتف');
      return;
    }

    setSubmitting(true);
    setAddError(null);
    try {
      await telegramApi.addContact(phone.trim(), firstName.trim(), lastName.trim());
      setIsAdding(false);
      setFirstName('');
      setLastName('');
      setPhone('');
      await loadContacts();
    } catch (err: any) {
      setAddError(err.message || 'فشل إضافة جهة الاتصال');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm select-none animate-in fade-in duration-200">
      <div className="bg-[#17212b] border border-[#242f3d] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#242f3d] flex items-center justify-between bg-[#141d26]">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <User className="w-5 h-5 text-[#54a9eb]" />
            <span>جهات الاتصال ({contacts.length})</span>
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAdding(!isAdding)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                isAdding ? 'bg-[#54a9eb] text-white' : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
              title="إضافة جهة اتصال جديدة"
            >
              <UserPlus className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Add Contact Form Tray */}
        {isAdding && (
          <form
            onSubmit={handleAddContact}
            className="p-4 bg-[#1e2c3a] border-b border-[#242f3d] space-y-3 animate-in slide-in-from-top-2 duration-150"
          >
            <h4 className="text-xs font-semibold text-[#54a9eb]">إضافة جهة اتصال جديدة</h4>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="الاسم الأول"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className="bg-[#242f3d] border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#54a9eb]"
              />
              <input
                type="text"
                placeholder="الاسم الأخير (اختياري)"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="bg-[#242f3d] border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#54a9eb]"
              />
            </div>
            <input
              type="tel"
              placeholder="رقم الهاتف مع الرمز الدولي (مثال: +9665...)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="w-full bg-[#242f3d] border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#54a9eb]"
            />

            {addError && (
              <p className="text-[11px] text-rose-400">{addError}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-1.5 bg-[#54a9eb] hover:bg-[#4698d8] text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow cursor-pointer disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>حفظ جهة الاتصال</span>
              </button>
            </div>
          </form>
        )}

        {/* Search */}
        <div className="p-3 border-b border-[#242f3d]">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              placeholder="البحث بالاسم أو المعرف أو رقم الهاتف..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#242f3d] text-white text-xs rounded-xl pl-3 pr-9 py-2 focus:outline-none focus:ring-1 focus:ring-[#54a9eb]"
            />
          </div>
        </div>

        {/* Contacts List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#54a9eb]" />
              <span className="text-xs">جاري جلب جهات الاتصال من السحابة...</span>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              لا توجد جهات اتصال مطابقة
            </div>
          ) : (
            filteredContacts.map((contact) => (
              <div
                key={contact.id}
                onClick={() => {
                  onSelectContact(contact);
                  onClose();
                }}
                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#202b36] cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#5288c1] flex items-center justify-center text-white font-bold shrink-0 shadow">
                    {contact.firstName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">
                      {contact.firstName} {contact.lastName || ''}
                    </p>
                    <div className="flex items-center gap-2 text-[11px]">
                      {contact.username && (
                        <span className="text-[#54a9eb]">@{contact.username}</span>
                      )}
                      {contact.phone && (
                        <span className="text-slate-400">{contact.phone}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full ${
                      contact.isOnline || (contact.statusText || contact.status || '').includes('online') || (contact.statusText || contact.status || '').includes('متصل')
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'text-slate-500'
                    }`}
                  >
                    {contact.statusText || contact.status || (contact.isOnline ? 'متصل الآن' : 'غير متصل')}
                  </span>
                  <div className="p-2 rounded-lg bg-[#242f3d] text-slate-300 group-hover:bg-[#54a9eb] group-hover:text-white transition-colors">
                    <MessageSquare className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
