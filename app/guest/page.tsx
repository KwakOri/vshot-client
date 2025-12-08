"use client";

import {
  ConnectionStatus,
  CountdownOverlay,
  FlashOverlay,
  PhotoSelectionPanel,
  PhotoThumbnailGrid,
  ProcessingIndicator,
} from "@/components";
import { useChromaKey } from "@/hooks/useChromaKey";
import { useCompositeCanvas } from "@/hooks/useCompositeCanvas";
import { usePhotoCapture } from "@/hooks/usePhotoCapture";
import { useSignaling } from "@/hooks/useSignaling";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useAppStore } from "@/lib/store";
import { downloadPhotoFrame } from "@/lib/frame-generator";
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

  // Photo capture state
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  const [isPhotoSession, setIsPhotoSession] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<number[]>([]);
  const [isGeneratingFrame, setIsGeneratingFrame] = useState(false);

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
  });

  // Use shared composite canvas hook
  useCompositeCanvas({
    compositeCanvas: compositeCanvasRef.current,
    backgroundVideo: localVideoRef.current,
    foregroundCanvas: remoteCanvasRef.current,
    localStream,
    remoteStream,
  });

  // Initialize
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (!store.userId) {
      const userId = uuidv4();
      store.setUserId(userId);
      console.log("[Guest] userId:", userId);
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
      alert(
        `${
          streamType === "camera" ? "카메라" : "화면 공유"
        }에 접근할 수 없습니다.`
      );
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
    const handleVideoFrameReady = (message: any) => {
      console.log('[Guest] Video frame ready:', message);

      if (message.videoUrl) {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
        const fullUrl = `${API_URL}${message.videoUrl}`;

        console.log('[Guest] Downloading video from:', fullUrl);

        // Auto download video
        const link = document.createElement('a');
        link.href = fullUrl;
        link.download = `vshot-frame-${store.roomId}-${Date.now()}.mp4`;
        link.click();

        alert('영상 프레임이 다운로드되었습니다! 🎉');
      }
    };

    on('video-frame-ready', handleVideoFrameReady);

    return () => {
      // Cleanup if needed
    };
  }, [on, store.roomId]);

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
        console.log("[Guest] Session settings - recordingDuration:", message.settings.recordingDuration, "captureInterval:", message.settings.captureInterval);
      }
    };

    on("photo-session-start", handlePhotoSessionStart);
    on("countdown-tick", handleCountdownTick);
    on("capture-now", handleCaptureNow);
    on("chromakey-settings", handleChromaKeySettings);
    on("session-settings", handleSessionSettings);

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
      alert('4장의 사진을 선택해주세요.');
      return;
    }

    setIsGeneratingFrame(true);
    try {
      await downloadPhotoFrame(photos, selectedPhotos, store.roomId || 'frame');
      console.log('[Guest] Photo frame generated and downloaded');
    } catch (error) {
      console.error('[Guest] Failed to generate frame:', error);
      alert('프레임 생성에 실패했습니다.');
    } finally {
      setIsGeneratingFrame(false);
    }
  };

  const handleRequestVideoFrame = () => {
    if (selectedPhotos.length !== 4) {
      alert('4장의 사진을 선택해주세요.');
      return;
    }

    if (!store.roomId) {
      alert('방에 참가하지 않았습니다.');
      return;
    }

    console.log('[Guest] Requesting video frame with photos:', selectedPhotos);

    // Send video frame request to server
    sendMessage({
      type: 'video-frame-request',
      roomId: store.roomId,
      userId: store.userId,
      selectedPhotos,
    });

    alert('Host에게 영상 프레임 생성 요청을 전송했습니다!\n잠시 후 영상이 자동으로 다운로드됩니다.');
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
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-gray-800 rounded-2xl shadow-2xl p-8">
          <h1 className="text-3xl font-bold mb-6 text-center">Guest 입장</h1>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-3">
                영상 소스 선택
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setStreamType("camera")}
                  disabled={isCameraActive}
                  className={`px-4 py-3 rounded-lg font-semibold transition ${
                    streamType === "camera"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  } disabled:opacity-50`}
                >
                  📷 카메라
                </button>
                <button
                  onClick={() => setStreamType("screen")}
                  disabled={isCameraActive}
                  className={`px-4 py-3 rounded-lg font-semibold transition ${
                    streamType === "screen"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  } disabled:opacity-50`}
                >
                  🖥️ 화면 공유
                </button>
              </div>
            </div>

            <button
              onClick={startMedia}
              disabled={isCameraActive}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-lg text-lg disabled:opacity-50 transition"
            >
              {isCameraActive
                ? "시작 중..."
                : `${streamType === "camera" ? "카메라" : "화면 공유"} 시작`}
            </button>

            <div className="text-xs text-gray-400 text-center">
              먼저 영상 소스를 선택하고 시작해주세요
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Room ID input with preview
  if (!isJoined) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-6 text-center">Guest 입장</h1>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Video preview */}
            <div className="bg-gray-800 rounded-2xl p-6">
              <h2 className="text-xl font-semibold mb-4">미리보기</h2>
              <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
                />
              </div>
              <div className="mt-3 text-sm text-green-400 text-center">
                ✓ {streamType === "camera" ? "카메라" : "화면 공유"} 활성화됨
              </div>
            </div>

            {/* Room join form */}
            <div className="bg-gray-800 rounded-2xl p-6 flex flex-col justify-center">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-2">
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
                    className="w-full px-4 py-3 bg-gray-700 rounded-lg text-white text-center text-2xl font-bold tracking-widest"
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
                  className="w-full bg-pink-600 hover:bg-pink-700 text-white font-bold py-4 rounded-lg text-lg disabled:opacity-50 transition"
                >
                  입장하기
                </button>

                <div className="text-xs text-gray-400 text-center">
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
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <FlashOverlay show={showFlash} />

      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-4">Guest (Camera)</h1>
          <div className="space-y-3">
            {store.roomId && (
              <div className="bg-pink-600 px-6 py-3 rounded-lg inline-block">
                <span className="text-sm opacity-80">Room ID:</span>
                <span className="text-2xl font-bold ml-2">{store.roomId}</span>
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

        {/* Controls */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            {remoteStream && (
              <div className="text-sm text-gray-400">
                Host 크로마키: {hostChromaKeyEnabled ? "ON" : "OFF"}
                {hostChromaKeyEnabled &&
                  ` (민감도: ${hostSensitivity}, 부드러움: ${hostSmoothness})`}
              </div>
            )}
            {!remoteStream && (
              <div className="text-sm text-gray-400">Host를 기다리는 중...</div>
            )}
          </div>
        </div>

        {/* Video display */}
        <div className="grid grid-cols-1 gap-6">
          {/* Hidden video elements for processing */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="absolute opacity-0 pointer-events-none"
          />
          <canvas
            ref={remoteCanvasRef}
            className="absolute opacity-0 pointer-events-none"
          />

          {/* Main view - Show own video when alone, composite when connected */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-xl font-semibold mb-4">
              {remoteStream ? "합성 화면 (Guest + Host)" : "내 영상 (Guest)"}
            </h2>
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
              {/* Show own video when alone */}
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`absolute inset-0 w-full h-full object-cover scale-x-[-1] transition-opacity ${
                  remoteStream ? "opacity-0" : "opacity-100"
                }`}
              />

              {/* Show composite when connected */}
              <canvas
                ref={compositeCanvasRef}
                className={`absolute inset-0 w-full h-full object-cover transition-opacity ${
                  !remoteStream ? "opacity-0" : "opacity-100"
                }`}
              />

              <CountdownOverlay countdown={countdown} />

              {!isCameraActive && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                  카메라를 준비하는 중...
                </div>
              )}
            </div>
          </div>

          {/* Photo status panel */}
          {remoteStream && (
            <div className="bg-gray-800 rounded-lg p-4 mt-6">
              <h2 className="text-xl font-semibold mb-4">사진 촬영</h2>

              <div className="mb-4">
                <div className="text-lg mb-2">촬영: {photoCount} / 8</div>
                {isPhotoSession ? (
                  <div className="px-6 py-3 bg-yellow-600 rounded-lg text-center font-semibold">
                    촬영 중...
                  </div>
                ) : photoCount >= 8 ? (
                  <div className="px-6 py-3 bg-green-600 rounded-lg text-center font-semibold">
                    촬영 완료!
                  </div>
                ) : (
                  <div className="px-6 py-3 bg-gray-700 rounded-lg text-center text-gray-400">
                    Host가 촬영을 시작하면
                    <br />
                    자동으로 시작됩니다
                  </div>
                )}
              </div>

              <PhotoThumbnailGrid photos={photos} totalSlots={8} />
            </div>
          )}

          <ProcessingIndicator show={isProcessing} />

          <PhotoSelectionPanel
            photos={photos}
            selectedPhotos={selectedPhotos}
            onPhotoSelect={togglePhotoSelection}
            onGenerateFrame={handleGenerateFrame}
            maxSelection={4}
            readOnly={false}
            role="guest"
            isGenerating={isGeneratingFrame}
          />

          {/* Video Frame Request */}
          {selectedPhotos.length === 4 && photos.length >= 8 && (
            <div className="bg-gradient-to-r from-pink-900/50 to-purple-900/50 rounded-lg p-6 mt-6 border-2 border-pink-600">
              <div className="flex items-start gap-4">
                <div className="text-4xl">🎬</div>
                <div className="flex-1">
                  <h2 className="text-2xl font-semibold mb-2">영상 프레임 생성</h2>
                  <p className="text-gray-300 mb-4">
                    선택한 4개의 사진에 해당하는 영상을 2x2 그리드로 합성하여 MP4로 제공합니다.
                  </p>
                  <div className="bg-gray-800/50 rounded-lg p-4 space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-pink-400">1.</span>
                      <span>Host가 촬영한 영상을 자동으로 분할</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-pink-400">2.</span>
                      <span>선택한 4개 구간을 2x2 그리드로 합성</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-pink-400">3.</span>
                      <span>MP4 형식으로 변환 후 자동 다운로드</span>
                    </div>
                  </div>
                  <button
                    onClick={handleRequestVideoFrame}
                    className="w-full px-6 py-4 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 rounded-lg font-semibold text-lg transition shadow-lg transform hover:scale-105"
                  >
                    📹 영상 프레임 요청하기
                  </button>
                  <div className="mt-3 p-3 bg-blue-900/30 border border-blue-600/50 rounded-lg">
                    <p className="text-xs text-blue-200">
                      ℹ️ 요청 후 Host에서 자동으로 합성이 시작됩니다. 합성이 완료되면 영상이 자동으로 다운로드됩니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Usage info */}
        {!remoteStream && isCameraActive && (
          <div className="mt-8 bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">안내</h2>
            <ul className="list-disc list-inside space-y-2 text-gray-300">
              <li>Host가 연결되면 자동으로 영상이 표시됩니다</li>
              <li>
                Host의 크로마키를 활성화하여 녹색 배경을 제거할 수 있습니다
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
