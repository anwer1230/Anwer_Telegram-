import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Trash2, Camera, Loader2, AlertCircle } from 'lucide-react';

interface RoundVideoRecorderProps {
  isOpen?: boolean;
  onClose: () => void;
  onSendVideoNote?: (file: File) => Promise<void>;
  onSendVideo?: (file: File) => Promise<void>;
}

export const RoundVideoRecorder: React.FC<RoundVideoRecorderProps> = ({
  isOpen = true,
  onClose,
  onSendVideoNote,
  onSendVideo,
}) => {
  const [duration, setDuration] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  if (isOpen === false) return null;

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 480 },
          height: { ideal: 480 },
        },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(console.error);
      }
      startRecording(stream);
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError('تعذر الوصول إلى الكاميرا أو الميكروفون. يرجى منح الإذن.');
    }
  };

  const stopCamera = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startRecording = (stream: MediaStream) => {
    recordedChunksRef.current = [];
    const mimeTypes = ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'];
    let selectedMime = '';
    for (const mime of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mime)) {
        selectedMime = mime;
        break;
      }
    }

    try {
      const recorder = new MediaRecorder(stream, selectedMime ? { mimeType: selectedMime } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.start(250);
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((prev) => {
          if (prev >= 59) {
            handleStopAndSend();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      setCameraError(err.message || 'فشل بدء تسجيل الفيديو');
    }
  };

  const handleStopAndSend = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;

    if (timerRef.current) clearInterval(timerRef.current);
    setSending(true);

    mediaRecorderRef.current.onstop = async () => {
      stopCamera();
      const blob = new Blob(recordedChunksRef.current, { type: 'video/mp4' });
      const file = new File([blob], `round_video_${Date.now()}.mp4`, { type: 'video/mp4' });
      try {
        if (onSendVideo) {
          await onSendVideo(file);
        } else if (onSendVideoNote) {
          await onSendVideoNote(file);
        }
        onClose();
      } catch (err: any) {
        setCameraError(err.message || 'فشل إرسال رسالة الفيديو');
        setSending(false);
      }
    };

    mediaRecorderRef.current.stop();
  };

  const formatSecs = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 bg-black/85 backdrop-blur-md select-none animate-in fade-in duration-200">
      <div className="flex flex-col items-center gap-6 max-w-sm w-full">
        {/* Title */}
        <div className="text-center">
          <h3 className="text-sm font-bold text-white flex items-center justify-center gap-2">
            <Camera className="w-4 h-4 text-[#54a9eb]" />
            <span>رسالة فيديو دائرية (Video Note)</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">تليجرام رسمي: رسالة مرئية دائرية حتى دقيقة واحدة</p>
        </div>

        {/* Circular Camera Preview Screen */}
        <div className="relative w-64 h-64 sm:w-72 sm:h-72 rounded-full overflow-hidden border-4 border-[#54a9eb] shadow-[0_0_35px_rgba(84,169,235,0.4)] bg-black flex items-center justify-center">
          {cameraError ? (
            <div className="p-4 text-center text-rose-300 text-xs flex flex-col items-center gap-2">
              <AlertCircle className="w-6 h-6 text-rose-400" />
              <span>{cameraError}</span>
            </div>
          ) : (
            <video
              ref={videoRef}
              muted
              playsInline
              className="w-full h-full object-cover -scale-x-100"
            />
          )}

          {/* Duration Badge inside Circle */}
          {isRecording && !cameraError && (
            <div className="absolute top-4 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-full border border-white/10 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span className="text-xs font-mono font-bold text-white">{formatSecs(duration)}</span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            disabled={sending}
            className="p-3 rounded-full bg-[#242f3d] text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shadow cursor-pointer"
            title="إلغاء التسجيل"
          >
            <Trash2 className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={handleStopAndSend}
            disabled={sending || !!cameraError}
            className="px-6 py-3 rounded-full bg-[#54a9eb] hover:bg-[#4698d8] text-white text-xs font-bold flex items-center gap-2 transition-transform active:scale-95 shadow-xl cursor-pointer disabled:opacity-40"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>جاري إرسال الفيديو...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4 -rotate-45" />
                <span>إرسال الفيديو الدائري</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
