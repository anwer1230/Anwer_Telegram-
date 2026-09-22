import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Hand,
  Volume2,
  Users,
  LogOut,
  Radio,
  Sparkles,
  Shield,
  Video,
  VideoOff,
  User,
} from 'lucide-react';
import { VoiceChatSpace } from '../types';
import { telegramApi } from '../api/telegramApi';

interface VoiceChatModalProps {
  chatId: string;
  chatTitle: string;
  isChannel?: boolean;
  onClose: () => void;
}

export const VoiceChatModal: React.FC<VoiceChatModalProps> = ({
  chatId,
  chatTitle,
  isChannel = false,
  onClose,
}) => {
  const [space, setSpace] = useState<VoiceChatSpace>({
    chatId,
    title: chatTitle,
    isChannel,
    isActive: true,
    participants: [],
  });

  const [isMuted, setIsMuted] = useState(true);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isSpeakingLocal, setIsSpeakingLocal] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Load and join space on mount
  useEffect(() => {
    let isMounted = true;

    async function initSpace() {
      try {
        const res = await telegramApi.joinVoiceChat(chatId, chatTitle, isChannel);
        if (res.space && isMounted) {
          setSpace(res.space);
        }
      } catch (err) {
        console.warn('Failed to join voice chat space:', err);
      }
    }

    initSpace();

    // Listen to real-time voice chat space events
    const unsub = telegramApi.subscribeToEvents({
      onVoiceChatUpdate: (updatedSpace) => {
        if (updatedSpace.chatId === chatId && isMounted) {
          setSpace(updatedSpace);
        }
      },
    });

    return () => {
      isMounted = false;
      unsub();
      telegramApi.leaveVoiceChat(chatId).catch(() => {});
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [chatId]);

  // Handle local microphone volume detection for speaking indicator
  const setupAudioDetection = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let speakingDebounce = false;

      const checkVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;

        const speaking = average > 25;
        if (speaking !== speakingDebounce) {
          speakingDebounce = speaking;
          setIsSpeakingLocal(speaking);
          telegramApi.updateVoiceChatState(chatId, { isSpeaking: speaking }).catch(() => {});
        }

        animationFrameRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (err) {
      console.warn('Audio detection not supported:', err);
    }
  };

  const toggleMic = async () => {
    if (isMuted) {
      // Unmute
      try {
        let stream = localStreamRef.current;
        if (!stream) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          localStreamRef.current = stream;
          setupAudioDetection(stream);
        } else {
          stream.getAudioTracks().forEach((t) => (t.enabled = true));
        }
        setIsMuted(false);
        await telegramApi.updateVoiceChatState(chatId, { isMuted: false });
      } catch (err) {
        console.warn('Could not access mic:', err);
      }
    } else {
      // Mute
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = false));
      }
      setIsMuted(true);
      setIsSpeakingLocal(false);
      await telegramApi.updateVoiceChatState(chatId, { isMuted: true, isSpeaking: false });
    }
  };

  const toggleRaiseHand = async () => {
    const nextHand = !isHandRaised;
    setIsHandRaised(nextHand);
    await telegramApi.updateVoiceChatState(chatId, { isRaisedHand: nextHand });
  };

  const toggleVideo = async () => {
    const nextVideo = !isVideoOn;
    setIsVideoOn(nextVideo);
    await telegramApi.updateVoiceChatState(chatId, { isVideo: nextVideo });
  };

  const handleLeave = async () => {
    try {
      await telegramApi.leaveVoiceChat(chatId);
    } catch (_) {}
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-[#17212b] border border-[#2b5278]/50 rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
        {/* Header */}
        <div className="p-5 border-b border-[#242f3d] flex items-center justify-between bg-gradient-to-r from-[#17212b] via-[#1e2a38] to-[#17212b]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#54a9eb] to-[#2b5278] flex items-center justify-center text-white shadow-lg">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">{chatTitle}</h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                  {isChannel ? 'بث مباشر' : 'محادثة صوتية'}
                </span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <Users className="w-3.5 h-3.5" />
                <span>{space.participants.length} مشاركين نشطين الآن</span>
              </p>
            </div>
          </div>

          <button
            onClick={handleLeave}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 font-medium text-xs transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>مغادرة</span>
          </button>
        </div>

        {/* Participants Grid */}
        <div className="flex-1 p-6 overflow-y-auto min-h-[280px]">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {space.participants.map((p) => {
              const isMeSpeaking = p.id === 'me' ? isSpeakingLocal : p.isSpeaking;
              const isMeMuted = p.id === 'me' ? isMuted : p.isMuted;
              const isMeHand = p.id === 'me' ? isHandRaised : p.isRaisedHand;

              return (
                <div
                  key={p.id}
                  className={`p-4 rounded-2xl flex flex-col items-center justify-center text-center relative transition-all duration-200 border ${
                    isMeSpeaking
                      ? 'bg-[#242f3d] border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                      : 'bg-[#1e2a38]/60 border-[#2b5278]/20 hover:border-[#2b5278]/40'
                  }`}
                >
                  {/* Hand Raised badge */}
                  {isMeHand && (
                    <div className="absolute top-2 left-2 p-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-bounce">
                      <Hand className="w-3.5 h-3.5" />
                    </div>
                  )}

                  {/* Role badge */}
                  {p.role === 'admin' && (
                    <div className="absolute top-2 right-2 p-1 rounded-full bg-[#54a9eb]/20 text-[#54a9eb] border border-[#54a9eb]/30" title="مدير المساحة">
                      <Shield className="w-3.5 h-3.5" />
                    </div>
                  )}

                  {/* Avatar with speaking wave */}
                  <div className="relative mb-2">
                    <div
                      className={`w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md transition-transform duration-200 ${
                        isMeSpeaking
                          ? 'scale-105 ring-4 ring-emerald-500/40 bg-gradient-to-tr from-emerald-600 to-[#54a9eb]'
                          : 'bg-gradient-to-tr from-[#2b5278] to-[#1e2a38]'
                      }`}
                    >
                      {p.name.trim().charAt(0) || <User className="w-7 h-7" />}
                    </div>

                    <div
                      className={`absolute -bottom-1 -right-1 p-1 rounded-full border-2 border-[#17212b] ${
                        isMeMuted ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'
                      }`}
                    >
                      {isMeMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                    </div>
                  </div>

                  <span className="text-xs font-semibold text-white truncate max-w-[120px]">
                    {p.name}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                    {p.role === 'admin' ? 'مضيف' : p.role === 'speaker' ? 'متحدث' : 'مستمع'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Controller Bar */}
        <div className="p-5 bg-[#0e1621] border-t border-[#242f3d] flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Raise Hand Button */}
            <button
              onClick={toggleRaiseHand}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs transition cursor-pointer ${
                isHandRaised
                  ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                  : 'bg-[#242f3d] text-slate-300 hover:text-white hover:bg-[#2b394a]'
              }`}
            >
              <Hand className="w-4 h-4" />
              <span>{isHandRaised ? 'تم رفع اليد' : 'رفع اليد لطلب التحدث'}</span>
            </button>

            {/* Toggle Video */}
            <button
              onClick={toggleVideo}
              className={`p-2.5 rounded-2xl font-bold text-xs transition cursor-pointer ${
                isVideoOn
                  ? 'bg-[#54a9eb] text-white'
                  : 'bg-[#242f3d] text-slate-300 hover:text-white hover:bg-[#2b394a]'
              }`}
              title={isVideoOn ? 'إيقاف الفيديو' : 'مشاركة الفيديو'}
            >
              {isVideoOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            </button>
          </div>

          {/* Large Mute / Unmute Push Button */}
          <button
            onClick={toggleMic}
            className={`flex items-center gap-2.5 px-6 py-3 rounded-2xl font-bold text-sm shadow-xl transition-transform active:scale-95 cursor-pointer ${
              isMuted
                ? 'bg-[#242f3d] hover:bg-[#2b394a] text-slate-200 border border-[#2b5278]/40'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 animate-pulse'
            }`}
          >
            {isMuted ? <MicOff className="w-5 h-5 text-rose-400" /> : <Mic className="w-5 h-5" />}
            <span>{isMuted ? 'إلغاء الكتم (تحدث)' : 'الميكروفون مفعّل'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
