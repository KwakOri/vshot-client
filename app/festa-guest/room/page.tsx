'use client';

import {
  FlashOverlay,
  SettingsModal,
} from '@/components';
import { CountdownOverlay } from '@/components/v3/FrameOverlayPreview';
import { RESOLUTION } from '@/constants/constants';
import { getLayoutById } from '@/constants/frame-layouts';
import { useChromaKey } from '@/hooks/useChromaKey';
import { useCompositeCanvas } from '@/hooks/useCompositeCanvas';
import { useMediaDevices } from '@/hooks/useMediaDevices';
import { useSignaling } from '@/hooks/useSignaling';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useGuestManagement } from '@/hooks/v3/useGuestManagement';
import { useV3PhotoCapture } from '@/hooks/v3/useV3PhotoCapture';
import { useAppStore } from '@/lib/store';
import { SessionState, SignalMessage } from '@/types';
import { QRCodeDisplay } from '@/components/QRCodeDisplay';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';

export default function GuestV3RoomPage() {
  const router = useRouter();
  const store = useAppStore();
  const wsUrl = (process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/signaling').replace('/signaling', '/signaling-v3');
  const { connect, sendMessage, on, off, isConnected } = useSignaling({ wsUrl });
  const { localStream, remoteStream, startLocalStream } = useWebRTC({
    sendMessage,
    on,
  });

  const [sessionState, setSessionState] = useState<SessionState>(SessionState.IDLE);
  const [isCameraActive, setIsCameraActive] = useState(false);

  const [hostChromaKeyEnabled, setHostChromaKeyEnabled] = useState(true);
  const [hostSensitivity, setHostSensitivity] = useState(50);
  const [hostSmoothness, setHostSmoothness] = useState(10);
  const [hostChromaKeyColor, setHostChromaKeyColor] = useState('#00ff00');

  const [guestFlipHorizontal, setGuestFlipHorizontal] = useState(store.guestFlipHorizontal);
  const [hostFlipHorizontal, setHostFlipHorizontal] = useState(false);

  const [showFlash, setShowFlash] = useState(false);
  const [remoteAudioEnabled, setRemoteAudioEnabled] = useState(true);
  const [localMicMuted, setLocalMicMuted] = useState(false);

  const [filmId, setFilmId] = useState<string | null>(null);
  const [showQRPopup, setShowQRPopup] = useState(false);
  const [qrCountdown, setQrCountdown] = useState<number | null>(null);

  const { videoDevices, audioDevices, audioOutputDevices, refreshDevices } = useMediaDevices();
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string | null>(
    store.selectedVideoDeviceId
  );
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string | null>(
    store.selectedAudioDeviceId
  );
  const [selectedAudioOutputDeviceId, setSelectedAudioOutputDeviceId] = useState<string | null>(
    store.selectedAudioOutputDeviceId
  );

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pendingVideoDeviceId, setPendingVideoDeviceId] = useState<string | null>(null);
  const [pendingAudioDeviceId, setPendingAudioDeviceId] = useState<string | null>(null);
  const [pendingAudioOutputDeviceId, setPendingAudioOutputDeviceId] = useState<string | null>(null);

  const selectedLayout = getLayoutById(store.selectedFrameLayoutId);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localCanvasRef = useRef<HTMLCanvasElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteCanvasRef = useRef<HTMLCanvasElement>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement>(null);
  const initializedRef = useRef(false);

  const guestManagement = useGuestManagement({
    roomId: store.roomId || '',
    userId: store.userId,
    role: 'guest',
    sendSignal: sendMessage,
  });

  const photoCapture = useV3PhotoCapture({
    roomId: store.roomId || '',
    userId: store.userId,
    role: 'guest',
    backgroundVideo: localVideoRef.current,
    foregroundVideo: remoteVideoRef.current,
    chromaKeySettings: {
      enabled: hostChromaKeyEnabled,
      color: hostChromaKeyColor,
      sensitivity: hostSensitivity,
      smoothness: hostSmoothness,
    },
    guestFlip: guestFlipHorizontal,
    hostFlip: hostFlipHorizontal,
    sendSignal: sendMessage,
    onCaptureComplete: (photoUrl) => {
      console.log('[Guest V3] Photo captured:', photoUrl);
    },
    onMergeComplete: (mergedPhotoUrl) => {
      console.log('[Guest V3] Photos merged:', mergedPhotoUrl);
      setSessionState(SessionState.PROCESSING);
    },
    onSessionComplete: async (sessionId, frameResultUrl) => {
      console.log('[Festa Guest] Session complete:', sessionId);
      setSessionState(SessionState.PROCESSING);
    },
    onError: (error) => {
      console.error('[Guest V3] Capture error:', error);
      setSessionState(SessionState.GUEST_CONNECTED);
    },
  });

  useChromaKey({
    videoElement: localVideoRef.current,
    canvasElement: localCanvasRef.current,
    stream: localStream,
    enabled: false,
    sensitivity: 0,
    smoothness: 0,
    width: RESOLUTION.PHOTO_WIDTH,
    height: RESOLUTION.PHOTO_HEIGHT,
    flipHorizontal: guestFlipHorizontal,
  });

  useChromaKey({
    videoElement: remoteVideoRef.current,
    canvasElement: remoteCanvasRef.current,
    stream: remoteStream,
    enabled: hostChromaKeyEnabled,
    sensitivity: hostSensitivity,
    smoothness: hostSmoothness,
    keyColor: hostChromaKeyColor,
    width: RESOLUTION.VIDEO_WIDTH,
    height: RESOLUTION.VIDEO_HEIGHT,
    isRemoteStream: true,
    flipHorizontal: hostFlipHorizontal,
  });

  useCompositeCanvas({
    compositeCanvas: compositeCanvasRef.current,
    backgroundVideo: localVideoRef.current,
    foregroundCanvas: remoteCanvasRef.current,
    localStream,
    remoteStream,
    width: RESOLUTION.VIDEO_WIDTH,
    height: RESOLUTION.VIDEO_HEIGHT,
    guestFlipHorizontal,
    hostFlipHorizontal,
  });

  useEffect(() => {
    if (initializedRef.current) return;
    if (!store._hasHydrated) return;

    if (!store.roomId || store.role !== 'guest') {
      router.push('/festa-guest/ready');
      return;
    }

    initializedRef.current = true;

    const roomId = store.roomId;
    const userId = store.userId;

    const init = async () => {
      try {
        await startCamera();
        await connect();
        sendMessage({
          type: 'join',
          roomId: roomId!,
          userId: userId,
          role: 'guest',
        });
        setSessionState(SessionState.GUEST_CONNECTED);
      } catch (error) {
        console.error('[Guest V3] Error:', error);
        alert('연결에 실패했습니다.');
        router.push('/festa-guest/ready');
      }
    };

    init();
  }, [store._hasHydrated, store.roomId, store.role]);

  const startCamera = async () => {
    try {
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      };
      if (store.selectedVideoDeviceId) {
        videoConstraints.deviceId = { exact: store.selectedVideoDeviceId };
      }

      const audioConstraints: MediaTrackConstraints | boolean = store.selectedAudioDeviceId
        ? { deviceId: { exact: store.selectedAudioDeviceId } }
        : true;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: audioConstraints,
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      await startLocalStream(() => Promise.resolve(stream));
      setIsCameraActive(true);

      if (store.selectedAudioOutputDeviceId && remoteVideoRef.current) {
        try {
          if ('setSinkId' in remoteVideoRef.current) {
            await (remoteVideoRef.current as any).setSinkId(store.selectedAudioOutputDeviceId);
          }
        } catch (e) {
          console.error('[Guest V3] Failed to set speaker:', e);
        }
      }

      refreshDevices();
    } catch (error) {
      console.error('[Guest V3] Camera error:', error);
      throw error;
    }
  };

  const handleV3Signal = useEffectEvent((message: any) => {
    guestManagement.registerSignalHandlers(message);
    photoCapture.handleSignalMessage(message);

    switch (message.type) {
      case 'guest-joined-v3':
        if (message.guestId === store.userId) {
          setSessionState(SessionState.GUEST_CONNECTED);
          if (message.hostSettings) {
            if (message.hostSettings.selectedFrameLayoutId) {
              store.setSelectedFrameLayoutId(message.hostSettings.selectedFrameLayoutId);
            }
          }
        }
        break;
      case 'countdown-tick-v3':
        setSessionState(SessionState.CAPTURING);
        break;
      case 'capture-now-v3':
        setShowFlash(true);
        setTimeout(() => setShowFlash(false), 300);
        break;
      case 'film-ready-festa':
        setFilmId(message.filmId);
        setShowQRPopup(true);
        setQrCountdown(null);
        break;
      case 'qr-countdown-festa':
        setQrCountdown(message.count);
        break;
      case 'qr-auto-close-festa':
        setShowQRPopup(false);
        setFilmId(null);
        setQrCountdown(null);
        setSessionState(SessionState.GUEST_CONNECTED);
        break;
      case 'session-reset-festa':
        photoCapture.reset();
        setShowQRPopup(false);
        setFilmId(null);
        setQrCountdown(null);
        setSessionState(SessionState.GUEST_CONNECTED);
        break;
    }
  });

  useEffect(() => {
    const v3MessageTypes = [
      'guest-joined-v3',
      'guest-left-v3',
      'waiting-for-guest-v3',
      'host-settings-sync-v3',
      'countdown-tick-v3',
      'capture-now-v3',
      'photos-merged-v3',
      'session-complete-v3',
      'session-reset-festa',
      'film-ready-festa',
      'qr-countdown-festa',
      'qr-auto-close-festa',
    ];

    v3MessageTypes.forEach((type) => {
      on(type, handleV3Signal);
    });

    on('peer-joined', (message: any) => {
      store.setPeerId(message.userId);
    });

    on('peer-left', (message: any) => {
      store.setPeerId(null);
    });
  }, [on]);

  useEffect(() => {
    on('chromakey-settings', (message: any) => {
      if (message.settings) {
        setHostChromaKeyEnabled(message.settings.enabled);
        setHostSensitivity(message.settings.similarity);
        setHostSmoothness(message.settings.smoothness);
        if (message.settings.color) {
          setHostChromaKeyColor(message.settings.color);
        }
      }
    });

    on('host-display-options', (message: any) => {
      if (message.options) {
        setHostFlipHorizontal(message.options.flipHorizontal);
      }
    });

    on('frame-layout-settings', (message: any) => {
      if (message.settings) {
        store.setSelectedFrameLayoutId(message.settings.layoutId);
      }
    });
  }, [on, store]);

  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const toggleGuestFlip = () => {
    const newFlipState = !guestFlipHorizontal;
    setGuestFlipHorizontal(newFlipState);
    store.setGuestFlipHorizontal(newFlipState);

    if (store.roomId) {
      sendMessage({
        type: 'guest-display-options',
        roomId: store.roomId,
        options: { flipHorizontal: newFlipState },
      });
    }
  };

  const toggleLocalMic = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach((track) => { track.enabled = localMicMuted; });
      setLocalMicMuted(!localMicMuted);
    }
  };

  const leaveRoom = () => {
    if (localStream) localStream.getTracks().forEach((track) => track.stop());
    store.setRoomId(null as any);
    store.setRole(null);
    router.push('/festa-guest/ready');
  };

  const openSettings = () => {
    setPendingVideoDeviceId(selectedVideoDeviceId);
    setPendingAudioDeviceId(selectedAudioDeviceId);
    setPendingAudioOutputDeviceId(selectedAudioOutputDeviceId);
    setIsSettingsOpen(true);
  };

  const applySettings = async () => {
    const videoChanged = pendingVideoDeviceId !== selectedVideoDeviceId;
    const audioChanged = pendingAudioDeviceId !== selectedAudioDeviceId;
    const audioOutputChanged = pendingAudioOutputDeviceId !== selectedAudioOutputDeviceId;

    if (audioOutputChanged && pendingAudioOutputDeviceId && remoteVideoRef.current) {
      try {
        if ('setSinkId' in remoteVideoRef.current) {
          await (remoteVideoRef.current as any).setSinkId(pendingAudioOutputDeviceId);
        }
      } catch (error) {
        console.error('[Guest V3] Failed to change speaker:', error);
      }
    }
    setSelectedAudioOutputDeviceId(pendingAudioOutputDeviceId);
    store.setSelectedAudioOutputDeviceId(pendingAudioOutputDeviceId);

    if (videoChanged || audioChanged) {
      setSelectedVideoDeviceId(pendingVideoDeviceId);
      setSelectedAudioDeviceId(pendingAudioDeviceId);
      store.setSelectedVideoDeviceId(pendingVideoDeviceId);
      store.setSelectedAudioDeviceId(pendingAudioDeviceId);

      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }

      try {
        const videoConstraints: MediaTrackConstraints = {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        };
        if (pendingVideoDeviceId) {
          videoConstraints.deviceId = { exact: pendingVideoDeviceId };
        }

        const audioConstraints: MediaTrackConstraints | boolean = pendingAudioDeviceId
          ? { deviceId: { exact: pendingAudioDeviceId } }
          : true;

        const newStream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: audioConstraints,
        });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = newStream;
        }

        await startLocalStream(() => Promise.resolve(newStream));
      } catch (error) {
        console.error('[Guest V3] Failed to restart stream:', error);
        alert('장치 변경에 실패했습니다.');
      }
    }
  };

  useEffect(() => {
    return () => {
      if (localStream) localStream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ background: '#1B1612' }}>
      <FlashOverlay show={showFlash} />
      <CountdownOverlay countdown={photoCapture.countdown} frameLayout={selectedLayout || null} />

      {/* ===== QR Code Popup ===== */}
      {showQRPopup && filmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(27,22,18,0.9)' }}>
          <div
            className="rounded-2xl p-8 max-w-sm w-full flex flex-col items-center gap-5 animate-slide-up"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <p className="font-bold text-xl text-white">촬영 완료!</p>
              </div>
              <p className="text-sm text-white/50">QR 코드를 스캔하여 사진을 다운로드하세요</p>
            </div>

            <div className="bg-white rounded-xl p-3">
              <QRCodeDisplay filmId={filmId} size={200} />
            </div>

            {qrCountdown !== null && (
              <p className="text-sm text-white/40">
                이 팝업은 {qrCountdown}초 후에 닫힙니다
              </p>
            )}

            <button
              onClick={() => {
                if (store.roomId) {
                  sendMessage({ type: 'qr-dismissed-festa', roomId: store.roomId });
                }
                setShowQRPopup(false);
                setFilmId(null);
                setQrCountdown(null);
                setSessionState(SessionState.GUEST_CONNECTED);
              }}
              className="w-full py-3 rounded-xl font-bold text-white text-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg, #FC712B, #FD9319)', boxShadow: '0 4px 20px rgba(252,113,43,0.4)' }}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* ===== FULLSCREEN VIDEO ===== */}
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Checkerboard background */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(45deg, #252017 25%, transparent 25%),
              linear-gradient(-45deg, #252017 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #252017 75%),
              linear-gradient(-45deg, transparent 75%, #252017 75%)
            `,
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
          }}
        />

        {/* Own video when alone */}
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover transition-opacity z-[1] ${remoteStream ? 'opacity-0' : 'opacity-100'}`}
          style={{ transform: guestFlipHorizontal ? 'scaleX(-1)' : 'scaleX(1)' }}
        />

        {/* Composite canvas when connected */}
        <canvas
          ref={compositeCanvasRef}
          className={`absolute max-w-full max-h-full transition-opacity z-[1] ${!remoteStream ? 'opacity-0' : 'opacity-100'}`}
          style={{ aspectRatio: '2/3' }}
        />

        {/* Frame overlay */}
        {selectedLayout?.frameSrc && (
          <img
            src={selectedLayout.frameSrc}
            alt=""
            className="absolute max-w-full max-h-full object-fill pointer-events-none z-[2]"
            style={{ aspectRatio: '2/3', opacity: 1 }}
          />
        )}

        {/* Hidden video/canvas elements */}
        <video ref={remoteVideoRef} autoPlay playsInline muted={!remoteAudioEnabled} className="absolute w-px h-px opacity-0 pointer-events-none" />
        <canvas ref={localCanvasRef} className="absolute w-0 h-0 opacity-0 pointer-events-none" />
        <canvas ref={remoteCanvasRef} className="absolute w-0 h-0 opacity-0 pointer-events-none" />
      </div>

      {/* ===== TOP BAR (floating) ===== */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3">
        {/* Left: Back */}
        <div className="flex items-center gap-2">
          <button
            onClick={leaveRoom}
            className="w-10 h-10 flex items-center justify-center rounded-xl backdrop-blur-md transition hover:bg-white/20"
            style={{ background: 'rgba(0,0,0,0.4)' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Connection indicator */}
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl backdrop-blur-md" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className="text-white/60 text-xs">{isConnected ? 'WS' : 'OFF'}</span>
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-2">
          {/* Flip toggle */}
          <button
            onClick={toggleGuestFlip}
            className={`px-3 py-2 rounded-xl backdrop-blur-md text-xs font-bold transition ${guestFlipHorizontal ? 'text-white' : 'text-white/60 hover:bg-white/20'}`}
            style={{ background: guestFlipHorizontal ? 'rgba(252,113,43,0.8)' : 'rgba(0,0,0,0.4)' }}
          >
            반전
          </button>

          {/* Mic */}
          <button
            onClick={toggleLocalMic}
            className={`w-10 h-10 flex items-center justify-center rounded-xl backdrop-blur-md transition ${localMicMuted ? 'bg-red-500/80' : 'hover:bg-white/20'}`}
            style={localMicMuted ? undefined : { background: 'rgba(0,0,0,0.4)' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {localMicMuted ? (
                <>
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </>
              ) : (
                <>
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </>
              )}
            </svg>
          </button>

          {/* Speaker */}
          <button
            onClick={() => setRemoteAudioEnabled(!remoteAudioEnabled)}
            className={`w-10 h-10 flex items-center justify-center rounded-xl backdrop-blur-md transition ${!remoteAudioEnabled ? 'bg-red-500/80' : 'hover:bg-white/20'}`}
            style={!remoteAudioEnabled ? undefined : { background: 'rgba(0,0,0,0.4)' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {remoteAudioEnabled ? (
                <>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                </>
              ) : (
                <>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </>
              )}
            </svg>
          </button>

          {/* Settings */}
          <button
            onClick={openSettings}
            className="w-10 h-10 flex items-center justify-center rounded-xl backdrop-blur-md transition hover:bg-white/20"
            style={{ background: 'rgba(0,0,0,0.4)' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      {/* ===== BOTTOM STATUS BAR ===== */}
      {sessionState === SessionState.GUEST_CONNECTED && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 rounded-2xl backdrop-blur-xl px-5 py-3 animate-slide-up"
          style={{ background: 'rgba(27,22,18,0.9)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${remoteStream ? 'bg-green-400' : 'bg-orange-400 animate-pulse'}`} />
            <span className="text-white text-sm font-bold">
              {remoteStream ? 'Host 연결됨 - 촬영 대기 중' : 'Host를 기다리는 중...'}
            </span>
          </div>
        </div>
      )}

      {/* Capturing indicator */}
      {sessionState === SessionState.CAPTURING && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 rounded-2xl backdrop-blur-xl px-5 py-3 animate-slide-up"
          style={{ background: 'rgba(27,22,18,0.9)', border: '1px solid rgba(252,113,43,0.3)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
            <span className="text-white text-sm font-bold">
              {photoCapture.countdown !== null && photoCapture.countdown > 0
                ? `${photoCapture.countdown}초 후 촬영`
                : photoCapture.uploadProgress > 0
                ? `업로드 중... ${photoCapture.uploadProgress}%`
                : '촬영 중...'}
            </span>
          </div>
        </div>
      )}

      {/* Processing indicator */}
      {sessionState === SessionState.PROCESSING && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 rounded-2xl backdrop-blur-xl px-5 py-3 animate-slide-up"
          style={{ background: 'rgba(27,22,18,0.9)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-white text-sm font-bold">사진 합성 중...</span>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        videoDevices={videoDevices}
        audioDevices={audioDevices}
        audioOutputDevices={audioOutputDevices}
        selectedVideoDeviceId={pendingVideoDeviceId}
        selectedAudioDeviceId={pendingAudioDeviceId}
        selectedAudioOutputDeviceId={pendingAudioOutputDeviceId}
        onVideoDeviceChange={setPendingVideoDeviceId}
        onAudioDeviceChange={setPendingAudioDeviceId}
        onAudioOutputDeviceChange={setPendingAudioOutputDeviceId}
        onApply={applySettings}
      />
    </div>
  );
}
