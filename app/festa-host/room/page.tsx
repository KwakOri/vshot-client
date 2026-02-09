'use client';

import {
  ConnectionStatus,
  FlashOverlay,
  HostRoomHeader,
  SettingsModal,
  SettingsPanel,
  VideoDisplayPanel,
} from '@/components';
import { CountdownOverlay } from '@/components/v3/FrameOverlayPreview';
import { GuestWaitingIndicator } from '@/components/v3/GuestWaitingIndicator';
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
import { generatePhotoFrameBlobWithLayout } from '@/lib/frame-generator';
import { useAppStore } from '@/lib/store';
import { VideoRecorder, downloadVideo } from '@/lib/video-recorder';
import { composeVideoWithWebGL, VideoSource } from '@/lib/webgl-video-composer';
import { uploadBlob } from '@/lib/files';
import { createFilm } from '@/lib/films';
import { nanoid } from 'nanoid';
import { SessionState, SignalMessage } from '@/types';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

export default function HostV3RoomPage() {
  const router = useRouter();
  const store = useAppStore();
  const wsUrl = (process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/signaling').replace('/signaling', '/signaling-v3');
  const { connect, sendMessage, on, off, isConnected } = useSignaling({ wsUrl });
  const {
    localStream,
    remoteStream,
    startLocalStream,
    createOffer,
    resetForNextGuest,
  } = useWebRTC({ sendMessage, on });

  const {
    settings: savedSettings,
    isLoaded: settingsLoaded,
    updateSetting,
  } = useHostSettings();

  const [sessionState, setSessionState] = useState<SessionState>(SessionState.IDLE);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [sourceType, setSourceType] = useState<'camera' | 'screen'>('camera');

  const [chromaKeyEnabled, setChromaKeyEnabled] = useState(true);
  const [sensitivity, setSensitivity] = useState(50);
  const [smoothness, setSmoothness] = useState(10);
  const [chromaKeyColor, setChromaKeyColor] = useState('#00ff00');
  const [guestBlurAmount, setGuestBlurAmount] = useState(30);

  const [hostFlipHorizontal, setHostFlipHorizontal] = useState(false);
  const [guestFlipHorizontal, setGuestFlipHorizontal] = useState(false);

  const [showFlash, setShowFlash] = useState(false);
  const [remoteAudioEnabled, setRemoteAudioEnabled] = useState(true);
  const [localMicMuted, setLocalMicMuted] = useState(false);

  const { audioDevices, audioOutputDevices, refreshDevices } = useMediaDevices();
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string | null>(
    store.selectedAudioDeviceId
  );
  const [selectedAudioOutputDeviceId, setSelectedAudioOutputDeviceId] = useState<string | null>(
    store.selectedAudioOutputDeviceId
  );

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pendingAudioDeviceId, setPendingAudioDeviceId] = useState<string | null>(null);
  const [pendingAudioOutputDeviceId, setPendingAudioOutputDeviceId] = useState<string | null>(null);

  const [isGuestViewingQR, setIsGuestViewingQR] = useState(false);

  const [lastSessionResult, setLastSessionResult] = useState<{
    sessionId: string;
    frameResultUrl: string;
  } | null>(null);

  const videoRecorderRef = useRef<VideoRecorder | null>(null);
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | null>(null);
  const recordedVideoBlobRef = useRef<Blob | null>(null);
  const [isVideoProcessing, setIsVideoProcessing] = useState(false);
  const [videoProcessingProgress, setVideoProcessingProgress] = useState('');

  const selectedLayout = getLayoutById(store.selectedFrameLayoutId);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localCanvasRef = useRef<HTMLCanvasElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteCanvasRef = useRef<HTMLCanvasElement>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement>(null);
  const initializedRef = useRef(false);

  // Chroma key settings panel toggle
  const [showChromaSettings, setShowChromaSettings] = useState(false);

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
    onSessionComplete: async (sessionId, frameResultUrl) => {
      console.log('[Festa Host] Session complete:', sessionId);
      const filmId = nanoid(8);
      let framedBlobUrl: string | null = null;
      const layout = getLayoutById(store.selectedFrameLayoutId);
      if (layout) {
        try {
          const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
          const fullUrl = `${API_URL}${frameResultUrl}`;
          framedBlobUrl = await generatePhotoFrameBlobWithLayout([fullUrl], layout, filmId);
          setLastSessionResult({ sessionId, frameResultUrl: framedBlobUrl });
        } catch (err) {
          console.error('[Festa Host] Failed to apply frame:', err);
          setLastSessionResult({ sessionId, frameResultUrl });
        }
      } else {
        setLastSessionResult({ sessionId, frameResultUrl });
      }
      setSessionState(SessionState.COMPLETED);

      // Film auto-creation (background)
      // Video post-processing may still be in progress, so we wait for it
      (async () => {
        try {
          // 1. Upload photo (with QR code already rendered)
          const photoSrc = framedBlobUrl || frameResultUrl;
          let photoFileId: string | undefined;
          if (photoSrc) {
            const photoResponse = await fetch(photoSrc.startsWith('blob:') ? photoSrc : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${photoSrc}`);
            const photoBlob = await photoResponse.blob();
            const photoUpload = await uploadBlob(photoBlob, `festa-photo-${sessionId}.png`);
            if (photoUpload.success && photoUpload.file) {
              photoFileId = photoUpload.file.id;
            }
          }

          // 2. Wait for video post-processing to complete (poll ref)
          let videoFileId: string | undefined;
          const maxWait = 30000; // 30s max
          const pollInterval = 500;
          let waited = 0;
          while (!recordedVideoBlobRef.current && waited < maxWait) {
            await new Promise((r) => setTimeout(r, pollInterval));
            waited += pollInterval;
          }

          const videoBlob = recordedVideoBlobRef.current;
          if (videoBlob) {
            const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
            const videoUpload = await uploadBlob(videoBlob, `festa-video-${sessionId}.${ext}`);
            if (videoUpload.success && videoUpload.file) {
              videoFileId = videoUpload.file.id;
            }
          }

          // 3. Create Film record with pre-generated filmId
          if (photoFileId) {
            const filmRequest = {
              id: filmId,
              roomId: store.roomId!,
              sessionId,
              photoFileId,
              videoFileId,
            };
            console.log('[Festa Host] Creating film with:', JSON.stringify(filmRequest));
            const filmResult = await createFilm(filmRequest);
            console.log('[Festa Host] Film creation result:', JSON.stringify(filmResult));

            // Notify guest that film is ready (show QR popup)
            sendMessage({ type: 'film-ready-festa', roomId: store.roomId!, filmId });
            setIsGuestViewingQR(true);
          }
        } catch (err) {
          console.error('[Festa Host] Film creation failed:', err);
        }
      })();
    },
    onError: (error) => {
      console.error('[Host V3] Capture error:', error);
      alert('촬영 중 오류가 발생했습니다: ' + error.message);
      setSessionState(SessionState.GUEST_CONNECTED);
    },
  });

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

  useEffect(() => {
    if (initializedRef.current) return;
    if (!store._hasHydrated) return;

    if (store.role !== 'host') {
      router.push('/festa-host/ready');
      return;
    }

    initializedRef.current = true;

    const init = async () => {
      try {
        const roomId = uuidv4().slice(0, 6).toUpperCase();
        store.setRoomId(roomId);
        await connect();
        sendMessage({
          type: 'join',
          roomId,
          userId: store.userId,
          role: 'host',
          mode: 'festa',
        });
        setSessionState(SessionState.WAITING_FOR_GUEST);
      } catch (error) {
        console.error('[Festa Host] Init error:', error);
        alert('서버 연결에 실패했습니다.');
        router.push('/festa-host/ready');
      }
    };

    init();
  }, [store._hasHydrated, store.role]);

  useEffect(() => {
    const handleV3Signal = (message: any) => {
      if (message.type === 'guest-joined-v3' && message.guestId) {
        store.setPeerId(message.guestId);
      }

      guestManagement.registerSignalHandlers(message);
      photoCapture.handleSignalMessage(message);

      switch (message.type) {
        case 'guest-joined-v3':
          setSessionState(SessionState.GUEST_CONNECTED);
          setLastSessionResult(null);
          setRecordedVideoBlob(null);
          recordedVideoBlobRef.current = null;
          setIsGuestViewingQR(false);
          break;
        case 'guest-left-v3':
          setSessionState(SessionState.WAITING_FOR_GUEST);
          photoCapture.reset();
          break;
        case 'waiting-for-guest-v3':
          setSessionState(SessionState.WAITING_FOR_GUEST);
          break;
        case 'countdown-tick-v3':
          if (message.count === 5 && videoRecorderRef.current && !videoRecorderRef.current.isRecording()) {
            videoRecorderRef.current.startRecording(1, 0, async (rawBlob) => {
              const layout = getLayoutById(store.selectedFrameLayoutId);
              if (layout && layout.frameSrc) {
                try {
                  setIsVideoProcessing(true);
                  const videoSource: VideoSource = {
                    blob: rawBlob,
                    startTime: 0,
                    endTime: 0,
                    photoNumber: 1,
                  };
                  const composedBlob = await composeVideoWithWebGL(
                    [videoSource],
                    {
                      width: RESOLUTION.VIDEO_WIDTH,
                      height: RESOLUTION.VIDEO_HEIGHT,
                      frameRate: 24,
                      layout,
                    },
                    (msg) => setVideoProcessingProgress(msg)
                  );
                  setRecordedVideoBlob(composedBlob);
                  recordedVideoBlobRef.current = composedBlob;
                } catch (err) {
                  console.error('[Festa Host] Video post-processing failed:', err);
                  setRecordedVideoBlob(rawBlob);
                  recordedVideoBlobRef.current = rawBlob;
                } finally {
                  setIsVideoProcessing(false);
                  setVideoProcessingProgress('');
                }
              } else {
                setRecordedVideoBlob(rawBlob);
                recordedVideoBlobRef.current = rawBlob;
              }
            }).catch((err) => console.error('[Festa Host] Video recording start error:', err));
          }
          break;
        case 'capture-now-v3':
          setTimeout(() => {
            if (videoRecorderRef.current?.isRecording()) {
              videoRecorderRef.current.stopRecording();
            }
          }, 2000);
          break;
        case 'qr-dismissed-festa':
          setIsGuestViewingQR(false);
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
      'session-reset-festa',
      'film-ready-festa',
      'qr-dismissed-festa',
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

  const startScreenShare = async () => {
    try {
      const stream = await startLocalStream(async () => {
        const mediaStream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });

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

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          setIsCameraActive(false);
        };
      }

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

  const handleStartCapture = () => {
    if (!guestManagement.currentGuestId) {
      alert('게스트가 연결되어 있지 않습니다.');
      return;
    }
    setSessionState(SessionState.CAPTURING);
    photoCapture.startCapture();
  };

  const handleDownloadVideo = () => {
    if (!recordedVideoBlob) return;
    const ext = recordedVideoBlob.type.includes('mp4') ? 'mp4' : 'webm';
    downloadVideo(recordedVideoBlob, `vshot-v3-${store.roomId}-${Date.now()}.${ext}`);
  };

  const handlePrepareForNextGuest = () => {
    // Festa: keep connection, only reset session state
    sendMessage({ type: 'session-reset-festa', roomId: store.roomId! });
    setLastSessionResult(null);
    setRecordedVideoBlob(null);
    recordedVideoBlobRef.current = null;
    setIsVideoProcessing(false);
    setVideoProcessingProgress('');
    photoCapture.reset();
    setSessionState(SessionState.GUEST_CONNECTED); // Not WAITING_FOR_GUEST - connection maintained
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
    router.push('/festa-host/ready');
  };

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
      console.error('[Host V3] Download error:', error);
    }
  };

  useEffect(() => {
    videoRecorderRef.current = new VideoRecorder(() => compositeCanvasRef.current);
    return () => {
      videoRecorderRef.current?.dispose();
      videoRecorderRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (store.roomId && store.peerId) {
      sendMessage({
        type: 'host-display-options',
        roomId: store.roomId,
        options: { flipHorizontal: hostFlipHorizontal },
      });
    }
  }, [store.roomId, store.peerId, hostFlipHorizontal, sendMessage]);

  useEffect(() => {
    on('guest-display-options', (message: any) => {
      if (message.options) {
        setGuestFlipHorizontal(message.options.flipHorizontal);
      }
    });
  }, [on]);

  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  return (
    <div className="flex flex-col h-full p-3 gap-3 overflow-hidden bg-light">
      <FlashOverlay show={showFlash} />

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
      <div className="flex-1 min-h-0 booth-video-container p-1.5 flex items-center justify-center">
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
          frameOverlaySrc={selectedLayout?.frameSrc}
          frameOverlayVisible={true}
          frameOverlayOpacity={1}
        />
      </div>

      {/* Bottom Panel */}
      <div className="flex-shrink-0 overflow-y-auto max-h-[40vh] booth-scroll">
        {/* Source selection */}
        {!isCameraActive && (
          <div className="booth-card-warm p-5 animate-slide-up">
            <p className="font-display text-xs font-semibold text-dark/40 uppercase tracking-wider mb-3">
              영상 소스 선택
            </p>
            <div className="flex gap-3">
              <button
                onClick={startScreenShare}
                className="booth-btn flex-1 flex flex-col items-center gap-2 px-4 py-4 bg-primary hover:bg-primary-dark text-white rounded-xl font-semibold transition shadow-md shadow-primary/15"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                <span className="text-sm">화면 공유</span>
              </button>
              <button
                onClick={startCamera}
                className="booth-btn flex-1 flex flex-col items-center gap-2 px-4 py-4 bg-secondary hover:bg-secondary-dark text-white rounded-xl font-semibold transition shadow-md shadow-secondary/15"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span className="text-sm">카메라</span>
              </button>
            </div>
          </div>
        )}

        {/* Waiting for guest */}
        {isCameraActive && guestManagement.waitingForGuest && (
          <div className="animate-slide-up">
            <GuestWaitingIndicator
              waitingForGuest={true}
              completedSessionCount={guestManagement.sessionCount}
            />
          </div>
        )}

        {/* Guest connected - ready to capture */}
        {isCameraActive &&
          !guestManagement.waitingForGuest &&
          sessionState === SessionState.GUEST_CONNECTED && (
            <div className="space-y-3 animate-slide-up">
              {/* Chroma Key Toggle + Capture */}
              <div className="booth-card p-4">
                {/* Quick controls row */}
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => {
                      const newVal = !chromaKeyEnabled;
                      setChromaKeyEnabled(newVal);
                      updateSetting('chromaKeyEnabled', newVal);
                      syncChromaKeySettings();
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${
                      chromaKeyEnabled
                        ? 'bg-green-500/10 text-green-600 border border-green-500/20'
                        : 'bg-neutral/30 text-dark/50 border border-neutral/50'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${chromaKeyEnabled ? 'bg-green-500' : 'bg-neutral'}`} />
                    크로마키
                  </button>

                  <button
                    onClick={toggleHostFlip}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${
                      hostFlipHorizontal
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'bg-neutral/30 text-dark/50 border border-neutral/50'
                    }`}
                  >
                    반전
                  </button>

                  <button
                    onClick={() => setShowChromaSettings(!showChromaSettings)}
                    className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-neutral/30 text-dark/60 hover:bg-neutral/50 transition"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                    설정
                  </button>
                </div>

                {/* Expanded chroma settings */}
                {showChromaSettings && chromaKeyEnabled && (
                  <div className="space-y-3 pt-3 border-t border-neutral/30 animate-slide-up">
                    <div>
                      <label className="text-xs text-dark/50 block mb-1.5">크로마키 색상</label>
                      <input
                        type="color"
                        value={chromaKeyColor}
                        onChange={(e) => {
                          setChromaKeyColor(e.target.value);
                          updateSetting('chromaKeyColor', e.target.value);
                        }}
                        onBlur={syncChromaKeySettings}
                        className="w-full h-8 rounded-lg cursor-pointer border border-neutral/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-dark/50 flex justify-between mb-1.5">
                        <span>민감도</span>
                        <span className="font-mono text-dark/40">{sensitivity}</span>
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
                      <label className="text-xs text-dark/50 flex justify-between mb-1.5">
                        <span>부드러움</span>
                        <span className="font-mono text-dark/40">{smoothness}</span>
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
                  </div>
                )}
              </div>

              {/* Capture button */}
              <button
                onClick={handleStartCapture}
                disabled={!remoteStream}
                className="booth-btn w-full py-4 bg-primary hover:bg-primary-dark disabled:opacity-40 text-white rounded-xl font-display font-bold text-lg shadow-lg shadow-primary/25 touch-manipulation transition-all"
              >
                <div className="flex items-center justify-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  촬영 시작
                </div>
              </button>
            </div>
          )}

        {/* Capturing state */}
        {sessionState === SessionState.CAPTURING && (
          <div className="booth-card p-5 border-primary/30 animate-slide-up" style={{ borderColor: '#FC712B' }}>
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
                  : '촬영 준비 중...'}
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

        {/* Completed state */}
        {sessionState === SessionState.COMPLETED && lastSessionResult && (
          <div className="space-y-3 animate-slide-up">
            <div className="booth-card p-5">
              {/* Success badge */}
              <div className="flex items-center justify-center gap-2 p-2.5 bg-green-50 rounded-xl mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span className="text-sm text-green-700 font-display font-bold">촬영 완료!</span>
              </div>

              {/* Result preview */}
              {lastSessionResult.frameResultUrl && (
                <div className="mb-4 flex justify-center">
                  <img
                    src={lastSessionResult.frameResultUrl.startsWith('blob:')
                      ? lastSessionResult.frameResultUrl
                      : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${lastSessionResult.frameResultUrl}`
                    }
                    alt="촬영 결과"
                    className="max-h-48 rounded-xl shadow-lg"
                  />
                </div>
              )}

              {/* Download buttons */}
              <div className="flex gap-2">
                <button
                  onClick={downloadResult}
                  className="booth-btn flex-1 px-4 py-3 bg-secondary hover:bg-secondary-dark text-white rounded-xl font-semibold text-sm transition shadow-md shadow-secondary/15"
                >
                  사진 저장
                </button>
                {isVideoProcessing && (
                  <div className="flex-1 px-4 py-3 bg-dark/10 text-dark/50 rounded-xl font-semibold text-center text-xs flex items-center justify-center gap-2">
                    <div className="w-3 h-3 border-2 border-dark/30 border-t-transparent rounded-full animate-spin" />
                    {videoProcessingProgress || '영상 처리 중...'}
                  </div>
                )}
                {!isVideoProcessing && recordedVideoBlob && (
                  <button
                    onClick={handleDownloadVideo}
                    className="booth-btn flex-1 px-4 py-3 bg-dark hover:bg-dark-50 text-white rounded-xl font-semibold text-sm transition shadow-md"
                  >
                    영상 저장
                  </button>
                )}
              </div>

              {/* Next guest button */}
              <button
                onClick={handlePrepareForNextGuest}
                disabled={isGuestViewingQR}
                className={`booth-btn w-full mt-3 px-4 py-3.5 text-white rounded-xl font-display font-bold transition shadow-md shadow-primary/20 ${
                  isGuestViewingQR
                    ? 'bg-primary/50 opacity-50 cursor-not-allowed'
                    : 'bg-primary hover:bg-primary-dark'
                }`}
              >
                {isGuestViewingQR ? '게스트가 QR 확인 중...' : '다음 게스트'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
