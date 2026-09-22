import React, { useEffect, useRef } from 'react';
import { X, ExternalLink, RefreshCw, Shield, Sparkles } from 'lucide-react';
import { TelegramMiniApp } from '../types';

interface MiniAppModalProps {
  app: TelegramMiniApp;
  onClose: () => void;
}

export const MiniAppModal: React.FC<MiniAppModalProps> = ({ app, onClose }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Initialize Telegram WebApp JS Bridge emulation
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (typeof e.data === 'string' && e.data.startsWith('tg_webapp_')) {
        console.log('Received Telegram WebApp event:', e.data);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleRefresh = () => {
    if (iframeRef.current) {
      iframeRef.current.src = app.url;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-black/80 backdrop-blur-md select-none animate-in fade-in duration-200">
      <div className="bg-[#17212b] border border-[#242f3d] rounded-2xl w-full max-w-2xl h-[92vh] shadow-2xl overflow-hidden flex flex-col">
        {/* Telegram WebApp Header Bar */}
        <div className="px-4 py-3 bg-[#141d26] border-b border-[#242f3d] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[#54a9eb] flex items-center justify-center text-white shrink-0 shadow">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs font-bold text-white truncate">{app.title}</h3>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#24374a] text-[#54a9eb] font-mono">
                  Mini App
                </span>
              </div>
              <p className="text-[10px] text-slate-400 truncate font-mono">
                {app.botUsername || app.shortName
                  ? `@${app.botUsername || app.shortName}`
                  : (() => {
                      try {
                        return new URL(app.url).hostname;
                      } catch {
                        return app.url;
                      }
                    })()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleRefresh}
              title="إعادة تحميل التطبيق المصغر"
              className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <a
              href={app.url}
              target="_blank"
              rel="noreferrer"
              title="فتح في نافذة مستقلة"
              className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              title="إغلاق التطبيق المصغر"
              className="p-1.5 text-slate-400 hover:text-white hover:bg-rose-500/20 rounded-lg transition-colors cursor-pointer mr-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* WebApp IFrame */}
        <div className="flex-1 bg-white relative">
          <iframe
            ref={iframeRef}
            src={app.url}
            title={app.title}
            className="w-full h-full border-0"
            allow="geolocation; camera; microphone; payment; clipboard-read; clipboard-write"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          />
        </div>
      </div>
    </div>
  );
};
