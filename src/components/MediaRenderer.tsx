import React, { useState } from 'react';
import { Download, ExternalLink, FileText, Image as ImageIcon, Mic, Video, AlertCircle, Play, Pause } from 'lucide-react';
import { TelegramMessage } from '../types';
import { telegramApi } from '../api/telegramApi';

interface MediaRendererProps {
  message: TelegramMessage;
  peerId: string;
}

export const MediaRenderer: React.FC<MediaRendererProps> = ({ message, peerId }) => {
  const [loadError, setLoadError] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  const mediaType = message.mediaType;
  const mediaInfo = message.mediaInfo;

  if (!mediaType) return null;

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

  return (
    <div className="my-2 select-none overflow-hidden rounded-xl bg-black/20 border border-white/5">
      {/* 1. Photo rendering */}
      {mediaType === 'photo' && (
        <div className="relative group max-w-sm rounded-lg overflow-hidden bg-black/30">
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

      {/* 2. Video rendering */}
      {mediaType === 'video' && (
        <div className="relative max-w-sm rounded-lg overflow-hidden bg-black/40">
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

      {/* 3. Voice / Audio rendering */}
      {mediaType === 'voice' && (
        <div className="p-2.5 flex items-center gap-3 min-w-[240px] max-w-sm bg-[#17212b]/90 rounded-xl">
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
            {/* Waveform simulation line */}
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

      {/* 4. Document / Generic File rendering */}
      {(mediaType === 'document' || mediaType === 'media') && (
        <div className="p-3 flex items-center gap-3 min-w-[220px] max-w-sm bg-[#17212b]/90 rounded-xl hover:bg-[#1f2b38] transition-colors">
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
    </div>
  );
};
