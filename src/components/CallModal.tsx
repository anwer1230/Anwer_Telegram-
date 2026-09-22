import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  User,
} from 'lucide-react';
import { CallSession } from '../types';
import { telegramApi } from '../api/telegramApi';

interface CallModalProps {
  call: CallSession;
  onEndCall: () => void;
  onAnswerCall?: () => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const CallModal: React.FC<CallModalProps> = ({
  call,
  onEndCall,
  onAnswerCall,
}) => {
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(call.isVideo);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<any>(null);

  // Call timer when connected
  useEffect(() => {
    if (call.status === 'connected') {
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [call.status]);

  // Initialize WebRTC
  useEffect(() => {
    let isCancelled = false;

    async function setupWebRtc() {
      try {
        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;

        // Remote tracks
        pc.ontrack = (event) => {
          if (event.streams && event.streams[0]) {
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = event.streams[0];
            }
            if (remoteAudioRef.current) {
              remoteAudioRef.current.srcObject = event.streams[0];
            }
          }
        };

        // ICE candidate handler
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            telegramApi.sendCallSignal({
              action: 'ice_candidate',
              callId: call.callId,
              peerId: call.peerId,
              candidate: event.candidate,
            }).catch(() => {});
          }
        };

        // Get local user media
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: call.isVideo ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
          });
        } catch (_) {
          // Fallback to audio only if camera is unavailable
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        }

        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;
        if (localVideoRef.current && call.isVideo) {
          localVideoRef.current.srcObject = stream;
        }

        // Add local tracks to peer connection
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        // If this client is the caller, create Offer
        if (call.isOutgoing && call.status === 'calling') {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await telegramApi.sendCallSignal({
            action: 'call_offer',
            callId: call.callId,
            peerId: call.peerId,
            isVideo: call.isVideo,
            sdp: offer,
          });
        }
      } catch (err) {
        console.warn('WebRTC init error:', err);
      }
    }

    setupWebRtc();

    return () => {
      isCancelled = true;
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (pcRef.current) {
        pcRef.current.close();
      }
    };
  }, [call.callId]);

  // Answer call handler
  const handleAnswer = async () => {
    if (onAnswerCall) onAnswerCall();
    if (pcRef.current && call.sdp) {
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(call.sdp));
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        await telegramApi.sendCallSignal({
          action: 'call_answer',
          callId: call.callId,
          peerId: call.peerId,
          sdp: answer,
        });
      } catch (err) {
        console.warn('Error answering call:', err);
      }
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const displayName = call.peerName || call.peerTitle || 'مستخدم تليجرام';
  const isIncomingPending = !call.isOutgoing && (call.status === 'calling' || call.status === 'ringing');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <audio ref={remoteAudioRef} autoPlay />

      <div
        className={`w-full max-w-md bg-[#17212b] border border-[#2b5278]/40 rounded-2xl shadow-2xl flex flex-col overflow-hidden relative transition-all duration-200 ${
          isFullScreen ? 'max-w-2xl h-[85vh]' : 'h-[520px]'
        }`}
      >
        {/* Top Bar */}
        <div className="p-4 flex items-center justify-between z-10 bg-gradient-to-b from-[#17212b] to-transparent">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-slate-300">
              {call.isVideo ? 'مكالمة فيديو آمنة (E2E)' : 'مكالمة صوتية آمنة (E2E)'}
            </span>
          </div>

          <button
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition"
            title="تبديل ملء الشاشة"
          >
            {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Video or Avatar Center Content */}
        <div className="flex-1 relative flex flex-col items-center justify-center p-6 text-center">
          {call.isVideo && isVideoEnabled ? (
            <div className="absolute inset-0 w-full h-full bg-black flex items-center justify-center overflow-hidden">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />

              {/* PiP Local Video */}
              <div className="absolute top-4 left-4 w-28 h-36 bg-[#242f3d] rounded-xl overflow-hidden border-2 border-[#54a9eb]/50 shadow-lg">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover -scale-x-100"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="relative mb-4">
                <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-[#2b5278] to-[#54a9eb] flex items-center justify-center text-white text-3xl font-bold shadow-xl border-4 border-[#17212b]">
                  {displayName.trim().charAt(0) || <User className="w-12 h-12" />}
                </div>
                {call.status === 'connected' && (
                  <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center text-white border-2 border-[#17212b]">
                    <Volume2 className="w-4 h-4" />
                  </div>
                )}
              </div>

              <h2 className="text-xl font-bold text-white mb-1">{displayName}</h2>
              <p className="text-sm font-medium text-[#54a9eb] mb-2">
                {isIncomingPending
                  ? 'مكالمة واردة...'
                  : call.status === 'calling' || call.status === 'requesting' || call.status === 'ringing'
                  ? 'جارٍ الاتصال (Ringing)...'
                  : call.status === 'connected'
                  ? formatTimer(duration)
                  : 'تم إنهاء المكالمة'}
              </p>
              <p className="text-xs text-slate-400">تشفير خادم وسائط تليجرام عالي الدقة</p>
            </div>
          )}
        </div>

        {/* Bottom Action Controls */}
        <div className="p-6 bg-[#0e1621] border-t border-[#242f3d] flex items-center justify-center gap-4 z-10">
          {isIncomingPending ? (
            <>
              {/* Answer Button */}
              <button
                onClick={handleAnswer}
                className="flex items-center gap-2 px-6 py-3.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg transition transform hover:scale-105"
              >
                <Phone className="w-5 h-5 fill-white" />
                <span>قبول المكالمة</span>
              </button>

              {/* Reject Button */}
              <button
                onClick={onEndCall}
                className="flex items-center gap-2 px-6 py-3.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm shadow-lg transition transform hover:scale-105"
              >
                <PhoneOff className="w-5 h-5" />
                <span>رفض</span>
              </button>
            </>
          ) : (
            <>
              {/* Toggle Microphone */}
              <button
                onClick={toggleMute}
                className={`p-3.5 rounded-full transition shadow-md ${
                  isMuted
                    ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                    : 'bg-[#242f3d] text-white hover:bg-[#2b394a]'
                }`}
                title={isMuted ? 'إلغاء كتم الصوت' : 'كتم الميكروفون'}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              {/* Toggle Video */}
              <button
                onClick={toggleVideo}
                className={`p-3.5 rounded-full transition shadow-md ${
                  !isVideoEnabled
                    ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                    : 'bg-[#242f3d] text-white hover:bg-[#2b394a]'
                }`}
                title={isVideoEnabled ? 'إيقاف الكاميرا' : 'تشغيل الكاميرا'}
              >
                {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </button>

              {/* Speaker Mute */}
              <button
                onClick={() => {
                  if (remoteAudioRef.current) {
                    remoteAudioRef.current.muted = !remoteAudioRef.current.muted;
                    setIsSpeakerMuted(remoteAudioRef.current.muted);
                  }
                }}
                className={`p-3.5 rounded-full transition shadow-md ${
                  isSpeakerMuted
                    ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                    : 'bg-[#242f3d] text-white hover:bg-[#2b394a]'
                }`}
                title={isSpeakerMuted ? 'تشغيل مكبر الصوت' : 'كتم السماعة'}
              >
                {isSpeakerMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>

              {/* End Call Button */}
              <button
                onClick={onEndCall}
                className="p-3.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-lg transition transform hover:scale-105"
                title="إنهاء المكالمة"
              >
                <PhoneOff className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
