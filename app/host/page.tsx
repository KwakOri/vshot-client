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
import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";

export default function HostPage() {
  const store = useAppStore();
  const { connect, sendMessage, on, off, isConnected } = useSignaling();
  const { localStream, remoteStream, startLocalStream, createOffer } =
    useWebRTC({ sendMessage, on });

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [chromaKeyEnabled, setChromaKeyEnabled] = useState(true); // Default ON for VR
  const [sensitivity, setSensitivity] = useState(50);
  const [smoothness, setSmoothness] = useState(10);

  // Photo capture state
  const [isCapturing, setIsCapturing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  const [peerSelectedPhotos, setPeerSelectedPhotos] = useState<number[]>([]);

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
  const localCanvasRef = useRef<HTMLCanvasElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement>(null);
  const initializedRef = useRef(false);

  // Use shared chroma key hook for local video
  useChromaKey({
    videoElement: localVideoRef.current,
    canvasElement: localCanvasRef.current,
    stream: localStream,
    enabled: chromaKeyEnabled,
    sensitivity,
    smoothness,
  });

  // Use shared composite canvas hook
  useCompositeCanvas({
    compositeCanvas: compositeCanvasRef.current,
    backgroundVideo: remoteVideoRef.current,
    foregroundCanvas: localCanvasRef.current,
    localStream,
    remoteStream,
  });

  // Initialize
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      let userId = store.userId;
      if (!userId) {
        userId = uuidv4();
        store.setUserId(userId);
        console.log("[Host] userId:", userId);
      }

      try {
        await connect();
        console.log("[Host] Connected to signaling server");

        sendMessage({
          type: "join",
          roomId: "",
          userId,
          role: "host",
        });
      } catch (error) {
        console.error("[Host] Connection failed:", error);
        alert("서버에 연결할 수 없습니다.");
      }
    };

    init();
  }, []);

  // Start camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: true,
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      await startLocalStream(() => Promise.resolve(stream));
      setIsCameraActive(true);
      console.log("[Host] Camera started");
    } catch (error) {
      console.error("[Host] Camera error:", error);
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

  // Send chroma key settings to Guest
  const updateChromaKeySettings = (
    enabled: boolean,
    sens: number,
    smooth: number
  ) => {
    if (!store.roomId) return;

    sendMessage({
      type: "chromakey-settings",
      roomId: store.roomId,
      settings: {
        enabled,
        color: "green",
        similarity: sens,
        smoothness: smooth,
      },
    });
  };

  // Watch for chroma key changes and broadcast
  useEffect(() => {
    if (store.roomId && remoteStream) {
      updateChromaKeySettings(chromaKeyEnabled, sensitivity, smoothness);
    }
  }, [chromaKeyEnabled, sensitivity, smoothness, store.roomId, remoteStream]);

  // Setup remote video
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      console.log("[Host] Remote stream connected");
    }
  }, [remoteStream]);

  // Listen to peer's photo selection
  useEffect(() => {
    const handlePhotoSelectSync = (message: any) => {
      console.log("[Host] Received peer photo selection:", message);
      const currentUserId = store.userId;
      if (message.userId !== currentUserId) {
        setPeerSelectedPhotos(message.selectedIndices);
      }
    };

    on("photo-select-sync", handlePhotoSelectSync);

    return () => {
      // Cleanup if needed
    };
  }, [on, store.userId]);

  // Listen to merged photos from server
  useEffect(() => {
    const handlePhotosMerged = (message: any) => {
      console.log("[Host] Received merged photos from server:", message);

      if (message.photos && Array.isArray(message.photos)) {
        // Create photos array with merged images
        const API_URL =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        const mergedPhotos = message.photos
          .sort((a: any, b: any) => a.photoNumber - b.photoNumber)
          .map((photo: any) => `${API_URL}${photo.mergedImageUrl}`);

        setMergedPhotos(mergedPhotos);
        console.log(`[Host] Displayed ${mergedPhotos.length} merged photos`);
      }
    };

    on("photos-merged", handlePhotosMerged);

    return () => {
      // Cleanup if needed
    };
  }, [on, setMergedPhotos]);

  // Photo capture logic
  const startPhotoSession = () => {
    if (!store.roomId) return;

    setIsCapturing(true);
    resetCapture();

    sendMessage({
      type: "photo-session-start",
      roomId: store.roomId,
    });

    // Start first photo after a brief delay
    setTimeout(() => {
      takePhoto(1);
    }, 1000);
  };

  // Photo selection is Guest-only, Host just displays Guest's selections

  const takePhoto = (photoNumber: number) => {
    if (!store.roomId || photoNumber > 8) {
      setIsCapturing(false);
      return;
    }

    let count = 3;
    setCountdown(count);

    // Send countdown ticks
    sendMessage({
      type: "countdown-tick",
      roomId: store.roomId,
      count,
      photoNumber,
    });

    const interval = setInterval(() => {
      count--;

      if (count <= 0) {
        clearInterval(interval);
        setCountdown(null);

        // Send final countdown
        sendMessage({
          type: "countdown-tick",
          roomId: store.roomId!,
          count: 0,
          photoNumber,
        });

        // Capture the photo
        capturePhoto(photoNumber);
      } else {
        setCountdown(count);
        sendMessage({
          type: "countdown-tick",
          roomId: store.roomId!,
          count,
          photoNumber,
        });
      }
    }, 1000);
  };

  const capturePhoto = async (photoNumber: number) => {
    // Send capture signal
    if (store.roomId) {
      sendMessage({
        type: "capture-now",
        roomId: store.roomId,
        photoNumber,
      });
    }

    // Capture ONLY local canvas (Host's chroma key layer) for high-quality server-side merge
    const localCanvas = localCanvasRef.current;
    if (localCanvas && store.roomId) {
      try {
        await captureAndUpload({
          photoNumber,
          canvasOrVideo: localCanvas,
          isCanvas: true,
        });

        // Take next photo
        if (photoNumber < 8) {
          setTimeout(() => {
            takePhoto(photoNumber + 1);
          }, 2000);
        } else {
          setIsCapturing(false);
          startProcessing();
          console.log("[Host] Photo session complete, waiting for merge...");
        }
      } catch (error) {
        console.error(`[Host] Failed to upload photo ${photoNumber}:`, error);
        alert(`사진 ${photoNumber} 업로드에 실패했습니다.`);
      }
    }
  };

  // Auto-start camera when room is created
  useEffect(() => {
    if (store.roomId && !isCameraActive && !localStream) {
      console.log("[Host] Room created, auto-starting camera");
      startCamera();
    }
  }, [store.roomId]);

  // Create offer when peer joins
  useEffect(() => {
    if (store.peerId && localStream) {
      console.log(
        "[Host] Peer joined, waiting before creating offer:",
        store.peerId
      );
      // Wait a bit for guest to initialize their stream
      const timer = setTimeout(() => {
        console.log("[Host] Creating offer for peer:", store.peerId);
        createOffer().catch((error) => {
          console.error("[Host] Failed to create offer:", error);
        });
      }, 1000); // 1 second delay to ensure guest is ready

      return () => clearTimeout(timer);
    }
  }, [store.peerId, localStream, createOffer]);

  // Cleanup
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  console.log("HOST: isProcessing", isProcessing);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <FlashOverlay show={showFlash} />

      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-4">
            Host (VTuber with Chroma Key)
          </h1>
          <div className="space-y-3">
            {store.roomId && (
              <div className="bg-purple-600 px-6 py-3 rounded-lg inline-block">
                <span className="text-sm opacity-80">Room ID:</span>
                <span className="text-2xl font-bold ml-2">{store.roomId}</span>
              </div>
            )}
            <ConnectionStatus
              isConnected={isConnected}
              peerId={store.peerId}
              remoteStream={remoteStream}
              role="host"
            />
          </div>
        </div>

        {/* Controls */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="flex flex-wrap gap-4 items-center mb-4">
            {!isCameraActive ? (
              <button
                onClick={startCamera}
                disabled={!isConnected}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition disabled:opacity-50"
              >
                {isConnected ? "카메라 시작" : "연결 중..."}
              </button>
            ) : (
              <button
                onClick={stopCamera}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition"
              >
                카메라 중지
              </button>
            )}

            {isCameraActive && (
              <button
                onClick={() => setChromaKeyEnabled(!chromaKeyEnabled)}
                className={`px-6 py-3 rounded-lg font-semibold transition ${
                  chromaKeyEnabled
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "bg-gray-600 hover:bg-gray-700"
                }`}
              >
                크로마키: {chromaKeyEnabled ? "ON" : "OFF"}
              </button>
            )}
          </div>

          {/* Chroma key settings */}
          {isCameraActive && chromaKeyEnabled && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  민감도 (Sensitivity): {sensitivity}
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sensitivity}
                  onChange={(e) => setSensitivity(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  부드러움 (Smoothness): {smoothness}
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={smoothness}
                  onChange={(e) => setSmoothness(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          )}
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
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute opacity-0 pointer-events-none"
          />

          {/* Main view - Show own video when alone, composite when connected */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-xl font-semibold mb-4">
              {remoteStream ? "합성 화면 (Guest + Host)" : "내 영상 (Host)"}
            </h2>
            <div className="relative rounded-lg overflow-hidden aspect-video">
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

              {/* Show own chroma key canvas when alone */}
              <canvas
                ref={localCanvasRef}
                className={`absolute inset-0 w-full h-full object-cover transition-opacity ${
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
                <div className="absolute inset-0 flex items-center justify-center text-gray-500 bg-black">
                  카메라를 시작해주세요
                </div>
              )}
            </div>
          </div>

          {/* Photo capture panel */}
          {remoteStream && (
            <div className="bg-gray-800 rounded-lg p-4 mt-6">
              <h2 className="text-xl font-semibold mb-4">사진 촬영</h2>

              <div className="mb-4">
                <div className="text-lg mb-2">촬영: {photoCount} / 8</div>
                <button
                  onClick={startPhotoSession}
                  disabled={!remoteStream || isCapturing}
                  className="w-full px-6 py-3 bg-pink-600 hover:bg-pink-700 rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCapturing ? "촬영 중..." : "촬영 시작"}
                </button>
              </div>

              <PhotoThumbnailGrid photos={photos} totalSlots={8} />
            </div>
          )}

          <ProcessingIndicator show={isProcessing} />

          <PhotoSelectionPanel
            photos={photos}
            selectedPhotos={[]}
            readOnly={true}
            role="host"
            peerSelectedPhotos={peerSelectedPhotos}
          />
        </div>

        {/* Usage info */}
        {!store.peerId && isCameraActive && (
          <div className="mt-8 bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">안내</h2>
            <ul className="list-disc list-inside space-y-2 text-gray-300">
              <li>Room ID를 Guest에게 공유하세요</li>
              <li>Guest가 입장하면 자동으로 연결됩니다</li>
              <li>크로마키를 활성화하여 녹색 배경을 제거할 수 있습니다</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
