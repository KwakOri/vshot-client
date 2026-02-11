'use client';

import {
  FlashOverlay,
  SettingsModal,
} from '@/components';
import { CountdownOverlay } from '@/components/v3/FrameOverlayPreview';
import { RESOLUTION } from '@/constants/constants';
import { getLayoutById } from '@/constants/frame-layouts';
import { FrameLayout } from '@/types';
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
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
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
  const [guestBlurAmount, setGuestBlurAmount] = useState(50);

  const [hostFlipHorizontal, setHostFlipHorizontal] = useState(false);
  const [guestFlipHorizontal, setGuestFlipHorizontal] = useState(false);

  const [showFlash, setShowFlash] = useState(false);
  const [remoteAudioEnabled, setRemoteAudioEnabled] = useState(true);
  const [localMicMuted, setLocalMicMuted] = useState(false);

  // Volume controls
  const [remoteVolume, setRemoteVolume] = useState(100);
  const [localMicVolume, setLocalMicVolume] = useState(100);
  const prevRemoteVolumeRef = useRef(100);
  const prevLocalMicVolumeRef = useRef(100);
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Collapsible sections
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) =>
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));

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

  // Side panel states
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  const selectedLayout = store.resolvedFrameLayout || getLayoutById(store.selectedFrameLayoutId);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localCanvasRef = useRef<HTMLCanvasElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteCanvasRef = useRef<HTMLCanvasElement>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement>(null); // Recording canvas (no blur)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null); // Preview canvas (with blur)
  const initializedRef = useRef(false);

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
      layoutData: store.resolvedFrameLayout || undefined,
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
    },
    onMergeComplete: (mergedPhotoUrl) => {
      console.log('[Host V3] Photos merged:', mergedPhotoUrl);
      setSessionState(SessionState.PROCESSING);
    },
    onSessionComplete: async (sessionId, frameResultUrl) => {
      const t0 = performance.now();
      console.log('[⏱ Timing] onSessionComplete 시작');

      const filmId = nanoid(8);
      let framedBlobUrl: string | null = null;
      const layout = store.resolvedFrameLayout || getLayoutById(store.selectedFrameLayoutId);
      if (layout) {
        try {
          const t1 = performance.now();
          framedBlobUrl = await generatePhotoFrameBlobWithLayout([frameResultUrl], layout, filmId);
          console.log(`[⏱ Timing] 1. 프레임 이미지 생성: ${(performance.now() - t1).toFixed(0)}ms`);
          setLastSessionResult({ sessionId, frameResultUrl: framedBlobUrl });
        } catch (err) {
          console.error('[Festa Host] Failed to apply frame:', err);
          setLastSessionResult({ sessionId, frameResultUrl });
        }
      } else {
        setLastSessionResult({ sessionId, frameResultUrl });
      }
      setSessionState(SessionState.COMPLETED);
      setIsGuestViewingQR(true);

      // Film auto-creation (background)
      (async () => {
        try {
          const photoSrc = framedBlobUrl || frameResultUrl;
          let photoFileId: string | undefined;
          if (photoSrc) {
            const t2 = performance.now();
            const photoResponse = await fetch(photoSrc);
            const photoBlob = await photoResponse.blob();
            console.log(`[⏱ Timing] 2. 사진 Blob 변환: ${(performance.now() - t2).toFixed(0)}ms (${(photoBlob.size / 1024).toFixed(0)}KB)`);

            const t3 = performance.now();
            const photoUpload = await uploadBlob(photoBlob, `festa-photo-${sessionId}.png`);
            console.log(`[⏱ Timing] 3. 사진 R2 업로드: ${(performance.now() - t3).toFixed(0)}ms`);
            if (photoUpload.success && photoUpload.file) {
              photoFileId = photoUpload.file.id;
            }
          }

          let videoFileId: string | undefined;
          const maxWait = 30000;
          const pollInterval = 500;
          let waited = 0;
          const t4 = performance.now();
          while (!recordedVideoBlobRef.current && waited < maxWait) {
            await new Promise((r) => setTimeout(r, pollInterval));
            waited += pollInterval;
          }
          console.log(`[⏱ Timing] 4. 영상 후처리 대기: ${(performance.now() - t4).toFixed(0)}ms (waited: ${waited}ms)`);

          const videoBlob = recordedVideoBlobRef.current;
          if (videoBlob) {
            console.log(`[⏱ Timing] 4a. 영상 크기: ${(videoBlob.size / 1024 / 1024).toFixed(2)}MB`);
            const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
            const t5 = performance.now();
            const videoUpload = await uploadBlob(videoBlob, `festa-video-${sessionId}.${ext}`);
            console.log(`[⏱ Timing] 5. 영상 R2 업로드: ${(performance.now() - t5).toFixed(0)}ms`);
            if (videoUpload.success && videoUpload.file) {
              videoFileId = videoUpload.file.id;
            }
          } else {
            console.log('[⏱ Timing] 4a. 영상 없음 (타임아웃)');
          }

          if (photoFileId) {
            const filmRequest = {
              id: filmId,
              roomId: store.roomId!,
              sessionId,
              photoFileId,
              videoFileId,
            };
            const t6 = performance.now();
            const filmResult = await createFilm(filmRequest);
            console.log(`[⏱ Timing] 6. Film DB 생성: ${(performance.now() - t6).toFixed(0)}ms`);
            console.log(`[⏱ Timing] ✅ 전체 소요시간: ${(performance.now() - t0).toFixed(0)}ms`);
            sendMessage({ type: 'film-ready-festa', roomId: store.roomId!, filmId });
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

  // Recording canvas: no blur (used by VideoRecorder)
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
    guestBlurAmount: 0,
  });

  // Preview canvas: with blur (displayed on screen)
  useCompositeCanvas({
    compositeCanvas: previewCanvasRef.current,
    backgroundVideo: remoteVideoRef.current,
    foregroundCanvas: localCanvasRef.current,
    localStream,
    remoteStream,
    width: RESOLUTION.VIDEO_WIDTH,
    height: RESOLUTION.VIDEO_HEIGHT,
    guestFlipHorizontal,
    hostFlipHorizontal,
    guestBlurAmount,
  });

  useEffect(() => {
    if (!settingsLoaded) return;
    setChromaKeyEnabled(savedSettings.chromaKeyEnabled);
    setSensitivity(savedSettings.sensitivity);
    setSmoothness(savedSettings.smoothness);
    setChromaKeyColor(savedSettings.chromaKeyColor);
    setHostFlipHorizontal(savedSettings.hostFlipHorizontal);
    setGuestFlipHorizontal(savedSettings.guestFlipHorizontal);
    setGuestBlurAmount(savedSettings.guestBlurAmount ?? 50);
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

  const handleV3Signal = useEffectEvent((message: any) => {
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
            const layout = store.resolvedFrameLayout || getLayoutById(store.selectedFrameLayoutId);
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
        setShowFlash(true);
        setTimeout(() => setShowFlash(false), 300);
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
  }, [on]);

  const setupAudioGainNode = (stream: MediaStream): MediaStream => {
    // Clean up previous audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
      gainNodeRef.current = null;
    }

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return stream;

    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
    const gainNode = ctx.createGain();
    gainNode.gain.value = localMicVolume / 100;
    const dest = ctx.createMediaStreamDestination();
    source.connect(gainNode);
    gainNode.connect(dest);

    audioContextRef.current = ctx;
    gainNodeRef.current = gainNode;

    // Replace the audio track in the original stream with the processed one
    const processedTrack = dest.stream.getAudioTracks()[0];
    stream.removeTrack(audioTrack);
    stream.addTrack(processedTrack);

    return stream;
  };

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
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        audioStream.getAudioTracks().forEach((track) => mediaStream.addTrack(track));
        return setupAudioGainNode(mediaStream);
      });

      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setIsCameraActive(true);
      setSourceType('screen');
      refreshDevices();

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => setIsCameraActive(false);
      }

      if (store.roomId) {
        sendMessage({
          type: 'chromakey-settings',
          roomId: store.roomId,
          settings: { enabled: chromaKeyEnabled, color: chromaKeyColor, similarity: sensitivity, smoothness },
        });
      }
    } catch (error) {
      console.error('[Host V3] Screen share error:', error);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await startLocalStream(async () => {
        const audioConstraints: MediaTrackConstraints | boolean = store.selectedAudioDeviceId
          ? { deviceId: { exact: store.selectedAudioDeviceId } }
          : true;
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: audioConstraints,
        });
        return setupAudioGainNode(mediaStream);
      });

      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setIsCameraActive(true);
      setSourceType('camera');
      refreshDevices();

      if (store.roomId) {
        sendMessage({
          type: 'chromakey-settings',
          roomId: store.roomId,
          settings: { enabled: chromaKeyEnabled, color: chromaKeyColor, similarity: sensitivity, smoothness },
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

  const handlePrepareForNextGuest = () => {
    sendMessage({ type: 'session-reset-festa', roomId: store.roomId! });
    setLastSessionResult(null);
    setRecordedVideoBlob(null);
    recordedVideoBlobRef.current = null;
    setIsVideoProcessing(false);
    setVideoProcessingProgress('');
    photoCapture.reset();
    setSessionState(SessionState.GUEST_CONNECTED);
  };

  const toggleLocalMic = () => {
    if (!localMicMuted) {
      prevLocalMicVolumeRef.current = localMicVolume;
      setLocalMicVolume(0);
      if (gainNodeRef.current) gainNodeRef.current.gain.value = 0;
    } else {
      const restored = prevLocalMicVolumeRef.current || 100;
      setLocalMicVolume(restored);
      if (gainNodeRef.current) gainNodeRef.current.gain.value = restored / 100;
    }
    setLocalMicMuted(!localMicMuted);
  };

  const toggleRemoteAudio = () => {
    if (remoteAudioEnabled) {
      prevRemoteVolumeRef.current = remoteVolume;
      setRemoteVolume(0);
    } else {
      const restored = prevRemoteVolumeRef.current || 100;
      setRemoteVolume(restored);
    }
    setRemoteAudioEnabled(!remoteAudioEnabled);
  };

  const leaveRoom = () => {
    if (localStream) localStream.getTracks().forEach((track) => track.stop());
    store.setRoomId(null as any);
    store.setRole(null);
    router.push('/festa-host');
  };

  const openSettings = () => {
    setPendingAudioDeviceId(selectedAudioDeviceId);
    setPendingAudioOutputDeviceId(selectedAudioOutputDeviceId);
    setIsSettingsOpen(true);
  };

  const applySettings = async () => {
    if (pendingAudioOutputDeviceId !== selectedAudioOutputDeviceId && pendingAudioOutputDeviceId && remoteVideoRef.current) {
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
    if (pendingAudioDeviceId !== selectedAudioDeviceId) {
      setSelectedAudioDeviceId(pendingAudioDeviceId);
      store.setSelectedAudioDeviceId(pendingAudioDeviceId);
    }
  };

  const syncChromaKeySettings = useCallback(() => {
    if (store.roomId) {
      sendMessage({
        type: 'chromakey-settings',
        roomId: store.roomId,
        settings: { enabled: chromaKeyEnabled, color: chromaKeyColor, similarity: sensitivity, smoothness },
      });
    }
  }, [store.roomId, chromaKeyEnabled, chromaKeyColor, sensitivity, smoothness, sendMessage]);

  const toggleHostFlip = () => {
    const newFlipState = !hostFlipHorizontal;
    setHostFlipHorizontal(newFlipState);
    updateSetting('hostFlipHorizontal', newFlipState);
    if (store.roomId) {
      sendMessage({ type: 'host-display-options', roomId: store.roomId, options: { flipHorizontal: newFlipState } });
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
      if (localStream) localStream.getTracks().forEach((track) => track.stop());
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
        gainNodeRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (store.roomId && store.peerId) {
      sendMessage({ type: 'host-display-options', roomId: store.roomId, options: { flipHorizontal: hostFlipHorizontal } });
    }
  }, [store.roomId, store.peerId, hostFlipHorizontal, sendMessage]);

  useEffect(() => {
    on('guest-display-options', (message: any) => {
      if (message.options) setGuestFlipHorizontal(message.options.flipHorizontal);
    });
  }, [on]);

  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  // Output volume: control remote video element volume
  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.volume = remoteVolume / 100;
    }
  }, [remoteVolume]);

  // Input volume: sync gainNode value when slider changes
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = localMicVolume / 100;
    }
  }, [localMicVolume]);

  useEffect(() => {
    if (localStream && localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  const handleCopyRoomCode = () => {
    if (!localStream) {
      alert('먼저 화면 공유를 시작해서 촬영 준비를 완료해주세요');
      return;
    }
    if (store.roomId) {
      navigator.clipboard.writeText(store.roomId);
    }
  };

  const isGuestConnected = !guestManagement.waitingForGuest && sessionState !== SessionState.WAITING_FOR_GUEST;
  const canCapture = isGuestConnected && sessionState === SessionState.GUEST_CONNECTED && !!remoteStream;

  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ background: '#1B1612' }}>
      <FlashOverlay show={showFlash} />
      <CountdownOverlay countdown={photoCapture.countdown} frameLayout={selectedLayout || null} />

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

        {/* Preview canvas (with guest blur) - shown to host */}
        <canvas
          ref={localCanvasRef}
          className={`absolute max-w-full max-h-full transition-opacity z-[1] ${remoteStream ? 'opacity-0' : 'opacity-100'}`}
          style={{ aspectRatio: '2/3' }}
        />
        <canvas
          ref={previewCanvasRef}
          className={`absolute max-w-full max-h-full transition-opacity z-[1] ${!remoteStream ? 'opacity-0' : 'opacity-100'}`}
          style={{ aspectRatio: '2/3' }}
        />

        {/* Recording canvas (no blur) - hidden */}
        <canvas ref={compositeCanvasRef} className="absolute opacity-0 pointer-events-none" style={{ width: 1, height: 1 }} />

        {/* Frame overlay */}
        {selectedLayout?.frameSrc && (
          <img
            src={selectedLayout.frameSrc}
            alt=""
            className="absolute max-w-full max-h-full object-fill pointer-events-none z-[2]"
            style={{ aspectRatio: '2/3', opacity: 1 }}
          />
        )}

        {/* Hidden video elements */}
        <video ref={remoteVideoRef} autoPlay playsInline className="absolute w-px h-px opacity-0 pointer-events-none" />
        <video ref={localVideoRef} autoPlay playsInline muted className="absolute w-0 h-0 opacity-0 pointer-events-none" />

        {/* Inactive overlay */}
        {!isCameraActive && (
          <div className="absolute inset-0 flex items-center justify-center z-[3]">
            <div className="text-center">
              <p className="text-white/40 text-sm mb-6">화면 공유를 시작하세요</p>
              <button
                onClick={startScreenShare}
                className="flex flex-col items-center gap-3 px-10 py-7 rounded-2xl transition-all hover:scale-105"
                style={{ background: 'linear-gradient(135deg, #FC712B, #FD9319)' }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                <span className="text-white font-bold text-sm">화면 공유</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== TOP BAR (floating) ===== */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3">
        {/* Left: Back + Room code */}
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
          {store.roomId && (
            <button
              onClick={handleCopyRoomCode}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-md transition ${localStream ? 'hover:bg-white/20 cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}
              style={{ background: 'rgba(0,0,0,0.4)' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span className="text-white/80 font-bold text-xs tracking-wider">COPY ROOM ID</span>
            </button>
          )}
        </div>

        {/* Right: Audio controls + Settings */}
        <div className="flex items-center gap-2">
          {/* Connection indicator */}
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl backdrop-blur-md" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className="text-white/60 text-xs">{isConnected ? 'WS' : 'OFF'}</span>
          </div>
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

      {/* ===== LEFT SIDE TAB (Settings) ===== */}
      {/* Open button - slides out with panel */}
      <button
        onClick={() => setLeftPanelOpen(true)}
        className="absolute top-1/2 -translate-y-1/2 z-20 w-10 h-16 flex items-center justify-center rounded-r-xl backdrop-blur-md transition-all duration-300 ease-in-out hover:bg-white/20"
        style={{
          background: 'rgba(0,0,0,0.5)',
          left: leftPanelOpen ? '18rem' : '0.75rem',
          opacity: leftPanelOpen ? 0 : 1,
          pointerEvents: leftPanelOpen ? 'none' : 'auto',
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      <div
        className="absolute left-0 top-16 bottom-4 z-20 w-72 overflow-y-auto rounded-r-2xl backdrop-blur-xl p-4 space-y-4 transition-transform duration-300 ease-in-out"
        style={{
          background: 'rgba(27,22,18,0.92)',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          transform: leftPanelOpen ? 'translateX(0)' : 'translateX(-100%)',
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-white/40 text-[11px] font-bold uppercase tracking-wider">제어</h3>
          <button
            onClick={() => setLeftPanelOpen(false)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Capture button - always at top */}
        <button
          onClick={handleStartCapture}
          disabled={!canCapture}
          className="w-full py-3.5 rounded-xl font-bold text-white text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: canCapture ? 'linear-gradient(135deg, #FC712B, #FD9319)' : 'rgba(255,255,255,0.1)',
            boxShadow: canCapture ? '0 4px 20px rgba(252,113,43,0.4)' : 'none',
          }}
        >
          <div className="flex items-center justify-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            촬영 시작
          </div>
        </button>

        <div className="border-b border-white/[0.06]" />

        {/* === Section: 화면 소스 === */}
        <div>
          <button
            onClick={() => toggleSection('source')}
            className="w-full flex items-center justify-between py-1"
          >
            <span className="text-[11px] uppercase tracking-wider text-white/40 font-bold">화면 소스</span>
            <svg
              xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={`text-white/30 transition-transform duration-200 ${collapsedSections['source'] ? '-rotate-90' : 'rotate-0'}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {!collapsedSections['source'] && (
            <div className="space-y-3 mt-2">
              <button
                onClick={startScreenShare}
                className="w-full py-2.5 px-3 rounded-lg text-xs font-bold text-white transition hover:opacity-90 flex items-center justify-center gap-2"
                style={{ background: isCameraActive ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #FC712B, #FD9319)' }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                {isCameraActive ? '화면 공유 변경' : '화면 공유 시작'}
              </button>
              <div className="flex items-center justify-between">
                <p className="text-white/50 text-xs">호스트 좌우반전</p>
                <button
                  onClick={toggleHostFlip}
                  className={`relative w-10 h-5 rounded-full transition-colors ${hostFlipHorizontal ? 'bg-orange-500' : 'bg-white/20'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${hostFlipHorizontal ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="border-b border-white/[0.06]" />

        {/* === Section: 크로마키 === */}
        <div>
          <button
            onClick={() => toggleSection('chromakey')}
            className="w-full flex items-center justify-between py-1"
          >
            <span className="text-[11px] uppercase tracking-wider text-white/40 font-bold">크로마키</span>
            <svg
              xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={`text-white/30 transition-transform duration-200 ${collapsedSections['chromakey'] ? '-rotate-90' : 'rotate-0'}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {!collapsedSections['chromakey'] && (
            <div className="space-y-3 mt-2">
              <div className="flex items-center justify-between">
                <p className="text-white/50 text-xs">활성화</p>
                <button
                  onClick={() => {
                    const newVal = !chromaKeyEnabled;
                    setChromaKeyEnabled(newVal);
                    updateSetting('chromaKeyEnabled', newVal);
                    syncChromaKeySettings();
                  }}
                  className={`relative w-10 h-5 rounded-full transition-colors ${chromaKeyEnabled ? 'bg-orange-500' : 'bg-white/20'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${chromaKeyEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {chromaKeyEnabled && (
                <>
                  <div>
                    <label className="text-white/40 text-xs block mb-1">색상 (HEX)</label>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-lg border border-white/20 flex-shrink-0"
                        style={{ background: chromaKeyColor }}
                      />
                      <input
                        type="text"
                        value={chromaKeyColor}
                        onChange={(e) => {
                          const val = e.target.value;
                          setChromaKeyColor(val);
                          if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                            updateSetting('chromaKeyColor', val);
                          }
                        }}
                        onBlur={syncChromaKeySettings}
                        placeholder="#00ff00"
                        className="flex-1 h-8 px-2 rounded-lg text-xs text-white font-mono border border-white/10 bg-white/5 outline-none focus:border-orange-500/50"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-white/40 text-xs flex justify-between mb-1">
                      <span>민감도</span>
                      <span className="font-mono">{sensitivity}</span>
                    </label>
                    <input
                      type="range" min="0" max="100" value={sensitivity}
                      onChange={(e) => { const v = Number(e.target.value); setSensitivity(v); updateSetting('sensitivity', v); }}
                      onMouseUp={syncChromaKeySettings}
                      onTouchEnd={syncChromaKeySettings}
                      className="w-full accent-orange-500"
                    />
                  </div>
                  <div>
                    <label className="text-white/40 text-xs flex justify-between mb-1">
                      <span>부드러움</span>
                      <span className="font-mono">{smoothness}</span>
                    </label>
                    <input
                      type="range" min="0" max="50" value={smoothness}
                      onChange={(e) => { const v = Number(e.target.value); setSmoothness(v); updateSetting('smoothness', v); }}
                      onMouseUp={syncChromaKeySettings}
                      onTouchEnd={syncChromaKeySettings}
                      className="w-full accent-orange-500"
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="border-b border-white/[0.06]" />

        {/* === Section: 오디오 === */}
        <div>
          <button
            onClick={() => toggleSection('audio')}
            className="w-full flex items-center justify-between py-1"
          >
            <span className="text-[11px] uppercase tracking-wider text-white/40 font-bold">오디오</span>
            <svg
              xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={`text-white/30 transition-transform duration-200 ${collapsedSections['audio'] ? '-rotate-90' : 'rotate-0'}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {!collapsedSections['audio'] && (
            <div className="space-y-4 mt-2">
              {/* My mic */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={localMicMuted ? '#ef4444' : 'rgba(255,255,255,0.5)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                    <span className="text-white/60 text-xs">내 마이크</span>
                  </div>
                  <button
                    onClick={toggleLocalMic}
                    className={`px-2 py-1 rounded text-[10px] font-bold transition ${localMicMuted ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/50 hover:bg-white/15'}`}
                  >
                    {localMicMuted ? 'OFF' : 'ON'}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-white/30 text-[10px] w-6 text-right font-mono">{localMicVolume}</span>
                  <input
                    type="range" min="0" max="100" value={localMicVolume}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setLocalMicVolume(v);
                      if (v > 0 && localMicMuted) setLocalMicMuted(false);
                      if (v === 0 && !localMicMuted) setLocalMicMuted(true);
                    }}
                    className="flex-1 accent-orange-500"
                  />
                </div>
              </div>

              {/* Remote audio */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={!remoteAudioEnabled ? '#ef4444' : 'rgba(255,255,255,0.5)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                    </svg>
                    <span className="text-white/60 text-xs">상대방 소리</span>
                  </div>
                  <button
                    onClick={toggleRemoteAudio}
                    className={`px-2 py-1 rounded text-[10px] font-bold transition ${!remoteAudioEnabled ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/50 hover:bg-white/15'}`}
                  >
                    {remoteAudioEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-white/30 text-[10px] w-6 text-right font-mono">{remoteVolume}</span>
                  <input
                    type="range" min="0" max="100" value={remoteVolume}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setRemoteVolume(v);
                      if (v > 0 && !remoteAudioEnabled) setRemoteAudioEnabled(true);
                      if (v === 0 && remoteAudioEnabled) setRemoteAudioEnabled(false);
                    }}
                    className="flex-1 accent-orange-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== RIGHT SIDE TAB (Info) ===== */}
      <button
        onClick={() => setRightPanelOpen(true)}
        className="absolute top-1/2 -translate-y-1/2 z-20 w-10 h-16 flex items-center justify-center rounded-l-xl backdrop-blur-md transition-all duration-300 ease-in-out hover:bg-white/20"
        style={{
          background: 'rgba(0,0,0,0.5)',
          right: rightPanelOpen ? '18rem' : '0.75rem',
          opacity: rightPanelOpen ? 0 : 1,
          pointerEvents: rightPanelOpen ? 'none' : 'auto',
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div
        className="absolute right-0 top-16 bottom-4 z-20 w-72 overflow-y-auto rounded-l-2xl backdrop-blur-xl p-4 space-y-4 transition-transform duration-300 ease-in-out"
        style={{
          background: 'rgba(27,22,18,0.92)',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          transform: rightPanelOpen ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-white/40 text-xs font-bold uppercase tracking-wider">상태</h3>
          <button
            onClick={() => setRightPanelOpen(false)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

          {/* Guest status */}
          <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div className="flex items-center gap-3 mb-1">
              <div className={`w-3 h-3 rounded-full flex-shrink-0 ${isGuestConnected ? 'bg-green-400 animate-pulse' : 'bg-white/20'}`} />
              <span className="text-white text-base font-bold">
                {isGuestConnected ? '게스트 연결됨' : '게스트 대기 중'}
              </span>
            </div>
            {!isGuestConnected && (
              <p className="text-white/30 text-xs ml-6">게스트가 입장할 때까지 기다려주세요</p>
            )}
          </div>

          {/* Capture status */}
          {(sessionState === SessionState.CAPTURING || sessionState === SessionState.PROCESSING) && (
            <div className="p-4 rounded-xl border" style={{ background: 'rgba(252,113,43,0.1)', borderColor: 'rgba(252,113,43,0.3)' }}>
              <div className="flex items-center gap-2">
                {sessionState === SessionState.CAPTURING ? (
                  <>
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
                    <span className="text-white text-base font-bold">
                      {photoCapture.countdown !== null && photoCapture.countdown > 0
                        ? `${photoCapture.countdown}초 후 촬영`
                        : photoCapture.uploadProgress > 0
                        ? `업로드 중 ${photoCapture.uploadProgress}%`
                        : '촬영 준비 중'}
                    </span>
                  </>
                ) : (
                  <>
                    <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    <span className="text-white text-base font-bold">사진 합성 중</span>
                  </>
                )}
              </div>
              {/* Upload progress bar */}
              {sessionState === SessionState.CAPTURING && photoCapture.uploadProgress > 0 && (
                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden mt-3">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${photoCapture.uploadProgress}%`,
                      background: 'linear-gradient(90deg, #FC712B, #FD9319)',
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Session count */}
          <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <p className="text-white/40 text-xs mb-1">촬영 세션</p>
            <span className="text-white font-bold text-3xl">{guestManagement.sessionCount}</span>
          </div>

          {/* Video processing status */}
          {isVideoProcessing && (
            <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-white/30 border-t-transparent rounded-full animate-spin" />
                <span className="text-white/50 text-xs">{videoProcessingProgress || '영상 처리 중...'}</span>
              </div>
            </div>
          )}
        </div>

      {/* ===== BOTTOM-RIGHT TOAST (Capture complete) ===== */}
      {sessionState === SessionState.COMPLETED && lastSessionResult && (
        <div
          className="absolute bottom-4 right-4 z-30 w-80 rounded-2xl backdrop-blur-xl p-4 animate-slide-up"
          style={{ background: 'rgba(27,22,18,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          {isGuestViewingQR ? (
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(252,113,43,0.2)' }}>
                  <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                </div>
              </div>
              <div>
                <p className="text-white text-sm font-bold">게스트가 사진을 확인하는 중</p>
                <p className="text-white/40 text-xs mt-0.5">QR코드를 확인하고 있습니다</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span className="text-white text-sm font-bold">촬영 완료</span>
              </div>
              <button
                onClick={handlePrepareForNextGuest}
                className="w-full py-2.5 rounded-xl font-bold text-white text-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #FC712B, #FD9319)', boxShadow: '0 4px 20px rgba(252,113,43,0.4)' }}
              >
                다음 게스트
              </button>
            </div>
          )}
        </div>
      )}

      {/* ===== BOTTOM-LEFT: Waiting indicator ===== */}
      {isCameraActive && guestManagement.waitingForGuest && (
        <div
          className="absolute bottom-4 left-4 z-30 rounded-2xl backdrop-blur-xl px-4 py-3 animate-slide-up"
          style={{ background: 'rgba(27,22,18,0.9)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-3 h-3 rounded-full bg-orange-400 animate-pulse" />
            </div>
            <div>
              <p className="text-white text-sm font-bold">
                {guestManagement.sessionCount === 0 ? '게스트 대기 중' : '다음 게스트 대기 중'}
              </p>
              {guestManagement.sessionCount > 0 && (
                <p className="text-white/40 text-xs">{guestManagement.sessionCount}명 촬영 완료</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
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
    </div>
  );
}
