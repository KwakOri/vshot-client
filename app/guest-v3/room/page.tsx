'use client';

import {
  ConnectionStatus,
  FlashOverlay,
  SettingsModal,
  VideoDisplayPanel,
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
import { generatePhotoFrameBlobWithLayout } from '@/lib/frame-generator';
import { useAppStore } from '@/lib/store';
import { SessionState, SignalMessage } from '@/types';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

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

  const [lastSessionResult, setLastSessionResult] = useState<{
    sessionId: string;
    frameResultUrl: string;
  } | null>(null);

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
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 300);
    },
    onMergeComplete: (mergedPhotoUrl) => {
      console.log('[Guest V3] Photos merged:', mergedPhotoUrl);
      setSessionState(SessionState.PROCESSING);
    },
    onSessionComplete: async (sessionId, frameResultUrl) => {
      console.log('[Guest V3] Session complete:', sessionId);
      const layout = getLayoutById(store.selectedFrameLayoutId);
      if (layout) {
        try {
          const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
          const fullUrl = `${API_URL}${frameResultUrl}`;
          const framedBlobUrl = await generatePhotoFrameBlobWithLayout([fullUrl], layout);
          setLastSessionResult({ sessionId, frameResultUrl: framedBlobUrl });
        } catch (err) {
          console.error('[Guest V3] Failed to apply frame:', err);
          setLastSessionResult({ sessionId, frameResultUrl });
        }
      } else {
        setLastSessionResult({ sessionId, frameResultUrl });
      }
      setSessionState(SessionState.COMPLETED);
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
      router.push('/guest-v3/ready');
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
        router.push('/guest-v3/ready');
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

  useEffect(() => {
    const handleV3Signal = (message: any) => {
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
      }
    };

    const v3MessageTypes = [
      'guest-joined-v3',
      'guest-left-v3',
      'waiting-for-guest-v3',
      'host-settings-sync-v3',
      'countdown-tick-v3',
      'capture-now-v3',
      'photos-merged-v3',
      'session-complete-v3',
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
  }, [on, guestManagement.registerSignalHandlers, photoCapture.handleSignalMessage]);

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
      audioTracks.forEach((track) => {
        track.enabled = localMicMuted;
      });
      setLocalMicMuted(!localMicMuted);
    }
  };

  const leaveRoom = () => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    store.setRoomId(null as any);
    store.setRole(null);
    router.push('/guest-v3/ready');
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

  const downloadResult = async () => {
    if (!lastSessionResult?.frameResultUrl) return;

    const url = lastSessionResult.frameResultUrl;
    const isBlobUrl = url.startsWith('blob:');

    try {
      let downloadUrl: string;
      if (isBlobUrl) {
        downloadUrl = url;
      } else {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const response = await fetch(`${API_URL}${url}`);
        const blob = await response.blob();
        downloadUrl = URL.createObjectURL(blob);
      }

      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `vshot-v3-${store.roomId}-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (!isBlobUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    } catch (error) {
      console.error('[Guest V3] Download error:', error);
    }
  };

  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // ─── Result View ───
  if (sessionState === SessionState.COMPLETED && lastSessionResult) {
    return (
      <div className="flex flex-col h-full overflow-hidden bg-dark relative">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at center top, rgba(252, 113, 43, 0.08) 0%, transparent 60%)',
        }} />

        {/* Top bar */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 relative z-10">
          <h1 className="font-display text-lg font-bold text-white">촬영 완료</h1>
          <button
            onClick={leaveRoom}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-full font-semibold text-sm transition"
          >
            나가기
          </button>
        </div>

        {/* Photo result */}
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-6 relative z-10">
          <div className="animate-bounce-in max-w-sm w-full">
            {lastSessionResult.frameResultUrl ? (
              <div className="relative">
                <img
                  src={lastSessionResult.frameResultUrl.startsWith('blob:')
                    ? lastSessionResult.frameResultUrl
                    : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${lastSessionResult.frameResultUrl}`
                  }
                  alt="촬영 결과"
                  className="w-full rounded-2xl shadow-2xl"
                  style={{ boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)' }}
                />
                {/* Photo border glow */}
                <div className="absolute -inset-1 rounded-2xl opacity-20 blur-md pointer-events-none"
                  style={{ background: 'linear-gradient(135deg, #FC712B, #FD9319)' }} />
              </div>
            ) : (
              <div className="text-white/30 text-center py-12">결과를 불러오는 중...</div>
            )}
          </div>
        </div>

        {/* Download button */}
        <div className="flex-shrink-0 p-4 pb-8 relative z-10">
          <button
            onClick={downloadResult}
            className="booth-btn w-full py-4 rounded-xl font-display font-bold text-base shadow-lg touch-manipulation"
            style={{
              background: 'linear-gradient(135deg, #FC712B 0%, #FD9319 100%)',
              color: 'white',
              boxShadow: '0 8px 24px rgba(252, 113, 43, 0.3)',
            }}
          >
            <div className="flex items-center justify-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              사진 저장하기
            </div>
          </button>
        </div>
      </div>
    );
  }

  // ─── Main Video View ───
  return (
    <div className="flex flex-col h-full p-3 gap-3 overflow-hidden bg-light">
      <FlashOverlay show={showFlash} />

      <CountdownOverlay
        countdown={photoCapture.countdown}
        frameLayout={selectedLayout || null}
      />

      {/* Navbar */}
      <div className="flex-shrink-0 flex items-center gap-2 booth-card px-3 py-2">
        <button
          onClick={leaveRoom}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center bg-neutral/30 hover:bg-neutral/50 rounded-full transition"
          title="나가기"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        {store.roomId && (
          <div className="px-3 py-1.5 rounded-full shadow-sm" style={{
            background: 'linear-gradient(135deg, #FC712B 0%, #FD9319 100%)',
          }}>
            <span className="text-xs font-display font-bold text-white tracking-wider">{store.roomId}</span>
          </div>
        )}

        <ConnectionStatus
          isConnected={isConnected}
          peerId={store.peerId}
          remoteStream={remoteStream}
          role="guest"
        />

        <div className="flex-1" />

        {/* Mic mute */}
        <button
          onClick={toggleLocalMic}
          className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition ${
            localMicMuted ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-neutral/30 hover:bg-neutral/50 text-dark'
          }`}
          title={localMicMuted ? '마이크 켜기' : '마이크 끄기'}
        >
          {localMicMuted ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>

        {/* Remote audio */}
        <button
          onClick={() => setRemoteAudioEnabled(!remoteAudioEnabled)}
          className={`flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition ${
            remoteAudioEnabled ? 'bg-neutral/30 hover:bg-neutral/50 text-dark' : 'bg-red-500 hover:bg-red-600 text-white'
          }`}
          title={remoteAudioEnabled ? '상대방 음성 끄기' : '상대방 음성 켜기'}
        >
          {remoteAudioEnabled ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          )}
        </button>

        {/* Settings */}
        <button
          onClick={openSettings}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center bg-neutral/30 hover:bg-neutral/50 rounded-full transition"
          title="설정"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
        </button>
      </div>

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

      {/* Video Display */}
      <div className="flex-1 min-h-0 booth-video-container p-1.5 flex items-center justify-center">
        <VideoDisplayPanel
          role="guest"
          isActive={isCameraActive}
          remoteStream={remoteStream}
          localVideoRef={localVideoRef}
          localCanvasRef={localCanvasRef}
          remoteVideoRef={remoteVideoRef}
          remoteCanvasRef={remoteCanvasRef}
          compositeCanvasRef={compositeCanvasRef}
          flipHorizontal={guestFlipHorizontal}
          countdown={photoCapture.countdown}
          remoteAudioEnabled={remoteAudioEnabled}
          frameOverlaySrc={selectedLayout?.frameSrc}
          frameOverlayVisible={true}
          frameOverlayOpacity={1}
        />
      </div>

      {/* Bottom Panel */}
      <div className="flex-shrink-0 overflow-y-auto max-h-[40vh] booth-scroll">
        {/* Capturing state */}
        {sessionState === SessionState.CAPTURING && (
          <div className="booth-card p-5 animate-slide-up" style={{ borderColor: '#FC712B' }}>
            <div className="flex items-center justify-center gap-3">
              <div className="relative">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-recording-pulse" />
                <div className="absolute inset-0 w-3 h-3 bg-red-500 rounded-full animate-pulse-ring" />
              </div>
              <div className="font-display text-lg font-bold text-dark">
                {photoCapture.countdown !== null && photoCapture.countdown > 0
                  ? `${photoCapture.countdown}초 후 촬영`
                  : photoCapture.uploadProgress > 0
                  ? `업로드 중... ${photoCapture.uploadProgress}%`
                  : '촬영 중...'}
              </div>
            </div>
          </div>
        )}

        {/* Processing state */}
        {sessionState === SessionState.PROCESSING && (
          <div className="booth-card-warm p-5 animate-slide-up">
            <div className="flex items-center justify-center gap-3">
              <div className="w-6 h-6 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
              <div className="font-display text-sm font-semibold text-dark">사진 합성 중...</div>
            </div>
          </div>
        )}

        {/* Default state - waiting for host action */}
        {sessionState === SessionState.GUEST_CONNECTED && (
          <div className="booth-card px-4 py-3 animate-fade-in">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-2 h-2 rounded-full ${remoteStream ? 'bg-green-500' : 'bg-secondary animate-pulse'}`} />
                <span className="text-sm text-dark/60 font-medium">
                  {remoteStream ? 'Host 연결됨 - 촬영 대기 중' : 'Host를 기다리는 중...'}
                </span>
              </div>

              <button
                onClick={toggleGuestFlip}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${
                  guestFlipHorizontal
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'bg-neutral/30 text-dark/50 border border-neutral/50'
                }`}
              >
                반전
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
