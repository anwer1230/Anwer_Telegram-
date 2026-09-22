import React, { useState } from 'react';
import { X, Plus, Trash2, CheckCircle2, HelpCircle, BarChart2, Loader2 } from 'lucide-react';
import { telegramApi } from '../api/telegramApi';

interface CreatePollModalProps {
  isOpen?: boolean;
  peerId: string;
  onClose: () => void;
  onPollCreated: (pollMessage?: any) => void;
}

export const CreatePollModal: React.FC<CreatePollModalProps> = ({
  isOpen = true,
  peerId,
  onClose,
  onPollCreated,
}) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [multipleAnswers, setMultipleAnswers] = useState(false);
  const [isQuiz, setIsQuiz] = useState(false);
  const [correctOptionIndex, setCorrectOptionIndex] = useState<number>(0);
  const [solution, setSolution] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isOpen === false) return null;

  const handleAddOption = () => {
    if (options.length >= 10) return;
    setOptions([...options, '']);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) return;
    const next = options.filter((_, i) => i !== index);
    setOptions(next);
    if (correctOptionIndex >= next.length) {
      setCorrectOptionIndex(0);
    }
  };

  const handleOptionChange = (index: number, val: string) => {
    const next = [...options];
    next[index] = val;
    setOptions(next);
  };

  const handleCreate = async () => {
    const cleanQuestion = question.trim();
    if (!cleanQuestion) {
      setError('يرجى كتابة سؤال الاستطلاع');
      return;
    }

    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (cleanOptions.length < 2) {
      setError('يرجى إدخال خيارين على الأقل');
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const sent = await telegramApi.sendPoll(peerId, cleanQuestion, cleanOptions, {
        publicVoters: !isAnonymous,
        multipleChoice: !isQuiz && multipleAnswers,
        quiz: isQuiz,
        correctAnswers: isQuiz ? [correctOptionIndex] : undefined,
        solution: isQuiz && solution.trim() ? solution.trim() : undefined,
      });
      onPollCreated(sent);
      onClose();
    } catch (err: any) {
      setError(err.message || 'فشل إنشاء الاستطلاع');
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm select-none animate-in fade-in duration-200">
      <div className="bg-[#17212b] border border-[#242f3d] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#242f3d] flex items-center justify-between bg-[#141d26]">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-[#54a9eb]" />
            <span>إنشاء استطلاع جديد</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Question */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              سؤال الاستطلاع
            </label>
            <input
              type="text"
              placeholder="اكتب سؤالاً..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full bg-[#242f3d] border border-slate-700/60 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#54a9eb]"
            />
          </div>

          {/* Options */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">خيارات الاستطلاع</label>
              <span className="text-[10px] text-slate-400">{options.length}/10</span>
            </div>

            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  {isQuiz && (
                    <button
                      type="button"
                      onClick={() => setCorrectOptionIndex(i)}
                      title={correctOptionIndex === i ? 'الإجابة الصحيحة' : 'تحديد كإجابة صحيحة'}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        correctOptionIndex === i
                          ? 'text-emerald-400 bg-emerald-500/10'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}
                  <input
                    type="text"
                    placeholder={`الخيار ${i + 1}`}
                    value={opt}
                    onChange={(e) => handleOptionChange(i, e.target.value)}
                    className="flex-1 bg-[#242f3d] border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#54a9eb]"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(i)}
                      className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {options.length < 10 && (
              <button
                type="button"
                onClick={handleAddOption}
                className="mt-2.5 flex items-center gap-1.5 text-xs text-[#54a9eb] hover:text-[#70b9f0] font-medium transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة خيار</span>
              </button>
            )}
          </div>

          {/* Settings Toggles */}
          <div className="pt-2 border-t border-[#242f3d] space-y-3">
            <h4 className="text-xs font-semibold text-slate-300">خيارات متقدمة</h4>

            <label className="flex items-center justify-between cursor-pointer select-none">
              <div>
                <span className="text-xs text-slate-200 block font-medium">تصويت مجهول الهوية</span>
                <span className="text-[10px] text-slate-400">لا يمكن للمشاركين رؤية من قام بالتصويت</span>
              </div>
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="w-4 h-4 rounded text-[#54a9eb] focus:ring-0 bg-[#242f3d] border-slate-600 cursor-pointer"
              />
            </label>

            {!isQuiz && (
              <label className="flex items-center justify-between cursor-pointer select-none">
                <div>
                  <span className="text-xs text-slate-200 block font-medium">إجابات متعددة</span>
                  <span className="text-[10px] text-slate-400">يمكن للمشاركين اختيار أكثر من إجابة</span>
                </div>
                <input
                  type="checkbox"
                  checked={multipleAnswers}
                  onChange={(e) => setMultipleAnswers(e.target.checked)}
                  className="w-4 h-4 rounded text-[#54a9eb] focus:ring-0 bg-[#242f3d] border-slate-600 cursor-pointer"
                />
              </label>
            )}

            <label className="flex items-center justify-between cursor-pointer select-none">
              <div>
                <span className="text-xs text-slate-200 block font-medium">وضع الاختبار (Quiz Mode)</span>
                <span className="text-[10px] text-slate-400">يحتوي على إجابة صحيحة واحدة ولا يمكن تغيير الصوت</span>
              </div>
              <input
                type="checkbox"
                checked={isQuiz}
                onChange={(e) => {
                  setIsQuiz(e.target.checked);
                  if (e.target.checked) setMultipleAnswers(false);
                }}
                className="w-4 h-4 rounded text-[#54a9eb] focus:ring-0 bg-[#242f3d] border-slate-600 cursor-pointer"
              />
            </label>

            {isQuiz && (
              <div className="pt-2">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  شرح الإجابة (اختياري)
                </label>
                <textarea
                  placeholder="سيظهر هذا الشرح للمستخدمين بعد اختيار إجابة خاطئة..."
                  value={solution}
                  onChange={(e) => setSolution(e.target.value)}
                  rows={2}
                  className="w-full bg-[#242f3d] border border-slate-700/60 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#54a9eb]"
                />
              </div>
            )}
          </div>

          {/* Error display */}
          {error && (
            <div className="p-3 bg-rose-900/60 text-rose-200 text-xs rounded-xl border border-rose-700/50">
              {error}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3 border-t border-[#242f3d] bg-[#141d26] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={creating}
            className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            إلغاء
          </button>

          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="px-5 py-2 rounded-xl bg-[#54a9eb] hover:bg-[#4698d8] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow cursor-pointer"
          >
            {creating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>جاري النشر...</span>
              </>
            ) : (
              <span>إنشاء الاستطلاع</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
