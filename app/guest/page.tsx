"use client";

import {
  ConnectionStatus,
  FlashOverlay,
  PhotoCounter,
  PhotoSelectionPanel,
  ProcessingIndicator,
  SettingsPanel,
  VideoDisplayPanel,
} from "@/components";
import { useChromaKey } from "@/hooks/useChromaKey";
import { useCompositeCanvas } from "@/hooks/useCompositeCanvas";
import { usePhotoCapture } from "@/hooks/usePhotoCapture";
import { useSignaling } from "@/hooks/useSignaling";
import { useWebRTC } from "@/hooks/useWebRTC";
import {
  downloadPhotoFrameFromBlob,
  generatePhotoFrameBlob,
} from "@/lib/frame-generator";
import { useAppStore } from "@/lib/store";
import { ASPECT_RATIOS, type AspectRatio } from "@/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
export default function GuestPage() {
  const store = useAppStore();
  const { connect, sendMessage, on, off, isConnected } = useSignaling();
  const { localStream, remoteStream, startLocalStream } = useWebRTC({
    sendMessage,
    on,
  });

  const [roomIdInput, setRoomIdInput] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [streamType, setStreamType] = useState<"camera" | "screen">("camera");
  const [mediaReady, setMediaReady] = useState(false); // Media started before joining

  // Host's chroma key settings (received from Host)
  const [hostChromaKeyEnabled, setHostChromaKeyEnabled] = useState(true);
  const [hostSensitivity, setHostSensitivity] = useState(50);
  const [hostSmoothness, setHostSmoothness] = useState(10);

  // Display options (flip horizontal)
  const [guestFlipHorizontal, setGuestFlipHorizontal] = useState(false);
  const [hostFlipHorizontal, setHostFlipHorizontal] = useState(false);

  // Aspect ratio settings (received from Host)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("3:4");

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
    aspectRatio: aspectRatio,
    onFlash: () => {
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 300);
    },
  });

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteCanvasRef = useRef<HTMLCanvasElement>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement>(null);
  const capturePhotoRef = useRef<
    ((photoNumber: number) => Promise<void>) | null
  >(null);
  const initializedRef = useRef(false);

  // Use shared chroma key hook for remote video (Host's video)
  useChromaKey({
    videoElement: remoteVideoRef.current,
    canvasElement: remoteCanvasRef.current,
    stream: remoteStream,
    enabled: hostChromaKeyEnabled,
    sensitivity: hostSensitivity,
    smoothness: hostSmoothness,
    width: ASPECT_RATIOS[aspectRatio].width,
    height: ASPECT_RATIOS[aspectRatio].height,
  });

  // Use shared composite canvas hook
  useCompositeCanvas({
    compositeCanvas: compositeCanvasRef.current,
    backgroundVideo: localVideoRef.current,
    foregroundCanvas: remoteCanvasRef.current,
    localStream,
    remoteStream,
    width: ASPECT_RATIOS[aspectRatio].width,
    height: ASPECT_RATIOS[aspectRatio].height,
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

    if (existingRoomId && existingRole === "guest") {
      // Restore room ID to input field
      setRoomIdInput(existingRoomId);
    }
  }, []);

  // Join room (media already started)
  const joinRoom = async () => {
    if (!roomIdInput.trim()) {
      alert("Room ID를 입력해주세요.");
      return;
    }

    if (!mediaReady || !localStream) {
      alert("먼저 카메라 또는 화면 공유를 시작해주세요.");
      return;
    }

    if (!store.userId) {
      const userId = uuidv4();
      store.setUserId(userId);
    }

    try {
      console.log("[Guest] Connecting to server...");
      await connect();
      console.log("[Guest] Connected, joining room:", roomIdInput);

      // Set role before joining
      store.setRole("guest");

      sendMessage({
        type: "join",
        roomId: roomIdInput.trim().toUpperCase(),
        userId: store.userId,
        role: "guest",
      });

      setIsJoined(true);
    } catch (error) {
      console.error("[Guest] Error joining room:", error);
      alert("서버에 연결할 수 없습니다.");
    }
  };

  // Start camera or screen share
  const startMedia = async () => {
    try {
      let stream: MediaStream;

      if (streamType === "camera") {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: true,
        });
        console.log("[Guest] Camera started");
      } else {
        // Screen share
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: true,
        });
        console.log("[Guest] Screen share started");
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      await startLocalStream(() => Promise.resolve(stream));
      setIsCameraActive(true);
      setMediaReady(true);
    } catch (error) {
      console.error("[Guest] Media error:", error);
      alert("카메라에 접근할 수 없습니다.");
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
      console.log("[Guest] Local stream connected");
    }
  }, [localStream]);

  // Re-setup local video when transitioning to main screen
  useEffect(() => {
    if (isJoined && localStream && localVideoRef.current) {
      // Re-attach stream after screen transition
      localVideoRef.current.srcObject = localStream;
      console.log("[Guest] Local stream re-attached after joining");
    }
  }, [isJoined, localStream]);

  // Setup remote video
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      console.log("[Guest] Remote stream connected");
    }
  }, [remoteStream]);

  // Wrap capturePhoto in useCallback to prevent stale closures in event handlers
  const capturePhoto = useCallback(
    async (photoNumber: number) => {
      const localVideo = localVideoRef.current;
      if (localVideo && store.roomId) {
        try {
          await captureAndUpload({
            photoNumber,
            canvasOrVideo: localVideo,
            isCanvas: false,
          });

          if (photoNumber >= 8) {
            setIsPhotoSession(false);
            // Note: Don't call startProcessing() here
            // Server will broadcast photos-merged which will set isProcessing to false
            // If we call startProcessing() here, it creates a race condition
            console.log("[Guest] Photo upload complete, waiting for merge...");
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
      console.log("[Guest] Received merged photos from server:", message);

      if (message.photos && Array.isArray(message.photos)) {
        // Create photos array with merged images
        const API_URL =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        const mergedPhotos = message.photos
          .sort((a: any, b: any) => a.photoNumber - b.photoNumber)
          .map((photo: any) => `${API_URL}${photo.mergedImageUrl}`);

        // End photo session to prevent race condition with capturePhoto
        setIsPhotoSession(false);
        setMergedPhotos(mergedPhotos);
        console.log(`[Guest] Displayed ${mergedPhotos.length} merged photos`);
      }
    };

    on("photos-merged", handlePhotosMerged);

    return () => {
      // Cleanup if needed
    };
  }, [on, setMergedPhotos]);

  // Listen to video frame ready event
  useEffect(() => {
    const handleVideoFrameReady = async (message: any) => {
      console.log("[Guest] Video frame ready:", message);

      if (message.videoUrl) {
        const API_URL =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        const fullUrl = `${API_URL}${message.videoUrl}`;

        console.log("[Guest] Video frame URL received:", fullUrl);

        // Store video URL and end composition
        setVideoFrameUrl(fullUrl);
        setIsComposing(false);
        console.log(
          "[Guest] Composition complete - photo and video ready for download"
        );
      }
    };

    on("video-frame-ready", handleVideoFrameReady);

    return () => {
      // Cleanup if needed
    };
  }, [on]);

  // Listen to photo session events and chroma key settings
  useEffect(() => {
    const handlePhotoSessionStart = (message: any) => {
      console.log("[Guest] Photo session started");
      setIsPhotoSession(true);
      resetCapture();
    };

    const handleCountdownTick = (message: any) => {
      console.log("[Guest] Countdown:", message.count);
      setCountdown(message.count);

      if (message.count === 0) {
        setTimeout(() => setCountdown(null), 500);
      }
    };

    const handleCaptureNow = (message: any) => {
      console.log("[Guest] Capture now:", message.photoNumber);
      if (capturePhotoRef.current) {
        capturePhotoRef.current(message.photoNumber);
      }
    };

    const handleChromaKeySettings = (message: any) => {
      console.log(
        "[Guest] Received chroma key settings from Host:",
        message.settings
      );
      if (message.settings) {
        setHostChromaKeyEnabled(message.settings.enabled);
        setHostSensitivity(message.settings.similarity);
        setHostSmoothness(message.settings.smoothness);
      }
    };

    const handleSessionSettings = (message: any) => {
      console.log("[Guest] Received session settings from server:", message);
      if (message.settings) {
        console.log(
          "[Guest] Session settings - recordingDuration:",
          message.settings.recordingDuration,
          "captureInterval:",
          message.settings.captureInterval
        );
      }
    };

    const handleHostDisplayOptions = (message: any) => {
      console.log("[Guest] Received host display options:", message.options);
      if (message.options) {
        setHostFlipHorizontal(message.options.flipHorizontal);
      }
    };

    const handleAspectRatioSettings = (message: any) => {
      console.log("[Guest] Received aspect ratio settings:", message.settings);
      if (message.settings && message.settings.ratio) {
        setAspectRatio(message.settings.ratio);
      }
    };

    on("photo-session-start", handlePhotoSessionStart);
    on("countdown-tick", handleCountdownTick);
    on("capture-now", handleCaptureNow);
    on("chromakey-settings", handleChromaKeySettings);
    on("session-settings", handleSessionSettings);
    on("host-display-options", handleHostDisplayOptions);
    on("aspect-ratio-settings", handleAspectRatioSettings);

    console.log("[Guest] Event handlers registered");

    return () => {
      // Cleanup listeners if needed
      console.log("[Guest] Cleaning up event handlers");
    };
  }, [on]); // Only depend on 'on', use capturePhotoRef for latest capturePhoto

  const togglePhotoSelection = (index: number) => {
    setSelectedPhotos((prev) => {
      if (prev.includes(index)) {
        // Deselect
        const newSelection = prev.filter((i) => i !== index);

        // Broadcast selection to Host
        if (store.roomId) {
          sendMessage({
            type: "photo-select",
            roomId: store.roomId,
            userId: store.userId,
            selectedIndices: newSelection,
          });
        }

        return newSelection;
      } else {
        // Select only if less than 4 selected
        if (prev.length < 4) {
          const newSelection = [...prev, index];

          // Broadcast selection to Host
          if (store.roomId) {
            sendMessage({
              type: "photo-select",
              roomId: store.roomId,
              userId: store.userId,
              selectedIndices: newSelection,
            });
          }

          return newSelection;
        }
        return prev;
      }
    });
  };

  const handleGenerateFrame = async () => {
    if (selectedPhotos.length !== 4) {
      alert("4장의 사진을 선택해주세요.");
      return;
    }

    if (!store.roomId) {
      alert("방에 참가하지 않았습니다.");
      return;
    }

    // Start composition process
    setIsComposing(true);
    setPhotoFrameUrl(null);
    setVideoFrameUrl(null);

    try {
      // 1. Generate photo frame (blob URL)
      const selectedPhotoUrls = selectedPhotos.map((index) => photos[index]);
      const photoBlobUrl = await generatePhotoFrameBlob(
        selectedPhotoUrls,
        aspectRatio
      );
      setPhotoFrameUrl(photoBlobUrl);
      console.log("[Guest] Photo frame generated");

      // 2. Request video frame from Host
      console.log(
        "[Guest] Requesting video frame with photos:",
        selectedPhotos
      );
      sendMessage({
        type: "video-frame-request",
        roomId: store.roomId,
        userId: store.userId,
        selectedPhotos,
      });
      console.log("[Guest] Video frame request sent to Host");
    } catch (error) {
      console.error("[Guest] Failed to generate photo frame:", error);
      alert("사진 프레임 생성에 실패했습니다.");
      setIsComposing(false);
    }
  };

  // Download photo frame
  const handleDownloadPhoto = () => {
    if (photoFrameUrl && store.roomId) {
      downloadPhotoFrameFromBlob(photoFrameUrl, store.roomId);
      console.log("[Guest] Photo frame downloaded");
    }
  };

  // Download video frame
  const handleDownloadVideo = async () => {
    if (!videoFrameUrl || !store.roomId) return;

    try {
      // Fetch video as blob to prevent opening in new page
      const response = await fetch(videoFrameUrl);
      if (!response.ok) {
        throw new Error("Failed to fetch video");
      }

      const blob = await response.blob();

      // Download blob directly
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `vshot-video-${store.roomId}-${Date.now()}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log("[Guest] Video frame downloaded");
    } catch (error) {
      console.error("[Guest] Failed to download video:", error);
      alert("영상 다운로드에 실패했습니다.");
    }
  };

  // Toggle Guest's display flip option
  const toggleGuestFlip = () => {
    const newFlipState = !guestFlipHorizontal;
    setGuestFlipHorizontal(newFlipState);

    // Broadcast to Host
    if (store.roomId) {
      sendMessage({
        type: "guest-display-options",
        roomId: store.roomId,
        options: {
          flipHorizontal: newFlipState,
        },
      });
      console.log("[Guest] Sent display options:", {
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

  console.log("GUEST: isProcessing", isProcessing);

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
              {isCameraActive ? "시작 중..." : "📷 카메라 시작"}
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
      <div className="min-h-screen bg-light text-dark p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold mb-8 text-center text-dark">
            Guest 입장
          </h1>

          <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 mb-6">
            {/* Video preview */}
            <div className="flex justify-center lg:justify-start">
              <div className="bg-gray-800 rounded-lg p-4 w-full max-w-[90vw] lg:max-w-none mx-auto lg:mx-0">
                <h2 className="text-xl font-semibold mb-4">미리보기</h2>
                <div
                  className="relative bg-black rounded-lg overflow-hidden w-full lg:h-[calc(90vh-12rem)]"
                  style={{ aspectRatio: "3/4" }}
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
                      backgroundSize: "20px 20px",
                      backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
                    }}
                  />
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{
                      transform: guestFlipHorizontal
                        ? "scaleX(-1)"
                        : "scaleX(1)",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Room join form */}
            <div className="bg-white border-2 border-neutral rounded-lg p-6 flex flex-col justify-center shadow-md">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold mb-3 text-dark">
                    Room ID
                  </label>
                  <input
                    type="text"
                    value={roomIdInput}
                    onChange={(e) =>
                      setRoomIdInput(e.target.value.toUpperCase())
                    }
                    placeholder="예: ABC123"
                    maxLength={6}
                    className="w-full px-4 py-4 bg-neutral/40 border-2 border-neutral rounded-lg text-dark text-center text-2xl font-bold tracking-widest focus:outline-none focus:border-primary"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        joinRoom();
                      }
                    }}
                  />
                </div>

                <button
                  onClick={joinRoom}
                  disabled={!roomIdInput.trim()}
                  className="w-full bg-secondary hover:bg-secondary-dark text-white font-bold py-5 rounded-lg text-lg disabled:opacity-50 transition shadow-md"
                >
                  입장하기
                </button>

                <div className="text-xs text-dark/70 text-center font-medium">
                  Host로부터 받은 Room ID를 입력하세요
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main screen
  return (
    <div className="min-h-screen bg-light text-dark p-8 sm:p-4 landscape:p-2">
      <FlashOverlay show={showFlash} />

      <div className="max-w-6xl mx-auto">
        {/* Compact header for landscape */}
        <div className="mb-2 sm:mb-4 landscape:mb-2">
          <div className="flex flex-col landscape:flex-row gap-2 landscape:gap-3 items-start landscape:items-center landscape:justify-between">
            <h1 className="text-lg sm:text-2xl landscape:text-lg font-bold text-dark">
              Guest
            </h1>
            <div className="flex flex-wrap gap-2 items-center">
              {store.roomId && (
                <div className="bg-secondary px-2 sm:px-4 py-1 sm:py-2 landscape:py-1 rounded-lg shadow-md">
                  <span className="text-xs opacity-90 text-white">Room:</span>
                  <span className="text-sm sm:text-lg landscape:text-sm font-bold ml-1 sm:ml-2 text-white">
                    {store.roomId}
                  </span>
                </div>
              )}
              <ConnectionStatus
                isConnected={isConnected}
                peerId={store.peerId}
                remoteStream={remoteStream}
                role="guest"
              />
            </div>
          </div>
        </div>

        {/* Main Layout: Video (left) + Settings (right) on PC, stacked on mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 mb-6">
          {/* Left Column: Video Display */}
          <div className="flex justify-center lg:justify-start">
            <VideoDisplayPanel
              role="guest"
              isActive={isCameraActive}
              remoteStream={remoteStream}
              localVideoRef={localVideoRef}
              remoteVideoRef={remoteVideoRef}
              remoteCanvasRef={remoteCanvasRef}
              compositeCanvasRef={compositeCanvasRef}
              aspectRatio={aspectRatio}
              flipHorizontal={guestFlipHorizontal}
              countdown={countdown}
            />
          </div>

          {/* Right Column: Settings Panel */}
          <div className="space-y-6 lg:max-h-[90vh] lg:overflow-y-auto lg:pr-2">
            {/* Display Controls */}
            <SettingsPanel title="설정">
              <div className="space-y-4">
                <div className="text-sm text-dark/70">
                  {remoteStream && (
                    <div className="mb-2">
                      Host 크로마키: {hostChromaKeyEnabled ? "ON" : "OFF"}
                      {hostChromaKeyEnabled &&
                        ` (${hostSensitivity}/${hostSmoothness})`}
                    </div>
                  )}
                  {!remoteStream && (
                    <div className="mb-2">Host를 기다리는 중...</div>
                  )}
                </div>

                <button
                  onClick={toggleGuestFlip}
                  className={`w-full px-4 py-3 rounded-lg font-semibold text-sm transition shadow-md ${
                    guestFlipHorizontal
                      ? "bg-primary hover:bg-primary-dark text-white"
                      : "bg-neutral hover:bg-neutral-dark text-dark"
                  }`}
                  title="내 화면 좌우 반전"
                >
                  {guestFlipHorizontal ? "↔️ 반전 ON" : "↔️ 반전 OFF"}
                </button>
              </div>
            </SettingsPanel>

            {/* Photo status panel */}
            {remoteStream && (
              <SettingsPanel title="사진 촬영">
                <div className="mb-4">
                  <PhotoCounter current={photoCount} total={8} />

                  {isPhotoSession ? (
                    <div className="px-6 py-3 bg-secondary text-white rounded-lg text-center text-base font-semibold shadow-md">
                      촬영 중...
                    </div>
                  ) : photoCount >= 8 ? (
                    <div className="px-6 py-3 bg-primary text-white rounded-lg text-center text-base font-semibold shadow-md">
                      촬영 완료!
                    </div>
                  ) : (
                    <div className="px-6 py-3 bg-neutral/40 border border-neutral rounded-lg text-center text-sm text-dark/70 font-medium">
                      Host가 촬영을 시작하면 자동으로 시작됩니다
                    </div>
                  )}
                </div>
              </SettingsPanel>
            )}
          </div>
        </div>

        {/* Full-width panels below */}
        <div className="space-y-6">
          <ProcessingIndicator show={isProcessing} />

          <div>
            <PhotoSelectionPanel
              photos={photos}
              selectedPhotos={selectedPhotos}
              onPhotoSelect={togglePhotoSelection}
              onGenerateFrame={handleGenerateFrame}
              maxSelection={4}
              readOnly={false}
              role="guest"
              isGenerating={isComposing}
            />
          </div>

          {/* Composition Status and Download Section */}
          {selectedPhotos.length === 4 && photos.length >= 8 && (
            <div className="bg-primary/10 rounded-lg p-3 sm:p-6 landscape:p-3 landscape:col-span-2 landscape:order-4 border-2 border-primary shadow-md">
              <div className="flex items-start gap-2 sm:gap-4 landscape:gap-2">
                <div className="text-2xl sm:text-4xl landscape:text-2xl">
                  🎬
                </div>
                <div className="flex-1">
                  <h2 className="text-lg sm:text-2xl landscape:text-base font-semibold mb-1 sm:mb-2 landscape:mb-1 text-dark">
                    사진 및 영상 생성
                  </h2>

                  {/* Loading State */}
                  {isComposing && (
                    <div className="bg-white rounded-lg p-3 sm:p-6 landscape:p-3 border-2 border-secondary">
                      <div className="flex items-center gap-2 sm:gap-4 landscape:gap-2 mb-2 sm:mb-4 landscape:mb-2">
                        <div className="w-8 h-8 sm:w-12 sm:h-12 landscape:w-8 landscape:h-8 border-4 border-secondary border-t-transparent rounded-full animate-spin"></div>
                        <div>
                          <h3 className="text-sm sm:text-lg landscape:text-xs font-semibold text-dark">
                            합성 진행 중...
                          </h3>
                          <p className="text-xs sm:text-sm landscape:text-[10px] text-dark/70">
                            사진 및 영상을 생성하고 있습니다.
                          </p>
                        </div>
                      </div>
                      <div className="space-y-1 sm:space-y-2 landscape:space-y-1">
                        <div className="flex items-center gap-2 text-xs sm:text-sm landscape:text-[10px]">
                          <span
                            className={
                              photoFrameUrl ? "text-primary" : "text-dark/40"
                            }
                          >
                            {photoFrameUrl ? "✅" : "⏳"}
                          </span>
                          <span
                            className={
                              photoFrameUrl
                                ? "text-dark font-semibold"
                                : "text-dark/70"
                            }
                          >
                            사진 프레임 생성 {photoFrameUrl ? "완료" : "중..."}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs sm:text-sm landscape:text-[10px]">
                          <span className="text-dark/40">⏳</span>
                          <span className="text-dark/70">
                            영상 프레임 생성 중...
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Complete State - Download Buttons */}
                  {!isComposing && photoFrameUrl && videoFrameUrl && (
                    <div className="bg-white rounded-lg p-3 sm:p-6 landscape:p-3 border-2 border-primary">
                      <div className="flex items-center gap-2 sm:gap-3 landscape:gap-2 mb-2 sm:mb-4 landscape:mb-2">
                        <span className="text-2xl sm:text-3xl landscape:text-xl">
                          ✅
                        </span>
                        <div>
                          <h3 className="text-sm sm:text-lg landscape:text-xs font-semibold text-dark">
                            생성 완료!
                          </h3>
                          <p className="text-xs sm:text-sm landscape:text-[10px] text-dark/70">
                            사진과 영상이 준비되었습니다.
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 landscape:gap-2">
                        <button
                          onClick={handleDownloadPhoto}
                          className="px-4 py-3 sm:px-6 sm:py-4 landscape:px-3 landscape:py-2 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold text-sm sm:text-lg landscape:text-xs transition shadow-md flex items-center justify-center gap-2 active:scale-95 touch-manipulation"
                        >
                          <span>📸</span>
                          <span>사진 다운로드</span>
                        </button>
                        <button
                          onClick={handleDownloadVideo}
                          className="px-4 py-3 sm:px-6 sm:py-4 landscape:px-3 landscape:py-2 bg-secondary hover:bg-secondary-dark text-white rounded-lg font-semibold text-sm sm:text-lg landscape:text-xs transition shadow-md flex items-center justify-center gap-2 active:scale-95 touch-manipulation"
                        >
                          <span>🎥</span>
                          <span>동영상 다운로드</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Initial State - Info */}
                  {!isComposing && !photoFrameUrl && !videoFrameUrl && (
                    <div>
                      <p className="text-xs sm:text-base landscape:text-[10px] text-dark/70 mb-2 sm:mb-4 landscape:mb-2">
                        선택한 4개의 사진과 영상을 2x2 그리드로 합성하여
                        제공합니다.
                      </p>
                      <div className="bg-neutral/30 border border-neutral rounded-lg p-2 sm:p-4 landscape:p-2 space-y-1 sm:space-y-2 landscape:space-y-1">
                        <div className="flex items-center gap-2 text-xs sm:text-sm landscape:text-[10px] text-dark">
                          <span className="text-primary font-bold">1.</span>
                          <span>사진 프레임을 2x2 그리드로 생성</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs sm:text-sm landscape:text-[10px] text-dark">
                          <span className="text-primary font-bold">2.</span>
                          <span>Host에게 영상 합성 요청</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs sm:text-sm landscape:text-[10px] text-dark">
                          <span className="text-primary font-bold">3.</span>
                          <span>생성 완료 후 각각 다운로드</span>
                        </div>
                      </div>
                      <div className="mt-2 sm:mt-4 landscape:mt-2 p-2 sm:p-3 landscape:p-2 bg-secondary/10 border border-secondary rounded-lg">
                        <p className="text-[10px] sm:text-xs landscape:text-[9px] text-dark/80 font-medium">
                          ℹ️ 위의 "프레임 생성하기" 버튼을 클릭하면 사진과
                          영상이 자동으로 생성됩니다.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Usage info */}
          {!remoteStream && isCameraActive && (
            <div className="bg-white border-2 border-neutral rounded-lg p-6 shadow-md">
              <h2 className="text-xl font-semibold mb-4 text-dark">안내</h2>
              <ul className="list-disc list-inside space-y-2 text-dark/80">
                <li>Host가 연결되면 자동으로 영상이 표시됩니다</li>
                <li>
                  Host의 크로마키를 활성화하여 녹색 배경을 제거할 수 있습니다
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
