'use client';

import {
  ConnectionStatus,
  FlashOverlay,
  HostRoomHeader,
  SettingsModal,
  SettingsPanel,
  VideoDisplayPanel,
} from '@/components';
import { FrameOverlayPreview, CountdownOverlay } from '@/components/v3/FrameOverlayPreview';
import { GuestWaitingIndicator, SessionHistoryPanel } from '@/components/v3/GuestWaitingIndicator';
import { RESOLUTION } from '@/constants/constants';
import { getLayoutById } from '@/constants/frame-layouts';
import { useChromaKey } from '@/hooks/useChromaKey';
import { useCompositeCanvas } from '@/hooks/useCompositeCanvas';
import { useHostSettings } from '@/hooks/useHostSettings';
import { useMediaDevices } from '@/hooks/useMediaDevices';
import { useSignaling } from '@/hooks/useSignaling';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useGuestManagement } from '@/hooks/v3/useGuestManagement';
import { useV3PhotoCapture } from '@/hooks/v3/useV3PhotoCapture';
import { useAppStore } from '@/lib/store';
import { VideoRecorder, downloadVideo } from '@/lib/video-recorder';
import { SessionState, SignalMessage } from '@/types';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

export default function HostV3RoomPage() {
  const router = useRouter();
  const store = useAppStore();
  // Use v3 signaling path
  const wsUrl = (process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/signaling').replace('/signaling', '/signaling-v3');
  const { connect, sendMessage, on, off, isConnected } = useSignaling({ wsUrl });
  const {
    localStream,
    remoteStream,
    startLocalStream,
    createOffer,
    resetForNextGuest,
  } = useWebRTC({ sendMessage, on });

  // Load persisted settings
  const {
    settings: savedSettings,
    isLoaded: settingsLoaded,
    updateSetting,
  } = useHostSettings();

  // Session state
  const [sessionState, setSessionState] = useState<SessionState>(SessionState.IDLE);

  // Camera/Source state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [sourceType, setSourceType] = useState<'camera' | 'screen'>('camera');

  // Chroma key
  const [chromaKeyEnabled, setChromaKeyEnabled] = useState(true);
  const [sensitivity, setSensitivity] = useState(50);
  const [smoothness, setSmoothness] = useState(10);
  const [chromaKeyColor, setChromaKeyColor] = useState('#00ff00');
  const [guestBlurAmount, setGuestBlurAmount] = useState(30);

  // Display options
  const [hostFlipHorizontal, setHostFlipHorizontal] = useState(false);
  const [guestFlipHorizontal, setGuestFlipHorizontal] = useState(false);

  // Flash
  const [showFlash, setShowFlash] = useState(false);

  // Audio
  const [remoteAudioEnabled, setRemoteAudioEnabled] = useState(true);
  const [localMicMuted, setLocalMicMuted] = useState(false);

  // Device selection
  const { audioDevices, audioOutputDevices, refreshDevices } = useMediaDevices();
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string | null>(
    store.selectedAudioDeviceId
  );
  const [selectedAudioOutputDeviceId, setSelectedAudioOutputDeviceId] = useState<string | null>(
    store.selectedAudioOutputDeviceId
  );

  // Settings modal
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pendingAudioDeviceId, setPendingAudioDeviceId] = useState<string | null>(null);
  const [pendingAudioOutputDeviceId, setPendingAudioOutputDeviceId] = useState<string | null>(null);

  // Result state
  const [lastSessionResult, setLastSessionResult] = useState<{
    sessionId: string;
    frameResultUrl: string;
  } | null>(null);

  // Video recording
  const videoRecorderRef = useRef<VideoRecorder | null>(null);
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | null>(null);

  // Frame layout
  const selectedLayout = getLayoutById(store.selectedFrameLayoutId);

  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localCanvasRef = useRef<HTMLCanvasElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteCanvasRef = useRef<HTMLCanvasElement>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement>(null);
  const initializedRef = useRef(false);

  // V3 Guest Management Hook
  const guestManagement = useGuestManagement({
    roomId: store.roomId || '',
    userId: store.userId,
    role: 'host',
    initialHostSettings: {
      chromaKey: {
        enabled: chromaKeyEnabled,
        color: chromaKeyColor,
        similarity: sensitivity / 100,
        smoothness: smoothness / 100,
      },
      selectedFrameLayoutId: store.selectedFrameLayoutId,
    },
    sendSignal: sendMessage,
    resetWebRTCConnection: resetForNextGuest,
    createWebRTCOffer: createOffer,
  });

  // V3 Photo Capture Hook
  const photoCapture = useV3PhotoCapture({
    roomId: store.roomId || '',
    userId: store.userId,
    role: 'host',
    backgroundVideo: remoteVideoRef.current,
    foregroundVideo: localVideoRef.current,
    chromaKeySettings: {
      enabled: chromaKeyEnabled,
      color: chromaKeyColor,
      sensitivity,
      smoothness,
    },
    guestFlip: guestFlipHorizontal,
    hostFlip: hostFlipHorizontal,
    sendSignal: sendMessage,
    onCaptureComplete: (photoUrl) => {
      console.log('[Host V3] Photo captured:', photoUrl);
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 300);
    },
    onMergeComplete: (mergedPhotoUrl) => {
      console.log('[Host V3] Photos merged:', mergedPhotoUrl);
      setSessionState(SessionState.PROCESSING);
    },
    onSessionComplete: (sessionId, frameResultUrl) => {
      console.log('[Host V3] Session complete:', sessionId);
      setLastSessionResult({ sessionId, frameResultUrl });
      setSessionState(SessionState.COMPLETED);
    },
    onError: (error) => {
      console.error('[Host V3] Capture error:', error);
      alert('촬영 중 오류가 발생했습니다: ' + error.message);
      setSessionState(SessionState.GUEST_CONNECTED);
    },
  });

  // Use chroma key for local video (Host's screen share)
  useChromaKey({
    videoElement: localVideoRef.current,
    canvasElement: localCanvasRef.current,
    stream: localStream,
    enabled: chromaKeyEnabled,
    sensitivity,
    smoothness,
    keyColor: chromaKeyColor,
    width: RESOLUTION.VIDEO_WIDTH,
    height: RESOLUTION.VIDEO_HEIGHT,
    flipHorizontal: hostFlipHorizontal,
  });

  // Remote chroma key not needed for host (guest sends raw video)

  // Composite canvas (Guest background + Host foreground)
  useCompositeCanvas({
    compositeCanvas: compositeCanvasRef.current,
    backgroundVideo: remoteVideoRef.current,
    foregroundCanvas: localCanvasRef.current,
    localStream,
    remoteStream,
    width: RESOLUTION.VIDEO_WIDTH,
    height: RESOLUTION.VIDEO_HEIGHT,
    guestFlipHorizontal,
    hostFlipHorizontal,
  });

  // Apply saved settings on load
  useEffect(() => {
    if (!settingsLoaded) return;
    setChromaKeyEnabled(savedSettings.chromaKeyEnabled);
    setSensitivity(savedSettings.sensitivity);
    setSmoothness(savedSettings.smoothness);
    setChromaKeyColor(savedSettings.chromaKeyColor);
    setHostFlipHorizontal(savedSettings.hostFlipHorizontal);
    setGuestFlipHorizontal(savedSettings.guestFlipHorizontal);
    setGuestBlurAmount(savedSettings.guestBlurAmount);
  }, [settingsLoaded]);

  // Initialize and join room
  useEffect(() => {
    if (initializedRef.current) return;
    if (!store._hasHydrated) return;

    if (store.role !== 'host') {
      router.push('/host-v3/ready');
      return;
    }

    initializedRef.current = true;

    const init = async () => {
      try {
        // Generate room ID
        const roomId = uuidv4().slice(0, 6).toUpperCase();
        store.setRoomId(roomId);

        // Connect to signaling server
        await connect();

        // Join room as host
        sendMessage({
          type: 'join',
          roomId,
          userId: store.userId,
          role: 'host',
        });

        setSessionState(SessionState.WAITING_FOR_GUEST);
      } catch (error) {
        console.error('[Host V3] Init error:', error);
        alert('서버 연결에 실패했습니다.');
        router.push('/host-v3/ready');
      }
    };

    init();
  }, [store._hasHydrated, store.role]);

  // Register v3 signal handlers
  useEffect(() => {
    const handleV3Signal = (message: any) => {
      // Set peerId BEFORE guestManagement processes the message,
      // because guestManagement.handleGuestJoined calls createWebRTCOffer
      // which needs peerId to be set in the store to send the offer SDP.
      if (message.type === 'guest-joined-v3' && message.guestId) {
        store.setPeerId(message.guestId);
      }

      // Route to guest management
      guestManagement.registerSignalHandlers(message);
      // Route to photo capture
      photoCapture.handleSignalMessage(message);

      // Handle session state transitions
      switch (message.type) {
        case 'guest-joined-v3':
          setSessionState(SessionState.GUEST_CONNECTED);
          setLastSessionResult(null);
          setRecordedVideoBlob(null);
          break;
        case 'guest-left-v3':
          setSessionState(SessionState.WAITING_FOR_GUEST);
          photoCapture.reset();
          break;
        case 'waiting-for-guest-v3':
          setSessionState(SessionState.WAITING_FOR_GUEST);
          break;
        case 'countdown-tick-v3':
          // Start recording at the beginning of countdown (count === 5)
          if (message.count === 5 && videoRecorderRef.current && !videoRecorderRef.current.isRecording()) {
            videoRecorderRef.current.startRecording(1, 0, (blob) => {
              setRecordedVideoBlob(blob);
            }).catch((err) => console.error('[Host V3] Video recording start error:', err));
          }
          break;
        case 'capture-now-v3':
          // Stop recording 2 seconds after capture
          setTimeout(() => {
            if (videoRecorderRef.current?.isRecording()) {
              videoRecorderRef.current.stopRecording();
            }
          }, 2000);
          break;
      }
    };

    // Register handlers for all v3 message types
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

    // Also register for WebRTC peer events
    on('peer-joined', (message: any) => {
      console.log('[Host V3] Peer joined:', message.userId);
      store.setPeerId(message.userId);
    });

    on('peer-left', (message: any) => {
      console.log('[Host V3] Peer left:', message.userId);
      store.setPeerId(null);
    });
  }, [on, guestManagement.registerSignalHandlers, photoCapture.handleSignalMessage]);

  // Start screen share
  const startScreenShare = async () => {
    try {
      const stream = await startLocalStream(async () => {
        const mediaStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        // Add audio track
        const audioConstraints: MediaTrackConstraints | boolean = store.selectedAudioDeviceId
          ? { deviceId: { exact: store.selectedAudioDeviceId } }
          : true;

        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
        });

        audioStream.getAudioTracks().forEach((track) => {
          mediaStream.addTrack(track);
        });

        return mediaStream;
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      setIsCameraActive(true);
      setSourceType('screen');
      refreshDevices();

      // Handle screen share stop
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          setIsCameraActive(false);
        };
      }

      // Send chroma key settings to guest
      if (store.roomId) {
        sendMessage({
          type: 'chromakey-settings',
          roomId: store.roomId,
          settings: {
            enabled: chromaKeyEnabled,
            color: chromaKeyColor,
            similarity: sensitivity,
            smoothness: smoothness,
          },
        });
      }
    } catch (error) {
      console.error('[Host V3] Screen share error:', error);
    }
  };

  // Start camera
  const startCamera = async () => {
    try {
      const stream = await startLocalStream(async () => {
        const videoConstraints: MediaTrackConstraints = {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        };

        const audioConstraints: MediaTrackConstraints | boolean = store.selectedAudioDeviceId
          ? { deviceId: { exact: store.selectedAudioDeviceId } }
          : true;

        return navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: audioConstraints,
        });
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      setIsCameraActive(true);
      setSourceType('camera');
      refreshDevices();

      // Send chroma key settings
      if (store.roomId) {
        sendMessage({
          type: 'chromakey-settings',
          roomId: store.roomId,
          settings: {
            enabled: chromaKeyEnabled,
            color: chromaKeyColor,
            similarity: sensitivity,
            smoothness: smoothness,
          },
        });
      }
    } catch (error) {
      console.error('[Host V3] Camera error:', error);
    }
  };

  // Handle capture start
  const handleStartCapture = () => {
    if (!guestManagement.currentGuestId) {
      alert('게스트가 연결되어 있지 않습니다.');
      return;
    }

    setSessionState(SessionState.CAPTURING);
    photoCapture.startCapture();
  };

  // Download recorded video
  const handleDownloadVideo = () => {
    if (!recordedVideoBlob) return;
    const ext = recordedVideoBlob.type.includes('mp4') ? 'mp4' : 'webm';
    downloadVideo(recordedVideoBlob, `vshot-v3-${store.roomId}-${Date.now()}.${ext}`);
  };

  // Prepare for next guest
  const handlePrepareForNextGuest = () => {
    setLastSessionResult(null);
    setRecordedVideoBlob(null);
    photoCapture.reset();
    setSessionState(SessionState.WAITING_FOR_GUEST);
  };

  // Toggle local mic
  const toggleLocalMic = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = localMicMuted;
      });
      setLocalMicMuted(!localMicMuted);
    }
  };

  // Leave room
  const leaveRoom = () => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    store.setRoomId(null as any);
    store.setRole(null);
    router.push('/host-v3/ready');
  };

  // Settings modal handlers
  const openSettings = () => {
    setPendingAudioDeviceId(selectedAudioDeviceId);
    setPendingAudioOutputDeviceId(selectedAudioOutputDeviceId);
    setIsSettingsOpen(true);
  };

  const applySettings = async () => {
    const audioOutputChanged = pendingAudioOutputDeviceId !== selectedAudioOutputDeviceId;

    if (audioOutputChanged && pendingAudioOutputDeviceId && remoteVideoRef.current) {
      try {
        if ('setSinkId' in remoteVideoRef.current) {
          await (remoteVideoRef.current as any).setSinkId(pendingAudioOutputDeviceId);
        }
      } catch (error) {
        console.error('[Host V3] Failed to change speaker:', error);
      }
    }
    setSelectedAudioOutputDeviceId(pendingAudioOutputDeviceId);
    store.setSelectedAudioOutputDeviceId(pendingAudioOutputDeviceId);

    const audioChanged = pendingAudioDeviceId !== selectedAudioDeviceId;
    if (audioChanged) {
      setSelectedAudioDeviceId(pendingAudioDeviceId);
      store.setSelectedAudioDeviceId(pendingAudioDeviceId);
    }
  };

  // Send chroma key settings when they change
  const syncChromaKeySettings = useCallback(() => {
    if (store.roomId) {
      sendMessage({
        type: 'chromakey-settings',
        roomId: store.roomId,
        settings: {
          enabled: chromaKeyEnabled,
          color: chromaKeyColor,
          similarity: sensitivity,
          smoothness: smoothness,
        },
      });
    }
  }, [store.roomId, chromaKeyEnabled, chromaKeyColor, sensitivity, smoothness, sendMessage]);

  // Send host display options
  const toggleHostFlip = () => {
    const newFlipState = !hostFlipHorizontal;
    setHostFlipHorizontal(newFlipState);
    updateSetting('hostFlipHorizontal', newFlipState);

    if (store.roomId) {
      sendMessage({
        type: 'host-display-options',
        roomId: store.roomId,
        options: { flipHorizontal: newFlipState },
      });
    }
  };

  // Download result photo
  const downloadResult = async () => {
    if (!lastSessionResult?.frameResultUrl) return;
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const fullUrl = `${API_URL}${lastSessionResult.frameResultUrl}`;

    try {
      const response = await fetch(fullUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `vshot-v3-${store.roomId}-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('[Host V3] Download error:', error);
    }
  };

  // Initialize VideoRecorder
  useEffect(() => {
    videoRecorderRef.current = new VideoRecorder(() => compositeCanvasRef.current);
    return () => {
      videoRecorderRef.current?.dispose();
      videoRecorderRef.current = null;
    };
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Broadcast host display options when guest connects or flip changes
  useEffect(() => {
    if (store.roomId && store.peerId) {
      sendMessage({
        type: 'host-display-options',
        roomId: store.roomId,
        options: { flipHorizontal: hostFlipHorizontal },
      });
      console.log('[Host V3] Sent display options:', { flipHorizontal: hostFlipHorizontal });
    }
  }, [store.roomId, store.peerId, hostFlipHorizontal, sendMessage]);

  // Listen for guest display options
  useEffect(() => {
    on('guest-display-options', (message: any) => {
      if (message.options) {
        setGuestFlipHorizontal(message.options.flipHorizontal);
      }
    });
  }, [on]);

  // Setup remote video
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Setup local video
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  return (
    <div className="flex flex-col h-full p-3 gap-3 overflow-hidden">
      <FlashOverlay show={showFlash} />

      {/* Frame Overlay Preview (renders to composite canvas) */}
      <FrameOverlayPreview
        canvas={compositeCanvasRef.current}
        layout={selectedLayout || null}
        enabled={photoCapture.isCapturing && photoCapture.countdown !== null && photoCapture.countdown > 0}
        opacity={0.3}
      />

      {/* Countdown Overlay */}
      <CountdownOverlay
        countdown={photoCapture.countdown}
        frameLayout={selectedLayout || null}
      />

      {/* Header */}
      <HostRoomHeader
        onBack={leaveRoom}
        backButtonTitle="나가기"
        roomId={store.roomId}
        showRoomCode={isCameraActive}
        isConnected={isConnected}
        peerId={store.peerId}
        remoteStream={remoteStream}
        localMicMuted={localMicMuted}
        onToggleLocalMic={toggleLocalMic}
        remoteAudioEnabled={remoteAudioEnabled}
        onToggleRemoteAudio={() => setRemoteAudioEnabled(!remoteAudioEnabled)}
        onOpenSettings={openSettings}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        videoDevices={[]}
        audioDevices={audioDevices}
        audioOutputDevices={audioOutputDevices}
        selectedVideoDeviceId={null}
        selectedAudioDeviceId={pendingAudioDeviceId}
        selectedAudioOutputDeviceId={pendingAudioOutputDeviceId}
        onVideoDeviceChange={() => {}}
        onAudioDeviceChange={setPendingAudioDeviceId}
        onAudioOutputDeviceChange={setPendingAudioOutputDeviceId}
        onApply={applySettings}
      />

      {/* Video Display */}
      <div className="flex-1 min-h-0 bg-gray-800 rounded-lg p-2 flex items-center justify-center">
        <VideoDisplayPanel
          role="host"
          isActive={isCameraActive}
          remoteStream={remoteStream}
          localVideoRef={localVideoRef}
          localCanvasRef={localCanvasRef}
          remoteVideoRef={remoteVideoRef}
          remoteCanvasRef={remoteCanvasRef}
          compositeCanvasRef={compositeCanvasRef}
          flipHorizontal={hostFlipHorizontal}
          countdown={photoCapture.countdown}
          remoteAudioEnabled={remoteAudioEnabled}
        />
      </div>

      {/* Bottom Panel */}
      <div className="flex-shrink-0 overflow-y-auto max-h-[40vh]">
        {/* Source selection - shown when no source active */}
        {!isCameraActive && (
          <div className="bg-white border-2 border-neutral rounded-lg p-4 shadow-md">
            <p className="text-sm text-dark/70 mb-3">영상 소스를 선택해주세요</p>
            <div className="flex gap-3">
              <button
                onClick={startScreenShare}
                className="flex-1 px-4 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold transition shadow-md"
              >
                화면 공유
              </button>
              <button
                onClick={startCamera}
                className="flex-1 px-4 py-3 bg-secondary hover:bg-secondary-dark text-white rounded-lg font-semibold transition shadow-md"
              >
                카메라
              </button>
            </div>
          </div>
        )}

        {/* Waiting for guest */}
        {isCameraActive && guestManagement.waitingForGuest && (
          <GuestWaitingIndicator
            waitingForGuest={true}
            completedSessionCount={guestManagement.sessionCount}
          />
        )}

        {/* Guest connected - ready to capture */}
        {isCameraActive &&
          !guestManagement.waitingForGuest &&
          sessionState === SessionState.GUEST_CONNECTED && (
            <div className="space-y-3">
              {/* Chroma Key Settings */}
              <SettingsPanel title="크로마키 설정">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-dark">크로마키</span>
                    <button
                      onClick={() => {
                        const newVal = !chromaKeyEnabled;
                        setChromaKeyEnabled(newVal);
                        updateSetting('chromaKeyEnabled', newVal);
                        syncChromaKeySettings();
                      }}
                      className={`px-3 py-1 rounded-lg text-sm font-semibold transition ${
                        chromaKeyEnabled
                          ? 'bg-primary text-white'
                          : 'bg-neutral text-dark'
                      }`}
                    >
                      {chromaKeyEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  {chromaKeyEnabled && (
                    <>
                      <div>
                        <label className="text-xs text-dark/60 block mb-1">크로마키 색상</label>
                        <input
                          type="color"
                          value={chromaKeyColor}
                          onChange={(e) => {
                            setChromaKeyColor(e.target.value);
                            updateSetting('chromaKeyColor', e.target.value);
                          }}
                          onBlur={syncChromaKeySettings}
                          className="w-full h-8 rounded cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-dark/60 block mb-1">
                          민감도: {sensitivity}
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={sensitivity}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setSensitivity(val);
                            updateSetting('sensitivity', val);
                          }}
                          onMouseUp={syncChromaKeySettings}
                          onTouchEnd={syncChromaKeySettings}
                          className="w-full accent-primary"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-dark/60 block mb-1">
                          부드러움: {smoothness}
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="50"
                          value={smoothness}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setSmoothness(val);
                            updateSetting('smoothness', val);
                          }}
                          onMouseUp={syncChromaKeySettings}
                          onTouchEnd={syncChromaKeySettings}
                          className="w-full accent-primary"
                        />
                      </div>
                    </>
                  )}

                  {/* Flip toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-dark">좌우 반전</span>
                    <button
                      onClick={toggleHostFlip}
                      className={`px-3 py-1 rounded-lg text-sm font-semibold transition ${
                        hostFlipHorizontal
                          ? 'bg-primary text-white'
                          : 'bg-neutral text-dark'
                      }`}
                    >
                      {hostFlipHorizontal ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
              </SettingsPanel>

              {/* Capture button */}
              <button
                onClick={handleStartCapture}
                disabled={!remoteStream}
                className="w-full px-6 py-4 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white rounded-lg font-bold text-lg transition shadow-lg active:scale-95 touch-manipulation"
              >
                촬영 시작
              </button>
            </div>
          )}

        {/* Capturing state */}
        {sessionState === SessionState.CAPTURING && (
          <div className="bg-white border-2 border-primary rounded-lg p-4 shadow-md">
            <div className="flex items-center justify-center gap-4">
              <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse" />
              <div className="text-lg font-semibold text-dark">
                {photoCapture.countdown !== null && photoCapture.countdown > 0
                  ? `${photoCapture.countdown}초 후 촬영`
                  : photoCapture.uploadProgress > 0
                  ? `업로드 중... ${photoCapture.uploadProgress}%`
                  : '촬영 준비 중...'}
              </div>
            </div>
          </div>
        )}

        {/* Processing state */}
        {sessionState === SessionState.PROCESSING && (
          <div className="bg-white border-2 border-secondary rounded-lg p-4 shadow-md">
            <div className="flex items-center justify-center gap-3">
              <div className="w-8 h-8 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
              <div className="text-sm font-semibold text-dark">사진 합성 중...</div>
            </div>
          </div>
        )}

        {/* Completed state */}
        {sessionState === SessionState.COMPLETED && lastSessionResult && (
          <div className="space-y-3">
            <div className="bg-white border-2 border-primary rounded-lg p-4 shadow-md">
              <div className="flex items-center justify-center gap-2 p-2 bg-green-100 rounded-lg mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span className="text-sm text-green-700 font-semibold">촬영 완료!</span>
              </div>

              {/* Result preview */}
              {lastSessionResult.frameResultUrl && (
                <div className="mb-3 flex justify-center">
                  <img
                    src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${lastSessionResult.frameResultUrl}`}
                    alt="촬영 결과"
                    className="max-h-48 rounded-lg shadow-md"
                  />
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={downloadResult}
                  className="flex-1 px-4 py-3 bg-secondary hover:bg-secondary-dark text-white rounded-lg font-semibold transition shadow-md"
                >
                  사진 다운로드
                </button>
                {recordedVideoBlob && (
                  <button
                    onClick={handleDownloadVideo}
                    className="flex-1 px-4 py-3 bg-dark hover:bg-dark/80 text-white rounded-lg font-semibold transition shadow-md"
                  >
                    영상 다운로드
                  </button>
                )}
              </div>
              <button
                onClick={handlePrepareForNextGuest}
                className="w-full mt-2 px-4 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold transition shadow-md"
              >
                다음 게스트
              </button>
            </div>
          </div>
        )}

        {/* Session History */}
        {guestManagement.completedSessions.length > 0 && (
          <div className="mt-3">
            <SessionHistoryPanel
              completedSessions={guestManagement.completedSessions.map((s) => ({
                sessionId: s.sessionId,
                guestId: s.guestId,
                frameResultUrl: s.frameResultUrl,
              }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
