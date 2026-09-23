import React, { useEffect } from 'react';
import { X, Download, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface MediaViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaUrl: string;
  mediaType: 'photo' | 'video';
  fileName?: string;
  senderName?: string;
  date?: number;
}

export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({
  isOpen,
  onClose,
  mediaUrl,
  mediaType,
  fileName,
  senderName,
  date,
}) => {
  const [scale, setScale] = React.useState(1);

  useEffect(() => {
    if (!isOpen) return;

    setScale(1);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const formattedDate = date
    ? new Date(date * 1000).toLocaleString('ar-EG', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '';

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-md select-none animate-in fade-in duration-150"
      dir="rtl"
    >
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/40 border-b border-white/10 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
            title="إغلاق (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
          <div>
            <h4 className="text-sm font-semibold text-white truncate max-w-xs sm:max-w-md">
              {senderName || fileName || 'عرض الوسائط'}
            </h4>
            {formattedDate && (
              <p className="text-[11px] text-white/60">{formattedDate}</p>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1">
          {mediaType === 'photo' && (
            <>
              <button
                type="button"
                onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
                className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                title="تصغير"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setScale((s) => Math.min(3, s + 0.25))}
                className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                title="تكبير"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setScale(1)}
                className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                title="إعادة ضبط الحجم"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </>
          )}

          <a
            href={`${mediaUrl}&download=1`}
            download={fileName || 'telegram-media'}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors flex items-center gap-1.5"
            title="تنزيل الملف"
          >
            <Download className="w-5 h-5" />
          </a>
        </div>
      </div>

      {/* Main View Area */}
      <div
        className="flex-1 flex items-center justify-center p-4 overflow-hidden relative"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        {mediaType === 'video' ? (
          <video
            src={mediaUrl}
            controls
            autoPlay
            playsInline
            className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain"
          />
        ) : (
          <img
            src={mediaUrl}
            alt={fileName || 'صورة'}
            style={{
              transform: `scale(${scale})`,
              transition: 'transform 0.15s ease-out',
            }}
            className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain cursor-grab active:cursor-grabbing"
          />
        )}
      </div>
    </div>
  );
};
