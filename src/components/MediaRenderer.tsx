import React, { useState } from 'react';
import {
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Mic,
  Video,
  AlertCircle,
  Play,
  Pause,
  CheckCircle2,
  HelpCircle,
  BarChart2,
  Globe,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { TelegramMessage, TelegramMiniApp } from '../types';
import { telegramApi } from '../api/telegramApi';

interface MediaRendererProps {
  message: TelegramMessage;
  peerId: string;
  onOpenMiniApp?: (app: TelegramMiniApp) => void;
  onVoteSuccess?: () => void;
}

export const MediaRenderer: React.FC<MediaRendererProps> = ({
  message,
  peerId,
  onOpenMiniApp,
  onVoteSuccess,
}) => {
  const [loadError, setLoadError] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  // Poll state
  const [voting, setVoting] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  // Bot callback state
  const [activeCallbackBtn, setActiveCallbackBtn] = useState<string | null>(null);

  const mediaType = message.mediaType;
  const mediaInfo = message.mediaInfo;
  const poll = message.poll;
  const webPage = message.webPage;
  const replyMarkup = message.replyMarkup;

  const viewUrl = telegramApi.getMediaUrl(peerId, message.id, false);
  const downloadUrl = telegramApi.getMediaUrl(peerId, message.id, true);

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const fileName = mediaInfo?.fileName || `file_${message.id}`;
  const fileSize = formatFileSize(mediaInfo?.size);

  const toggleAudio = () => {
    if (!audioEl) {
      const audio = new Audio(viewUrl);
      audio.onended = () => setIsPlayingAudio(false);
      audio.onpause = () => setIsPlayingAudio(false);
      audio.onplay = () => setIsPlayingAudio(true);
      audio.play().catch((err) => {
        console.error('Audio play error:', err);
        setLoadError(true);
      });
      setAudioEl(audio);
    } else {
      if (isPlayingAudio) {
        audioEl.pause();
      } else {
        audioEl.play().catch(() => setLoadError(true));
      }
    }
  };

  const handleVote = async (optionIdx: number) => {
    if (voting || poll?.closed) return;
    setVoting(true);
    setSelectedOption(optionIdx);
    try {
      await telegramApi.sendVote(peerId, message.id, [optionIdx]);
      if (onVoteSuccess) onVoteSuccess();
    } catch (err: any) {
      alert(`فشل التصويت: ${err.message || 'خطأ'}`);
    } finally {
      setVoting(false);
    }
  };

  const handleButtonClick = async (btn: any) => {
    if (btn.url) {
      if (
        (btn.url.startsWith('https://t.me/') && btn.url.includes('?startapp=')) ||
        btn.url.includes('tg://resolve?domain=')
      ) {
        if (onOpenMiniApp) {
          onOpenMiniApp({
            url: btn.url,
            title: btn.text,
          });
          return;
        }
      }
      window.open(btn.url, '_blank');
      return;
    }

    if (btn.webApp) {
      if (onOpenMiniApp) {
        onOpenMiniApp({
          url: btn.webApp.url,
          title: btn.text,
        });
      } else {
        window.open(btn.webApp.url, '_blank');
      }
      return;
    }

    if (btn.data) {
      setActiveCallbackBtn(btn.text);
      try {
        const res = await telegramApi.sendBotCallback(peerId, message.id, btn.data);
        if (res?.message) {
          if (res.alert) {
            alert(res.message);
          }
        }
      } catch (err: any) {
        console.error('Bot callback error:', err);
      } finally {
        setActiveCallbackBtn(null);
      }
    }
  };

  return (
    <div className="my-1.5 select-none overflow-hidden rounded-xl">
      {/* 1. Sticker rendering */}
      {mediaType === 'sticker' && (
        <div className="relative group max-w-[200px] flex flex-col items-center p-1.5 bg-black/20 rounded-xl border border-white/5">
          {!loadError ? (
            <img
              src={viewUrl}
              alt={mediaInfo?.altEmoji || 'ملصق'}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setLoadError(true)}
              className="w-40 h-40 object-contain transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <div className="w-32 h-32 flex flex-col items-center justify-center text-slate-400 gap-1 bg-[#242f3d]/40 rounded-xl p-2">
              <span className="text-3xl">{mediaInfo?.altEmoji || '🎭'}</span>
              <span className="text-[11px]">ملصق تليجرام</span>
            </div>
          )}

          {mediaInfo?.altEmoji && (
            <span className="text-xs text-slate-300 mt-1 opacity-75">{mediaInfo.altEmoji}</span>
          )}

          <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-[#17212b]/95 backdrop-blur-xs p-1 rounded-xl border border-white/10 shadow-xl z-10">
            <a
              href={`${downloadUrl}&format=webp`}
              download={`sticker_${message.id}.webp`}
              title="تنزيل الملصق بصيغة WebP"
              className="px-2 py-0.5 rounded-lg bg-white/10 hover:bg-[#54a9eb] text-[10px] text-white transition-colors"
            >
              WebP
            </a>
            <a
              href={`${downloadUrl}&format=lottie`}
              download={`sticker_${message.id}.tgs`}
              title="تنزيل الملصق بصيغة Lottie المتحركة"
              className="px-2 py-0.5 rounded-lg bg-white/10 hover:bg-emerald-500 text-[10px] text-emerald-300 hover:text-white transition-colors"
            >
              Lottie
            </a>
          </div>
        </div>
      )}

      {/* 2. Round Video Note rendering (رسالة فيديو دائرية رسمية) */}
      {mediaType === 'round' && (
        <div className="flex flex-col items-center my-1">
          <div className="relative w-56 h-56 sm:w-60 sm:h-60 rounded-full overflow-hidden border-3 border-[#54a9eb] shadow-2xl bg-black flex items-center justify-center group">
            <video
              src={viewUrl}
              autoPlay
              loop
              playsInline
              className="w-full h-full object-cover rounded-full"
              onError={() => setLoadError(true)}
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
              <a
                href={downloadUrl}
                download={`video_note_${message.id}.mp4`}
                title="تنزيل رسالة الفيديو"
                className="p-2.5 rounded-full bg-[#242f3d]/90 text-white hover:bg-[#54a9eb] transition-colors shadow-lg"
              >
                <Download className="w-5 h-5" />
              </a>
            </div>
            {mediaInfo?.duration && (
              <span className="absolute bottom-3 bg-black/60 backdrop-blur-xs px-2 py-0.5 rounded-full text-[10px] font-mono text-white">
                {mediaInfo.duration}s
              </span>
            )}
          </div>
        </div>
      )}

      {/* 3. GIF rendering */}
      {mediaType === 'gif' && (
        <div className="relative group max-w-sm rounded-lg overflow-hidden bg-black/40 border border-white/5">
          <video
            src={viewUrl}
            autoPlay
            loop
            muted
            playsInline
            className="w-full max-h-80 rounded-lg object-contain"
            onError={() => setLoadError(true)}
          />
          <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/60 text-[9px] font-bold text-white tracking-wider backdrop-blur-xs">
            GIF
          </span>
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <a
              href={downloadUrl}
              download={`${fileName}.mp4`}
              title="تنزيل صورة GIF"
              className="p-1.5 rounded-full bg-[#242f3d]/90 text-white hover:bg-[#54a9eb] transition-colors shadow-lg block"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}

      {/* 4. Photo rendering */}
      {mediaType === 'photo' && (
        <div className="relative group max-w-sm rounded-lg overflow-hidden bg-black/30 border border-white/5">
          {!loadError ? (
            <img
              src={viewUrl}
              alt={fileName}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setLoadError(true)}
              className="w-full max-h-80 object-cover rounded-lg transition-transform duration-200 group-hover:scale-[1.01]"
            />
          ) : (
            <div className="p-4 flex flex-col items-center justify-center text-slate-400 gap-2">
              <AlertCircle className="w-6 h-6 text-amber-400" />
              <span className="text-xs">صورة تليجرام سحابية</span>
            </div>
          )}

          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
            <a
              href={viewUrl}
              target="_blank"
              rel="noreferrer"
              title="معاينة بالحجم الكامل"
              className="p-2 rounded-full bg-[#242f3d]/90 text-white hover:bg-[#54a9eb] transition-colors shadow-lg"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <a
              href={downloadUrl}
              download={fileName}
              title="تنزيل الصورة"
              className="p-2 rounded-full bg-[#242f3d]/90 text-white hover:bg-[#54a9eb] transition-colors shadow-lg"
            >
              <Download className="w-4 h-4" />
            </a>
          </div>
        </div>
      )}

      {/* 5. Standard Video rendering */}
      {mediaType === 'video' && (
        <div className="relative max-w-sm rounded-lg overflow-hidden bg-black/40 border border-white/5">
          <video
            src={viewUrl}
            controls
            preload="metadata"
            className="w-full max-h-80 rounded-lg"
            onError={() => setLoadError(true)}
          >
            متصفحك لا يدعم تشغيل الفيديو المباشر.
          </video>
          <div className="px-3 py-1.5 flex items-center justify-between text-[11px] text-slate-300 bg-[#17212b]/80 border-t border-white/5">
            <span className="truncate max-w-[200px]">{fileName}</span>
            <div className="flex items-center gap-2 shrink-0">
              {fileSize && <span>{fileSize}</span>}
              <a
                href={downloadUrl}
                download={fileName}
                title="تنزيل الفيديو"
                className="hover:text-[#54a9eb] transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 6. Voice / Audio rendering */}
      {mediaType === 'voice' && (
        <div className="p-2.5 flex items-center gap-3 min-w-[240px] max-w-sm bg-[#17212b]/90 rounded-xl border border-white/5">
          <button
            type="button"
            onClick={toggleAudio}
            className="w-10 h-10 rounded-full bg-[#54a9eb] hover:bg-[#4698d8] text-white flex items-center justify-center transition-transform active:scale-95 shadow cursor-pointer shrink-0"
          >
            {isPlayingAudio ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-xs font-medium text-slate-200 mb-1">
              <span className="flex items-center gap-1">
                <Mic className="w-3.5 h-3.5 text-[#54a9eb]" />
                {mediaInfo?.duration ? `${mediaInfo.duration}s` : 'رسالة صوتية'}
              </span>
              {fileSize && <span className="text-[10px] text-slate-400">{fileSize}</span>}
            </div>
            <div className="h-1.5 bg-[#242f3d] rounded-full overflow-hidden">
              <div
                className={`h-full bg-[#54a9eb] transition-all duration-300 ${
                  isPlayingAudio ? 'w-full animate-pulse' : 'w-1/3'
                }`}
              />
            </div>
          </div>

          <a
            href={downloadUrl}
            download={fileName.endsWith('.ogg') || fileName.endsWith('.mp3') ? fileName : `${fileName}.ogg`}
            title="تنزيل التسجيل الصوتي"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#242f3d] transition-colors cursor-pointer shrink-0"
          >
            <Download className="w-4 h-4" />
          </a>
        </div>
      )}

      {/* 7. Document / Generic File rendering */}
      {(mediaType === 'document' || mediaType === 'media') && (
        <div className="p-3 flex items-center gap-3 min-w-[220px] max-w-sm bg-[#17212b]/90 rounded-xl hover:bg-[#1f2b38] transition-colors border border-white/5">
          <div className="w-10 h-10 rounded-xl bg-[#2b5278] text-[#54a9eb] flex items-center justify-center shrink-0 shadow">
            <FileText className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-100 truncate" title={fileName}>
              {fileName}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {fileSize || mediaInfo?.mimeType || 'ملف تليجرام'}
            </p>
          </div>

          <a
            href={downloadUrl}
            download={fileName}
            title="تنزيل الملف"
            className="p-2 rounded-lg bg-[#242f3d] hover:bg-[#54a9eb] text-slate-200 hover:text-white transition-colors cursor-pointer shrink-0 shadow"
          >
            <Download className="w-4 h-4" />
          </a>
        </div>
      )}

      {/* 8. WebPage / Link Preview Card (معاينة الروابط الذكية) */}
      {webPage && (
        <a
          href={webPage.url}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block p-3 rounded-xl bg-[#141d26]/90 hover:bg-[#18232e] border-r-3 border-[#54a9eb] border border-white/5 transition-all text-right group max-w-md"
        >
          {webPage.siteName && (
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#54a9eb] mb-1">
              <Globe className="w-3.5 h-3.5" />
              <span>{webPage.siteName}</span>
            </div>
          )}

          {(webPage.photoUrl || webPage.imageUrl) && (
            <div className="my-2 rounded-lg overflow-hidden max-h-48 bg-black/40">
              <img
                src={webPage.photoUrl || webPage.imageUrl}
                alt={webPage.title || 'معاينة الرابط'}
                className="w-full h-full object-cover group-hover:scale-102 transition-transform"
              />
            </div>
          )}

          {webPage.title && (
            <p className="text-xs font-bold text-white group-hover:text-[#54a9eb] transition-colors leading-snug">
              {webPage.title}
            </p>
          )}

          {webPage.description && (
            <p className="text-[11px] text-slate-300 mt-1 line-clamp-3 leading-relaxed">
              {webPage.description}
            </p>
          )}
        </a>
      )}

      {/* 9. Telegram Poll / Quiz Rendering (الاستطلاعات والاختبارات) */}
      {poll && (
        <div className="mt-2 p-3.5 rounded-xl bg-[#141d26]/95 border border-[#242f3d] max-w-sm w-full space-y-3">
          {/* Poll Header */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#54a9eb]">
                <BarChart2 className="w-3.5 h-3.5" />
                <span>{poll.quiz ? 'اختبار تليجرام' : 'استطلاع رأي'}</span>
                {poll.publicVoters ? (
                  <span className="text-[10px] text-slate-400 font-normal">• تصويت عام</span>
                ) : (
                  <span className="text-[10px] text-slate-400 font-normal">• مجهول الهوية</span>
                )}
              </div>
              <h4 className="text-xs font-bold text-white mt-1 leading-snug">{poll.question}</h4>
            </div>
            {poll.closed && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                مغلق
              </span>
            )}
          </div>

          {/* Poll Answers */}
          <div className="space-y-2">
            {poll.answers.map((ans, idx) => {
              const isSelected = selectedOption === idx || ans.chosen;
              const isCorrect = poll.quiz && ans.correct;
              const pct = ans.percent ?? ans.percentage;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleVote(idx)}
                  disabled={voting || poll.closed}
                  className={`w-full text-right p-2.5 rounded-xl border transition-all cursor-pointer relative overflow-hidden flex flex-col gap-1 ${
                    isSelected
                      ? 'border-[#54a9eb] bg-[#2b5278]/30 text-white'
                      : isCorrect
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                      : 'border-[#242f3d] hover:border-slate-600 bg-[#1e2c3a]/70 text-slate-200'
                  }`}
                >
                  {/* Percentage background progress bar */}
                  {pct !== undefined && (
                    <div
                      className={`absolute top-0 right-0 bottom-0 opacity-20 pointer-events-none transition-all ${
                        isCorrect ? 'bg-emerald-400' : 'bg-[#54a9eb]'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  )}

                  <div className="flex items-center justify-between z-1 relative">
                    <span className="text-xs font-medium">{ans.text}</span>
                    {pct !== undefined && (
                      <span className="text-[11px] font-mono text-slate-400">
                        {pct}%
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Solution banner for Quiz */}
          {poll.quiz && poll.solution && (
            <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/40 flex items-start gap-2 text-xs text-emerald-300">
              <HelpCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{poll.solution}</span>
            </div>
          )}

          {/* Poll Footer */}
          <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-[#242f3d]">
            <span>{poll.totalVoters || 0} صوت</span>
            {voting && (
              <span className="text-[#54a9eb] flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>جاري تسجيل الصوت...</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* 10. Bot Inline Keyboards (أزرار البوت التفاعلية والتطبيقات المصغرة) */}
      {replyMarkup?.rows && replyMarkup.rows.length > 0 && (
        <div className="mt-2 space-y-1.5 max-w-sm w-full">
          {replyMarkup.rows.map((row: any, rIdx: number) => (
            <div key={rIdx} className="flex gap-1.5">
              {row.buttons.map((btn: any, bIdx: number) => {
                const isLoading = activeCallbackBtn === btn.text;
                return (
                  <button
                    key={bIdx}
                    type="button"
                    onClick={() => handleButtonClick(btn)}
                    disabled={isLoading}
                    className="flex-1 py-2 px-3 rounded-xl bg-[#242f3d] hover:bg-[#2b5278] active:bg-[#356391] text-xs font-semibold text-slate-200 hover:text-white transition-all border border-[#2c3e50] shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#54a9eb]" />
                    ) : btn.webApp ? (
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    ) : btn.url ? (
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                    ) : null}
                    <span>{btn.text}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
