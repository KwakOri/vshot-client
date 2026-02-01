'use client';

import {
  ConnectionStatus,
  FlashOverlay,
  PhotoCounter,
  PhotoSelectionPanel,
  ProcessingIndicator,
  VideoDisplayPanel,
} from '@/components';
import { RESOLUTION } from '@/constants/constants';
import { getLayoutById } from '@/constants/frame-layouts';
import { useChromaKey } from '@/hooks/useChromaKey';
import { useCompositeCanvas } from '@/hooks/useCompositeCanvas';
import { usePhotoCapture } from '@/hooks/usePhotoCapture';
import { useSignaling } from '@/hooks/useSignaling';
import { useWebRTC } from '@/hooks/useWebRTC';
import {
  downloadPhotoFrameFromBlob,
  generatePhotoFrameBlobWithLayout,
} from '@/lib/frame-generator';
import { useAppStore } from '@/lib/store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
export default function GuestPage() {
  const store = useAppStore();
  const { connect, sendMessage, on, off, isConnected } = useSignaling();
  const { localStream, remoteStream, startLocalStream } = useWebRTC({
    sendMessage,
    on,
  });

  const [roomIdInput, setRoomIdInput] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [streamType, setStreamType] = useState<'camera' | 'screen'>('camera');
  const [mediaReady, setMediaReady] = useState(false); // Media started before joining

  // Host's chroma key settings (received from Host)
  const [hostChromaKeyEnabled, setHostChromaKeyEnabled] = useState(true);
  const [hostSensitivity, setHostSensitivity] = useState(50);
  const [hostSmoothness, setHostSmoothness] = useState(10);

  // Display options (flip horizontal)
  const [guestFlipHorizontal, setGuestFlipHorizontal] = useState(false);
  const [hostFlipHorizontal, setHostFlipHorizontal] = useState(false);

  // Frame layout settings (received from Host)
  // Initialize with function to avoid recalculation on every render
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
  const [isGeneratingFrame, setIsGeneratingFrame] = useState(false);

  // Composition state (photo + video)
  const [isComposing, setIsComposing] = useState(false);
  const [photoFrameUrl, setPhotoFrameUrl] = useState<string | null>(null);
  const [videoFrameUrl, setVideoFrameUrl] = useState<string | null>(null);

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
  const localCanvasRef = useRef<HTMLCanvasElement>(null); // Guest's canvas for photo capture
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteCanvasRef = useRef<HTMLCanvasElement>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement>(null);
  const capturePhotoRef = useRef<
    ((photoNumber: number) => Promise<void>) | null
  >(null);
  const initializedRef = useRef(false);

  // Render Guest's local video to canvas (for high-quality photo capture)
  // No chroma key needed - just copy video to canvas
  useChromaKey({
    videoElement: localVideoRef.current,
    canvasElement: localCanvasRef.current,
    stream: localStream,
    enabled: false, // No chroma key for Guest's background video
    sensitivity: 0,
    smoothness: 0,
    width: RESOLUTION.PHOTO_WIDTH, // Use photo resolution for capture
    height: RESOLUTION.PHOTO_HEIGHT,
  });

  // Use shared chroma key hook for remote video (Host's video)
  useChromaKey({
    videoElement: remoteVideoRef.current,
    canvasElement: remoteCanvasRef.current,
    stream: remoteStream,
    enabled: hostChromaKeyEnabled,
    sensitivity: hostSensitivity,
    smoothness: hostSmoothness,
    width: RESOLUTION.VIDEO_WIDTH,
    height: RESOLUTION.VIDEO_HEIGHT,
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

  // Initialize
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (!store.userId) {
      const userId = uuidv4();
      store.setUserId(userId);
    }

    // Check if we have an existing room (after refresh)
    const existingRoomId = store.roomId;
    const existingRole = store.role;

    if (existingRoomId && existingRole === 'guest') {
      // Restore room ID to input field
      setRoomIdInput(existingRoomId);
    }
  }, []);

  // Update photo counts when frame layout changes
  useEffect(() => {
    const layout = getLayoutById(store.selectedFrameLayoutId);
    if (layout) {
      const newSlotCount = layout.slotCount;
      setTotalPhotos(newSlotCount * 2);
      setSelectablePhotos(newSlotCount);

      // If current selection exceeds new limit, trim it
      setSelectedPhotos((prev) => {
        if (prev.length > newSlotCount) {
          return prev.slice(0, newSlotCount);
        }
        return prev;
      });

      console.log(
        `[Guest] Frame layout changed to ${layout.label}: ${newSlotCount} slots`
      );
    }
  }, [store.selectedFrameLayoutId]);

  // Join room (media already started)
  const joinRoom = async () => {
    if (!roomIdInput.trim()) {
      alert('Room ID를 입력해주세요.');
      return;
    }

    if (!mediaReady || !localStream) {
      alert('먼저 카메라 또는 화면 공유를 시작해주세요.');
      return;
    }

    if (!store.userId) {
      const userId = uuidv4();
      store.setUserId(userId);
    }

    try {
      console.log('[Guest] Connecting to server...');
      await connect();
      console.log('[Guest] Connected, joining room:', roomIdInput);

      // Set role before joining
      store.setRole('guest');

      sendMessage({
        type: 'join',
        roomId: roomIdInput.trim().toUpperCase(),
        userId: store.userId,
        role: 'guest',
      });

      setIsJoined(true);
    } catch (error) {
      console.error('[Guest] Error joining room:', error);
      alert('서버에 연결할 수 없습니다.');
    }
  };

  // Start camera or screen share
  const startMedia = async () => {
    try {
      let stream: MediaStream;

      if (streamType === 'camera') {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: true,
        });
        console.log('[Guest] Camera started');
      } else {
        // Screen share
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: true,
        });
        console.log('[Guest] Screen share started');
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      await startLocalStream(() => Promise.resolve(stream));
      setIsCameraActive(true);
      setMediaReady(true);
    } catch (error) {
      console.error('[Guest] Media error:', error);
      alert('카메라에 접근할 수 없습니다.');
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setIsCameraActive(false);
    }
  };

  // Setup local video
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
      console.log('[Guest] Local stream connected');
    }
  }, [localStream]);

  // Re-setup local video when transitioning to main screen
  useEffect(() => {
    if (isJoined && localStream && localVideoRef.current) {
      // Re-attach stream after screen transition
      localVideoRef.current.srcObject = localStream;
      console.log('[Guest] Local stream re-attached after joining');
    }
  }, [isJoined, localStream]);

  // Setup remote video
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      console.log('[Guest] Remote stream connected');
    }
  }, [remoteStream]);

  // Wrap capturePhoto in useCallback to prevent stale closures in event handlers
  const capturePhoto = useCallback(
    async (photoNumber: number) => {
      const localCanvas = localCanvasRef.current;
      const localVideo = localVideoRef.current;

      console.log('[Guest] capturePhoto called:', {
        photoNumber,
        hasCanvas: !!localCanvas,
        hasVideo: !!localVideo,
        canvasSize: localCanvas
          ? `${localCanvas.width}x${localCanvas.height}`
          : 'N/A',
        videoSize: localVideo
          ? `${localVideo.videoWidth}x${localVideo.videoHeight}`
          : 'N/A',
        videoReady: localVideo?.readyState,
      });

      if (localCanvas && store.roomId) {
        // Check if canvas has actual content
        const ctx = localCanvas.getContext('2d');
        if (ctx) {
          const imageData = ctx.getImageData(
            0,
            0,
            Math.min(localCanvas.width, 100),
            Math.min(localCanvas.height, 100)
          );
          const data = imageData.data;
          let hasNonBlackPixel = false;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 0 || data[i + 1] > 0 || data[i + 2] > 0) {
              hasNonBlackPixel = true;
              break;
            }
          }
          console.log('[Guest] Canvas content check:', {
            hasNonBlackPixel,
            samplePixels: `rgba(${data[0]}, ${data[1]}, ${data[2]}, ${data[3]})`,
          });
        }

        try {
          await captureAndUpload({
            photoNumber,
            canvasOrVideo: localCanvas,
            isCanvas: true,
          });

          if (photoNumber >= 8) {
            setIsPhotoSession(false);
            // Note: Don't call startProcessing() here
            // Server will broadcast photos-merged which will set isProcessing to false
            // If we call startProcessing() here, it creates a race condition
            console.log('[Guest] Photo upload complete, waiting for merge...');
          }
        } catch (error) {
          console.error(
            `[Guest] Failed to upload photo ${photoNumber}:`,
            error
          );
          alert(`사진 ${photoNumber} 업로드에 실패했습니다.`);
        }
      }
    },
    [store.roomId, captureAndUpload]
  );

  // Store capturePhoto in ref so event handlers can access latest version
  useEffect(() => {
    capturePhotoRef.current = capturePhoto;
  }, [capturePhoto]);

  // Listen to merged photos from server (separate useEffect like Host page)
  useEffect(() => {
    const handlePhotosMerged = (message: any) => {
      console.log('[Guest] Received merged photos from server:', message);

      if (message.photos && Array.isArray(message.photos)) {
        // Create photos array with merged images
        const API_URL =
          process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const mergedPhotos = message.photos
          .sort((a: any, b: any) => a.photoNumber - b.photoNumber)
          .map((photo: any) => `${API_URL}${photo.mergedImageUrl}`);

        // End photo session to prevent race condition with capturePhoto
        setIsPhotoSession(false);
        setMergedPhotos(mergedPhotos);
        console.log(`[Guest] Displayed ${mergedPhotos.length} merged photos`);
      }
    };

    on('photos-merged', handlePhotosMerged);

    return () => {
      // Cleanup if needed
    };
  }, [on, setMergedPhotos]);

  // Listen to video frame ready event
  useEffect(() => {
    const handleVideoFrameReady = async (message: any) => {
      console.log('[Guest] Video frame ready:', message);

      if (message.videoUrl) {
        const API_URL =
          process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const fullUrl = `${API_URL}${message.videoUrl}`;

        console.log('[Guest] Video frame URL received:', fullUrl);

        // Store video URL and end composition
        setVideoFrameUrl(fullUrl);
        setIsComposing(false);
        console.log(
          '[Guest] Composition complete - photo and video ready for download'
        );
      }
    };

    on('video-frame-ready', handleVideoFrameReady);

    return () => {
      // Cleanup if needed
    };
  }, [on]);

  // Listen to photo session events and chroma key settings
  useEffect(() => {
    const handlePhotoSessionStart = (message: any) => {
      console.log('[Guest] Photo session started');
      setIsPhotoSession(true);
      resetCapture();
    };

    const handleCountdownTick = (message: any) => {
      console.log('[Guest] Countdown:', message.count);
      setCountdown(message.count);

      if (message.count === 0) {
        setTimeout(() => setCountdown(null), 500);
      }
    };

    const handleCaptureNow = (message: any) => {
      console.log('[Guest] Capture now:', message.photoNumber);
      if (capturePhotoRef.current) {
        capturePhotoRef.current(message.photoNumber);
      }
    };

    const handleChromaKeySettings = (message: any) => {
      console.log(
        '[Guest] Received chroma key settings from Host:',
        message.settings
      );
      if (message.settings) {
        setHostChromaKeyEnabled(message.settings.enabled);
        setHostSensitivity(message.settings.similarity);
        setHostSmoothness(message.settings.smoothness);
      }
    };

    const handleSessionSettings = (message: any) => {
      console.log('[Guest] Received session settings from server:', message);
      if (message.settings) {
        console.log(
          '[Guest] Session settings - recordingDuration:',
          message.settings.recordingDuration,
          'captureInterval:',
          message.settings.captureInterval
        );
      }
    };

    const handleHostDisplayOptions = (message: any) => {
      console.log('[Guest] Received host display options:', message.options);
      if (message.options) {
        setHostFlipHorizontal(message.options.flipHorizontal);
      }
    };

    const handleFrameLayoutSettings = (message: any) => {
      console.log('[Guest] Received frame layout settings:', message.settings);
      if (message.settings) {
        // Update store with the layout ID from host
        store.setSelectedFrameLayoutId(message.settings.layoutId);
        setTotalPhotos(message.settings.totalPhotos);
        setSelectablePhotos(message.settings.selectablePhotos);
        console.log(
          '[Guest] Updated frame layout:',
          message.settings.layoutId,
          '- total photos:',
          message.settings.totalPhotos,
          'selectable:',
          message.settings.selectablePhotos
        );
      }
    };

    on('photo-session-start', handlePhotoSessionStart);
    on('countdown-tick', handleCountdownTick);
    on('capture-now', handleCaptureNow);
    on('chromakey-settings', handleChromaKeySettings);
    on('session-settings', handleSessionSettings);
    on('host-display-options', handleHostDisplayOptions);
    on('frame-layout-settings', handleFrameLayoutSettings);

    console.log('[Guest] Event handlers registered');

    return () => {
      // Cleanup listeners if needed
      console.log('[Guest] Cleaning up event handlers');
    };
  }, [on]); // Only depend on 'on', use capturePhotoRef for latest capturePhoto

  // Optimistic update: Update UI immediately, then sync with server
  const togglePhotoSelection = useCallback(
    (index: number) => {
      setSelectedPhotos((prev) => {
        let newSelection: number[];

        if (prev.includes(index)) {
          // Deselect
          newSelection = prev.filter((i) => i !== index);
        } else {
          // Select only if less than max selected
          if (prev.length < selectablePhotos) {
            newSelection = [...prev, index];
          } else {
            return prev; // No change
          }
        }

        return newSelection;
      });
    },
    [selectablePhotos]
  );

  // Sync selection to server after state update (debounced)
  const syncSelectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Skip if no room or no photos yet
    if (!store.roomId || photos.length === 0) return;

    // Debounce server sync to avoid excessive network calls
    if (syncSelectionTimeoutRef.current) {
      clearTimeout(syncSelectionTimeoutRef.current);
    }

    syncSelectionTimeoutRef.current = setTimeout(() => {
      sendMessage({
        type: 'photo-select',
        roomId: store.roomId,
        userId: store.userId,
        selectedIndices: selectedPhotos,
      });
    }, 50); // 50ms debounce

    return () => {
      if (syncSelectionTimeoutRef.current) {
        clearTimeout(syncSelectionTimeoutRef.current);
      }
    };
  }, [selectedPhotos, store.roomId, store.userId, sendMessage, photos.length]);

  const handleGenerateFrame = async () => {
    if (selectedPhotos.length !== selectablePhotos) {
      alert(`${selectablePhotos}장의 사진을 선택해주세요.`);
      return;
    }

    if (!store.roomId) {
      alert('방에 참가하지 않았습니다.');
      return;
    }

    // Start composition process
    setIsComposing(true);
    setPhotoFrameUrl(null);
    setVideoFrameUrl(null);

    try {
      // 1. Generate photo frame (blob URL) with layout
      const layout = getLayoutById(store.selectedFrameLayoutId);

      if (!layout) {
        throw new Error(`Layout not found: ${store.selectedFrameLayoutId}`);
      }

      // Use only the number of photos that match the layout's slot count
      const photosToUse = selectedPhotos.slice(0, layout.slotCount);
      const selectedPhotoUrls = photosToUse.map((index) => photos[index]);

      const photoBlobUrl = await generatePhotoFrameBlobWithLayout(
        selectedPhotoUrls,
        layout
      );
      setPhotoFrameUrl(photoBlobUrl);
      console.log('[Guest] Photo frame generated');

      // 2. Request video frame from Host
      console.log(
        '[Guest] Requesting video frame with photos:',
        selectedPhotos
      );
      sendMessage({
        type: 'video-frame-request',
        roomId: store.roomId,
        userId: store.userId,
        selectedPhotos,
      });
      console.log('[Guest] Video frame request sent to Host');
    } catch (error) {
      console.error('[Guest] Failed to generate photo frame:', error);
      alert('사진 프레임 생성에 실패했습니다.');
      setIsComposing(false);
    }
  };

  // Download photo frame
  const handleDownloadPhoto = () => {
    if (photoFrameUrl && store.roomId) {
      downloadPhotoFrameFromBlob(photoFrameUrl, store.roomId);
      console.log('[Guest] Photo frame downloaded');
    }
  };

  // Download video frame
  const handleDownloadVideo = async () => {
    if (!videoFrameUrl || !store.roomId) return;

    try {
      // Fetch video as blob to prevent opening in new page
      const response = await fetch(videoFrameUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch video');
      }

      const blob = await response.blob();

      // Determine file extension based on blob MIME type
      const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
      console.log(
        `[Guest] Video blob type: ${blob.type}, using extension: ${extension}`
      );

      // Download blob directly
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `vshot-video-${store.roomId}-${Date.now()}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log(
        `[Guest] Video frame downloaded as ${extension.toUpperCase()}`
      );
    } catch (error) {
      console.error('[Guest] Failed to download video:', error);
      alert('영상 다운로드에 실패했습니다.');
    }
  };

  // Toggle Guest's display flip option
  const toggleGuestFlip = () => {
    const newFlipState = !guestFlipHorizontal;
    setGuestFlipHorizontal(newFlipState);

    // Broadcast to Host
    if (store.roomId) {
      sendMessage({
        type: 'guest-display-options',
        roomId: store.roomId,
        options: {
          flipHorizontal: newFlipState,
        },
      });
      console.log('[Guest] Sent display options:', {
        flipHorizontal: newFlipState,
      });
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  console.log('GUEST: isProcessing', isProcessing);

  // Step 1: Media selection and start
  if (!mediaReady) {
    return (
      <div className="min-h-screen bg-light text-dark flex items-center justify-center p-3 sm:p-8 landscape:p-3">
        <div className="max-w-md w-full bg-white border-2 border-neutral rounded-2xl shadow-lg p-4 sm:p-8 landscape:p-4">
          <h1 className="text-xl sm:text-3xl landscape:text-xl font-bold mb-3 sm:mb-6 landscape:mb-3 text-center text-dark">
            Guest 입장
          </h1>

          <div className="space-y-3 sm:space-y-6 landscape:space-y-3">
            <button
              onClick={startMedia}
              disabled={isCameraActive}
              className="w-full bg-secondary hover:bg-secondary-dark text-white font-bold py-3 sm:py-5 landscape:py-3 rounded-lg text-base sm:text-lg landscape:text-base disabled:opacity-50 transition shadow-md active:scale-95 touch-manipulation"
            >
              {isCameraActive ? '시작 중...' : '📷 카메라 시작'}
            </button>

            <div className="text-[10px] sm:text-xs landscape:text-[10px] text-dark/70 text-center font-medium">
              카메라를 시작하고 Room ID를 입력해주세요
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Room ID input with preview
  if (!isJoined) {
    return (
      <div className="flex flex-col h-full p-3 gap-3 overflow-hidden">
        {/* Room join form - fixed height at top */}
        <div className="flex-shrink-0 bg-white border-2 border-neutral rounded-lg p-2 shadow-md">
          <div className="flex items-center gap-2">
            {/* Back button */}
            <button
              onClick={() => {
                stopCamera();
                setMediaReady(false);
              }}
              className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-neutral/40 hover:bg-neutral rounded-lg transition"
              title="뒤로가기"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Room ID input */}
            <input
              type="text"
              value={roomIdInput}
              onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
              placeholder="Room ID"
              maxLength={6}
              className="flex-1 min-w-0 px-3 py-2 bg-neutral/40 border-2 border-neutral rounded-lg text-dark text-center text-lg font-bold tracking-widest focus:outline-none focus:border-primary"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  joinRoom();
                }
              }}
            />

            {/* Join button */}
            <button
              onClick={joinRoom}
              disabled={!roomIdInput.trim()}
              className="flex-shrink-0 px-4 py-2 bg-secondary hover:bg-secondary-dark text-white font-bold rounded-lg disabled:opacity-50 transition shadow-md"
            >
              입장
            </button>
          </div>
        </div>

        {/* Video preview - flexible height */}
        <div className="flex-1 min-h-0 bg-gray-800 rounded-lg p-2 flex items-center justify-center">
          <div
            className="relative bg-black rounded-lg overflow-hidden h-full"
            style={{ aspectRatio: '2/3' }}
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `
                  linear-gradient(45deg, #333 25%, transparent 25%),
                  linear-gradient(-45deg, #333 25%, transparent 25%),
                  linear-gradient(45deg, transparent 75%, #333 75%),
                  linear-gradient(-45deg, transparent 75%, #333 75%)
                `,
                backgroundSize: '20px 20px',
                backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
              }}
            />
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                transform: guestFlipHorizontal ? 'scaleX(-1)' : 'scaleX(1)',
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  // Main screen
  return (
    <div className="flex flex-col h-full p-3 gap-3 overflow-hidden">
      <FlashOverlay show={showFlash} />

      {/* Navbar - fixed height */}
      <div className="flex-shrink-0 flex items-center gap-2 bg-white border-2 border-neutral rounded-lg p-2 shadow-md">
        {/* Back button */}
        <button
          onClick={() => {
            stopCamera();
            setIsJoined(false);
            setMediaReady(false);
          }}
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-neutral/40 hover:bg-neutral rounded-lg transition"
          title="뒤로가기"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Room ID */}
        {store.roomId && (
          <div className="bg-secondary px-3 py-1.5 rounded-lg shadow-md">
            <span className="text-xs opacity-90 text-white">Room:</span>
            <span className="text-sm font-bold ml-1 text-white">
              {store.roomId}
            </span>
          </div>
        )}

        {/* Connection status */}
        <ConnectionStatus
          isConnected={isConnected}
          peerId={store.peerId}
          remoteStream={remoteStream}
          role="guest"
        />
      </div>

      {/* Video Display - flexible height */}
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
        />
      </div>

      {/* Bottom Panel - fixed height */}
      <div className="flex-shrink-0 overflow-y-auto max-h-[40vh]">
        {/* Show countdown during capture */}
        {isPhotoSession && countdown !== null ? (
          <div className="bg-white border-2 border-primary rounded-lg p-4 shadow-md">
            <div className="flex items-center justify-center gap-4">
              <div className="text-5xl font-bold text-primary animate-pulse">
                {countdown}
              </div>
              <div>
                <div className="text-lg font-semibold text-dark">
                  사진 {photoCount + 1} / {totalPhotos}
                </div>
                <PhotoCounter current={photoCount} total={totalPhotos} />
              </div>
            </div>
          </div>
        ) : photos.length >= totalPhotos ? (
          /* Show photo selection panel after capture complete */
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
            />

            {/* Composition Status and Download Section */}
            {selectedPhotos.length === selectablePhotos && (
              <div className="bg-primary/10 rounded-lg p-3 border-2 border-primary shadow-md">
                {/* Loading State */}
                {isComposing && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 border-4 border-secondary border-t-transparent rounded-full animate-spin"></div>
                    <div className="text-sm font-semibold text-dark">
                      합성 진행 중...
                    </div>
                  </div>
                )}

                {/* Complete State - Download Buttons */}
                {!isComposing && photoFrameUrl && videoFrameUrl && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-dark">
                      <span>✅</span>
                      <span>생성 완료!</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={handleDownloadPhoto}
                        className="px-3 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold text-sm transition shadow-md flex items-center justify-center gap-1"
                      >
                        <span>📸</span>
                        <span>사진</span>
                      </button>
                      <button
                        onClick={handleDownloadVideo}
                        className="px-3 py-2 bg-secondary hover:bg-secondary-dark text-white rounded-lg font-semibold text-sm transition shadow-md flex items-center justify-center gap-1"
                      >
                        <span>🎥</span>
                        <span>동영상</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Default: Show settings panel */
          <div className="bg-white border-2 border-neutral rounded-lg p-3 shadow-md">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-dark/70">
                {remoteStream ? (
                  <span>
                    Host 크로마키: {hostChromaKeyEnabled ? 'ON' : 'OFF'}
                  </span>
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
                title="내 화면 좌우 반전"
              >
                {guestFlipHorizontal ? '↔️ 반전 ON' : '↔️ 반전 OFF'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
