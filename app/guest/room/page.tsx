'use client';

import {
  ConnectionStatus,
  FlashOverlay,
  FullScreenPhotoSelection,
  PhotoCounter,
  PhotoSelectionPanel,
  ProcessingIndicator,
  SettingsModal,
  VideoDisplayPanel,
} from '@/components';
import { useMediaDevices } from '@/hooks/useMediaDevices';
import { RESOLUTION } from '@/constants/constants';
import { getLayoutById } from '@/constants/frame-layouts';
import { useChromaKey } from '@/hooks/useChromaKey';
import { useCompositeCanvas } from '@/hooks/useCompositeCanvas';
import { usePhotoCapture } from '@/hooks/usePhotoCapture';
import { useSignaling } from '@/hooks/useSignaling';
import { useWebRTC } from '@/hooks/useWebRTC';
import { generatePhotoFrameBlobWithLayout } from '@/lib/frame-generator';
import { uploadBlob } from '@/lib/files';
import { useAppStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

export default function GuestRoomPage() {
  const router = useRouter();
  const store = useAppStore();
  const { connect, sendMessage, on, off, isConnected } = useSignaling();
  const { localStream, remoteStream, startLocalStream } = useWebRTC({
    sendMessage,
    on,
  });

  const [isCameraActive, setIsCameraActive] = useState(false);

  // Host's chroma key settings (received from Host)
  const [hostChromaKeyEnabled, setHostChromaKeyEnabled] = useState(true);
  const [hostSensitivity, setHostSensitivity] = useState(50);
  const [hostSmoothness, setHostSmoothness] = useState(10);
  const [hostChromaKeyColor, setHostChromaKeyColor] = useState('#00ff00');

  // Display options (flip horizontal)
  const [guestFlipHorizontal, setGuestFlipHorizontal] = useState(false);
  const [hostFlipHorizontal, setHostFlipHorizontal] = useState(false);

  // Frame layout settings (received from Host)
  const [totalPhotos, setTotalPhotos] = useState(() => {
    const layout = getLayoutById(store.selectedFrameLayoutId);
    return (layout?.slotCount || 4) * 2;
  });
  const [selectablePhotos, setSelectablePhotos] = useState(() => {
    const layout = getLayoutById(store.selectedFrameLayoutId);
    return layout?.slotCount || 4;
  });

  // Photo capture state
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  const [isPhotoSession, setIsPhotoSession] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<number[]>([]);

  // Composition state (photo + video)
  const [isComposing, setIsComposing] = useState(false);
  const [photoFrameUrl, setPhotoFrameUrl] = useState<string | null>(null);
  const [videoFrameUrl, setVideoFrameUrl] = useState<string | null>(null);

  // R2 upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Full-screen photo selection mode
  const [showPhotoSelection, setShowPhotoSelection] = useState(false);

  // Audio settings
  const [remoteAudioEnabled, setRemoteAudioEnabled] = useState(true);
  const [localMicMuted, setLocalMicMuted] = useState(false);

  // Device selection from store
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

  // Settings modal
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pendingVideoDeviceId, setPendingVideoDeviceId] = useState<string | null>(null);
  const [pendingAudioDeviceId, setPendingAudioDeviceId] = useState<string | null>(null);
  const [pendingAudioOutputDeviceId, setPendingAudioOutputDeviceId] = useState<string | null>(null);

  // Get selected layout
  const selectedLayout = getLayoutById(store.selectedFrameLayoutId);

  // Use shared photo capture hook
  const {
    photoCount,
    photos,
    isProcessing,
    captureAndUpload,
    resetCapture,
    setMergedPhotos,
    startProcessing,
  } = usePhotoCapture({
    roomId: store.roomId,
    userId: store.userId,
    selectedLayout: selectedLayout,
    onFlash: () => {
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 300);
    },
  });

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localCanvasRef = useRef<HTMLCanvasElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteCanvasRef = useRef<HTMLCanvasElement>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement>(null);
  const capturePhotoRef = useRef<((photoNumber: number) => Promise<void>) | null>(null);
  const initializedRef = useRef(false);

  // Render Guest's local video to canvas (for high-quality photo capture)
  // flipHorizontal applied so captured photos match the mirrored preview
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

  // Use shared chroma key hook for remote video (Host's video)
  // isRemoteStream: true enables compensation for WebRTC compression color loss
  // flipHorizontal applied so captured photos match the mirrored preview
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

  // Use shared composite canvas hook
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

  // Initialize and join room
  useEffect(() => {
    if (initializedRef.current) return;
    if (!store._hasHydrated) return;

    // Check if we have room info
    if (!store.roomId || store.role !== 'guest') {
      console.log('[Guest Room] No room info, redirecting to ready page');
      router.push('/guest/ready');
      return;
    }

    initializedRef.current = true;

    // Capture roomId and userId before async operations
    const roomId = store.roomId;
    const userId = store.userId;

    const init = async () => {
      try {
        // Start camera with saved device IDs
        await startCamera();

        // Connect to signaling server
        console.log('[Guest Room] Connecting to server...');
        await connect();
        console.log('[Guest Room] Connected, joining room:', roomId);

        sendMessage({
          type: 'join',
          roomId: roomId!,
          userId: userId,
          role: 'guest',
        });
      } catch (error) {
        console.error('[Guest Room] Error:', error);
        alert('연결에 실패했습니다.');
        router.push('/guest/ready');
      }
    };

    init();
  }, [store._hasHydrated, store.roomId, store.role]);

  // Start camera with saved device settings
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

      // Apply speaker setting
      if (store.selectedAudioOutputDeviceId && remoteVideoRef.current) {
        try {
          if ('setSinkId' in remoteVideoRef.current) {
            await (remoteVideoRef.current as any).setSinkId(store.selectedAudioOutputDeviceId);
          }
        } catch (e) {
          console.error('[Guest Room] Failed to set speaker:', e);
        }
      }

      refreshDevices();
      console.log('[Guest Room] Camera started');
    } catch (error) {
      console.error('[Guest Room] Camera error:', error);
      throw error;
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setIsCameraActive(false);
    }
  };

  // Leave room and go back
  const leaveRoom = () => {
    stopCamera();
    store.setRoomId(null as any);
    store.setRole(null);
    router.push('/guest/ready');
  };

  // Setup local video
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Setup remote video
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      console.log('[Guest Room] Remote stream connected');
    }
  }, [remoteStream]);

  // Update photo counts when frame layout changes
  useEffect(() => {
    const layout = getLayoutById(store.selectedFrameLayoutId);
    if (layout) {
      const newSlotCount = layout.slotCount;
      setTotalPhotos(newSlotCount * 2);
      setSelectablePhotos(newSlotCount);

      setSelectedPhotos((prev) => {
        if (prev.length > newSlotCount) {
          return prev.slice(0, newSlotCount);
        }
        return prev;
      });
    }
  }, [store.selectedFrameLayoutId]);

  // Capture photo function
  const capturePhoto = useCallback(
    async (photoNumber: number) => {
      const localCanvas = localCanvasRef.current;

      if (localCanvas && store.roomId) {
        try {
          await captureAndUpload({
            photoNumber,
            canvasOrVideo: localCanvas,
            isCanvas: true,
          });

          if (photoNumber >= totalPhotos) {
            setIsPhotoSession(false);
          }
        } catch (error) {
          console.error(`[Guest Room] Failed to upload photo ${photoNumber}:`, error);
        }
      }
    },
    [store.roomId, captureAndUpload, totalPhotos]
  );

  useEffect(() => {
    capturePhotoRef.current = capturePhoto;
  }, [capturePhoto]);

  // Listen to merged photos from server
  useEffect(() => {
    const handlePhotosMerged = (message: any) => {
      if (message.photos && Array.isArray(message.photos)) {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const mergedPhotos = message.photos
          .sort((a: any, b: any) => a.photoNumber - b.photoNumber)
          .map((photo: any) => `${API_URL}${photo.mergedImageUrl}`);

        setIsPhotoSession(false);
        setMergedPhotos(mergedPhotos);
        setShowPhotoSelection(true);
      }
    };

    on('photos-merged', handlePhotosMerged);
    return () => {};
  }, [on, setMergedPhotos]);

  // Listen to video frame ready event
  useEffect(() => {
    const handleVideoFrameReady = async (message: any) => {
      if (message.videoUrl) {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const fullUrl = `${API_URL}${message.videoUrl}`;
        setVideoFrameUrl(fullUrl);
        setIsComposing(false);
      }
    };

    on('video-frame-ready', handleVideoFrameReady);
    return () => {};
  }, [on]);

  // Auto-upload to R2 when both frames are ready
  useEffect(() => {
    const uploadToR2 = async () => {
      if (!photoFrameUrl || !videoFrameUrl || isUploading || uploadComplete) return;

      setIsUploading(true);
      setUploadError(null);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

      try {
        // Upload photo frame
        const photoResponse = await fetch(photoFrameUrl);
        const photoBlob = await photoResponse.blob();
        const photoFilename = `vshot-photo-${store.roomId}-${timestamp}.png`;

        const photoUploadResult = await uploadBlob(photoBlob, photoFilename);
        if (!photoUploadResult.success) {
          throw new Error(photoUploadResult.error || '사진 업로드 실패');
        }
        console.log('[Guest Room] Photo uploaded to R2:', photoUploadResult.file?.id);

        // Upload video frame
        const videoResponse = await fetch(videoFrameUrl);
        const videoBlob = await videoResponse.blob();
        const extension = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
        const videoFilename = `vshot-video-${store.roomId}-${timestamp}.${extension}`;

        const videoUploadResult = await uploadBlob(videoBlob, videoFilename);
        if (!videoUploadResult.success) {
          throw new Error(videoUploadResult.error || '영상 업로드 실패');
        }
        console.log('[Guest Room] Video uploaded to R2:', videoUploadResult.file?.id);

        setUploadComplete(true);
      } catch (error) {
        console.error('[Guest Room] Failed to upload to R2:', error);
        setUploadError(error instanceof Error ? error.message : '업로드 실패');
      } finally {
        setIsUploading(false);
      }
    };

    uploadToR2();
  }, [photoFrameUrl, videoFrameUrl, isUploading, uploadComplete, store.roomId]);

  // Listen to photo session events and settings
  useEffect(() => {
    const handlePhotoSessionStart = () => {
      setIsPhotoSession(true);
      resetCapture();
    };

    const handleCountdownTick = (message: any) => {
      setCountdown(message.count);
      if (message.count === 0) {
        setTimeout(() => setCountdown(null), 500);
      }
    };

    const handleCaptureNow = (message: any) => {
      if (capturePhotoRef.current) {
        capturePhotoRef.current(message.photoNumber);
      }
    };

    const handleChromaKeySettings = (message: any) => {
      console.log('[Guest Room] Received chromakey-settings:', message);
      if (message.settings) {
        console.log('[Guest Room] Applying chromakey settings:', {
          enabled: message.settings.enabled,
          color: message.settings.color,
          similarity: message.settings.similarity,
          smoothness: message.settings.smoothness,
        });
        setHostChromaKeyEnabled(message.settings.enabled);
        setHostSensitivity(message.settings.similarity);
        setHostSmoothness(message.settings.smoothness);
        if (message.settings.color) {
          setHostChromaKeyColor(message.settings.color);
        }
      }
    };

    const handleHostDisplayOptions = (message: any) => {
      if (message.options) {
        setHostFlipHorizontal(message.options.flipHorizontal);
      }
    };

    const handleFrameLayoutSettings = (message: any) => {
      if (message.settings) {
        store.setSelectedFrameLayoutId(message.settings.layoutId);
        setTotalPhotos(message.settings.totalPhotos);
        setSelectablePhotos(message.settings.selectablePhotos);
      }
    };

    const handleSessionRestartFromPeer = () => {
      console.log('[Guest Room] Received session-restart from Host');
      // Don't notify peer back to avoid infinite loop
      handleRestartSession(false);
    };

    on('photo-session-start', handlePhotoSessionStart);
    on('countdown-tick', handleCountdownTick);
    on('capture-now', handleCaptureNow);
    on('chromakey-settings', handleChromaKeySettings);
    on('host-display-options', handleHostDisplayOptions);
    on('frame-layout-settings', handleFrameLayoutSettings);
    on('session-restart', handleSessionRestartFromPeer);

    return () => {};
  }, [on, resetCapture, store]);

  // Photo selection
  const togglePhotoSelection = useCallback(
    (index: number) => {
      setSelectedPhotos((prev) => {
        if (prev.includes(index)) {
          return prev.filter((i) => i !== index);
        } else if (prev.length < selectablePhotos) {
          return [...prev, index];
        }
        return prev;
      });
    },
    [selectablePhotos]
  );

  // Sync selection to server
  const syncSelectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!store.roomId || photos.length === 0) return;

    if (syncSelectionTimeoutRef.current) {
      clearTimeout(syncSelectionTimeoutRef.current);
    }

    syncSelectionTimeoutRef.current = setTimeout(() => {
      if (store.roomId && store.userId) {
        sendMessage({
          type: 'photo-select',
          roomId: store.roomId,
          userId: store.userId,
          selectedIndices: selectedPhotos,
        });
      }
    }, 50);

    return () => {
      if (syncSelectionTimeoutRef.current) {
        clearTimeout(syncSelectionTimeoutRef.current);
      }
    };
  }, [selectedPhotos, store.roomId, store.userId, sendMessage, photos.length]);

  // Generate frame
  const handleGenerateFrame = async () => {
    if (selectedPhotos.length !== selectablePhotos || !store.roomId) return;

    setIsComposing(true);
    setPhotoFrameUrl(null);
    setVideoFrameUrl(null);

    try {
      const layout = getLayoutById(store.selectedFrameLayoutId);
      if (!layout) throw new Error('Layout not found');

      const photosToUse = selectedPhotos.slice(0, layout.slotCount);
      const selectedPhotoUrls = photosToUse.map((index) => photos[index]);

      const photoBlobUrl = await generatePhotoFrameBlobWithLayout(selectedPhotoUrls, layout);
      setPhotoFrameUrl(photoBlobUrl);

      sendMessage({
        type: 'video-frame-request',
        roomId: store.roomId,
        userId: store.userId,
        selectedPhotos,
      });
    } catch (error) {
      console.error('[Guest Room] Failed to generate frame:', error);
      alert('프레임 생성에 실패했습니다.');
      setIsComposing(false);
    }
  };

  /**
   * Reset session to initial state
   * @param notifyPeer - If true, sends restart message to peer (use when Guest initiates restart)
   */
  const handleRestartSession = (notifyPeer: boolean = true) => {
    // Reset local state
    setIsPhotoSession(false);
    setSelectedPhotos([]);
    setPhotoFrameUrl(null);
    setVideoFrameUrl(null);
    setIsComposing(false);
    setIsUploading(false);
    setUploadComplete(false);
    setUploadError(null);
    setShowPhotoSelection(false);
    resetCapture();

    // Send restart message to host only if Guest initiates the restart
    if (notifyPeer && store.roomId) {
      sendMessage({
        type: 'session-restart',
        roomId: store.roomId,
        userId: store.userId,
      });
    }

    console.log('[Guest Room] Session restarted');
  };

  // Get video extension from URL
  const getVideoExtension = (url: string): string => {
    const ext = url.split('.').pop()?.toLowerCase();
    if (ext === 'mp4' || ext === 'webm') return ext;
    return 'mp4'; // 기본값
  };

  // Download file from URL (handles cross-origin)
  const downloadFile = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('[Guest Room] Download failed:', error);
      // Fallback: open in new tab
      window.open(url, '_blank');
    }
  };

  // Toggle flip
  const toggleGuestFlip = () => {
    const newFlipState = !guestFlipHorizontal;
    setGuestFlipHorizontal(newFlipState);

    if (store.roomId) {
      sendMessage({
        type: 'guest-display-options',
        roomId: store.roomId,
        options: { flipHorizontal: newFlipState },
      });
    }
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

  // Settings modal handlers
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

    // Apply speaker change
    if (audioOutputChanged && pendingAudioOutputDeviceId && remoteVideoRef.current) {
      try {
        if ('setSinkId' in remoteVideoRef.current) {
          await (remoteVideoRef.current as any).setSinkId(pendingAudioOutputDeviceId);
        }
      } catch (error) {
        console.error('[Guest Room] Failed to change speaker:', error);
      }
    }
    setSelectedAudioOutputDeviceId(pendingAudioOutputDeviceId);
    store.setSelectedAudioOutputDeviceId(pendingAudioOutputDeviceId);

    // Restart stream if camera/mic changed
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
        console.error('[Guest Room] Failed to restart stream:', error);
        alert('장치 변경에 실패했습니다.');
      }
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Full-screen photo selection view
  if (showPhotoSelection && photos.length >= totalPhotos && selectedLayout) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <FlashOverlay show={showFlash} />

        {/* Hidden video/canvas elements to maintain refs across view changes */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          muted={!remoteAudioEnabled}
          className="absolute top-0 left-0 w-0 h-0 opacity-0 pointer-events-none"
        />
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute top-0 left-0 w-0 h-0 opacity-0 pointer-events-none"
        />
        <canvas
          ref={localCanvasRef}
          className="absolute top-0 left-0 w-0 h-0 opacity-0 pointer-events-none"
        />
        <canvas
          ref={remoteCanvasRef}
          className="absolute top-0 left-0 w-0 h-0 opacity-0 pointer-events-none"
        />
        <canvas
          ref={compositeCanvasRef}
          className="absolute top-0 left-0 w-0 h-0 opacity-0 pointer-events-none"
        />

        {/* Navbar */}
        <div className="flex-shrink-0 flex items-center gap-2 bg-white border-2 border-neutral rounded-lg m-3 mb-0 p-2 shadow-md">
          <button
            onClick={() => setShowPhotoSelection(false)}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-neutral/40 hover:bg-neutral rounded-lg transition"
            title="영상 화면으로 돌아가기"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>

          {store.roomId && (
            <div className="bg-secondary px-3 py-1.5 rounded-lg shadow-md">
              <span className="text-xs opacity-90 text-white">Room:</span>
              <span className="text-sm font-bold ml-1 text-white">{store.roomId}</span>
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
            className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg transition ${
              localMicMuted ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-neutral/40 hover:bg-neutral text-dark'
            }`}
            title={localMicMuted ? '마이크 켜기' : '마이크 끄기'}
          >
            {localMicMuted ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg transition ${
              remoteAudioEnabled ? 'bg-neutral/40 hover:bg-neutral text-dark' : 'bg-red-500 hover:bg-red-600 text-white'
            }`}
            title={remoteAudioEnabled ? '상대방 음성 끄기' : '상대방 음성 켜기'}
          >
            {remoteAudioEnabled ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            )}
          </button>

          {/* Settings */}
          <button
            onClick={openSettings}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-neutral/40 hover:bg-neutral rounded-lg transition"
            title="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

        {/* Photo Selection */}
        <div className="flex-1 min-h-0">
          <FullScreenPhotoSelection
            photos={photos}
            selectedPhotos={selectedPhotos}
            onPhotoSelect={togglePhotoSelection}
            onComplete={handleGenerateFrame}
            frameLayout={selectedLayout}
            maxSelection={selectablePhotos}
            role="guest"
            isGenerating={isComposing}
            isComplete={!!(photoFrameUrl && videoFrameUrl)}
          />
        </div>

        {/* Upload status */}
        {!isComposing && photoFrameUrl && videoFrameUrl && (
          <div className="flex-shrink-0 bg-primary/10 border-t-2 border-primary p-3">
            {isUploading ? (
              <div className="flex items-center justify-center gap-3 p-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                <span className="text-sm text-dark font-medium">저장 중...</span>
              </div>
            ) : uploadComplete ? (
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-2 p-3 bg-green-100 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <span className="text-sm text-green-700 font-semibold">저장 완료!</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => photoFrameUrl && downloadFile(photoFrameUrl, `vshot-photo-${store.roomId}-${Date.now()}.png`)}
                    className="flex-1 px-4 py-3 bg-secondary hover:bg-secondary-dark text-white rounded-lg font-semibold transition shadow-md text-center"
                  >
                    사진 다운로드
                  </button>
                  <button
                    onClick={() => videoFrameUrl && downloadFile(videoFrameUrl, `vshot-video-${store.roomId}-${Date.now()}.${getVideoExtension(videoFrameUrl)}`)}
                    className="flex-1 px-4 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold transition shadow-md text-center"
                  >
                    영상 다운로드
                  </button>
                </div>
              </div>
            ) : uploadError ? (
              <div className="flex items-center justify-center gap-2 p-3 bg-red-100 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <span className="text-sm text-red-700 font-semibold">저장 실패: {uploadError}</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 p-3">
                <span className="text-sm text-dark font-medium">생성 완료! 저장 준비 중...</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Main video view
  return (
    <div className="flex flex-col h-full p-3 gap-3 overflow-hidden">
      <FlashOverlay show={showFlash} />

      {/* Navbar */}
      <div className="flex-shrink-0 flex items-center gap-2 bg-white border-2 border-neutral rounded-lg p-2 shadow-md">
        <button
          onClick={leaveRoom}
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-neutral/40 hover:bg-neutral rounded-lg transition"
          title="나가기"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        {store.roomId && (
          <div className="bg-secondary px-3 py-1.5 rounded-lg shadow-md">
            <span className="text-xs opacity-90 text-white">Room:</span>
            <span className="text-sm font-bold ml-1 text-white">{store.roomId}</span>
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
          className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg transition ${
            localMicMuted ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-neutral/40 hover:bg-neutral text-dark'
          }`}
          title={localMicMuted ? '마이크 켜기' : '마이크 끄기'}
        >
          {localMicMuted ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg transition ${
            remoteAudioEnabled ? 'bg-neutral/40 hover:bg-neutral text-dark' : 'bg-red-500 hover:bg-red-600 text-white'
          }`}
          title={remoteAudioEnabled ? '상대방 음성 끄기' : '상대방 음성 켜기'}
        >
          {remoteAudioEnabled ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          )}
        </button>

        {/* Settings */}
        <button
          onClick={openSettings}
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-neutral/40 hover:bg-neutral rounded-lg transition"
          title="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
      <div className="flex-1 min-h-0 bg-gray-800 rounded-lg p-2 flex items-center justify-center">
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
          countdown={countdown}
          remoteAudioEnabled={remoteAudioEnabled}
        />
      </div>

      {/* Bottom Panel */}
      <div className="flex-shrink-0 overflow-y-auto max-h-[40vh]">
        {isPhotoSession ? (
          <div className="bg-white border-2 border-primary rounded-lg p-4 shadow-md">
            <div className="flex items-center justify-center gap-4">
              <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse"></div>
              <div>
                <div className="text-lg font-semibold text-dark">
                  사진 {photoCount + 1} / {totalPhotos} 촬영 중
                </div>
                <PhotoCounter current={photoCount} total={totalPhotos} />
              </div>
            </div>
          </div>
        ) : photos.length >= totalPhotos ? (
          <div className="space-y-3">
            <ProcessingIndicator show={isProcessing} />
            <PhotoSelectionPanel
              photos={photos}
              selectedPhotos={selectedPhotos}
              onPhotoSelect={togglePhotoSelection}
              onGenerateFrame={handleGenerateFrame}
              maxSelection={selectablePhotos}
              readOnly={false}
              role="guest"
              isGenerating={isComposing}
              isComplete={!!(photoFrameUrl && videoFrameUrl)}
              frameLayout={selectedLayout}
            />

            {selectedPhotos.length === selectablePhotos && (
              <div className="bg-primary/10 rounded-lg p-3 border-2 border-primary shadow-md">
                {isComposing && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 border-4 border-secondary border-t-transparent rounded-full animate-spin"></div>
                    <div className="text-sm font-semibold text-dark">합성 진행 중...</div>
                  </div>
                )}

                {!isComposing && photoFrameUrl && videoFrameUrl && (
                  <div className="space-y-2">
                    {isUploading ? (
                      <div className="flex items-center justify-center gap-2 p-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                        <span className="text-sm text-dark font-medium">저장 중...</span>
                      </div>
                    ) : uploadComplete ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-center gap-2 p-2 bg-green-100 rounded-lg">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                          </svg>
                          <span className="text-xs text-green-700 font-semibold">저장 완료!</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => photoFrameUrl && downloadFile(photoFrameUrl, `vshot-photo-${store.roomId}-${Date.now()}.png`)}
                            className="flex-1 px-3 py-2 bg-secondary hover:bg-secondary-dark text-white rounded-lg font-semibold text-sm transition shadow-md text-center"
                          >
                            사진 다운로드
                          </button>
                          <button
                            onClick={() => videoFrameUrl && downloadFile(videoFrameUrl, `vshot-video-${store.roomId}-${Date.now()}.${getVideoExtension(videoFrameUrl)}`)}
                            className="flex-1 px-3 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold text-sm transition shadow-md text-center"
                          >
                            영상 다운로드
                          </button>
                        </div>
                      </div>
                    ) : uploadError ? (
                      <div className="flex items-center justify-center gap-2 p-2 bg-red-100 rounded-lg">
                        <span className="text-xs text-red-700 font-semibold">저장 실패</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2 p-2">
                        <span className="text-xs text-dark font-medium">저장 준비 중...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white border-2 border-neutral rounded-lg p-3 shadow-md">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-dark/70">
                {remoteStream ? (
                  <span>Host 크로마키: {hostChromaKeyEnabled ? 'ON' : 'OFF'}</span>
                ) : (
                  <span>Host를 기다리는 중...</span>
                )}
              </div>

              <button
                onClick={toggleGuestFlip}
                className={`flex-shrink-0 px-4 py-2 rounded-lg font-semibold text-sm transition shadow-md ${
                  guestFlipHorizontal
                    ? 'bg-primary hover:bg-primary-dark text-white'
                    : 'bg-neutral hover:bg-neutral-dark text-dark'
                }`}
              >
                {guestFlipHorizontal ? '반전 ON' : '반전 OFF'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
