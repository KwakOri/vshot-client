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
import { getApiHeadersMultipart } from "@/lib/api";
import { downloadPhotoFrame } from "@/lib/frame-generator";
import { VideoRecorder, downloadVideo } from "@/lib/video-recorder";
import { splitVideo, downloadSegments, cleanupSegments, type VideoSegment } from "@/lib/video-splitter";
import { composeVideoGrid, downloadComposedVideo } from "@/lib/video-composer";
import { composeVideoWithWebGL, downloadWebGLComposedVideo, type VideoSource } from "@/lib/webgl-video-composer";
import { ASPECT_RATIOS, type AspectRatio } from "@/types";
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

  // Display options (flip horizontal)
  const [hostFlipHorizontal, setHostFlipHorizontal] = useState(false);
  const [guestFlipHorizontal, setGuestFlipHorizontal] = useState(false);

  // Aspect ratio settings (must be declared before usePhotoCapture)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');

  // Photo capture state
  const [isCapturing, setIsCapturing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  const [peerSelectedPhotos, setPeerSelectedPhotos] = useState<number[]>([]);
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
    aspectRatio: aspectRatio,
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
  const videoRecorderRef = useRef<VideoRecorder | null>(null);

  // Video recording state - Individual segments per photo
  const [recordedSegments, setRecordedSegments] = useState<VideoSegment[]>([]);
  const [currentlyRecording, setCurrentlyRecording] = useState<number | null>(null); // photoNumber being recorded

  // Video composition state
  const [composedVideo, setComposedVideo] = useState<{ blob: Blob; url: string } | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [composeProgress, setComposeProgress] = useState('');

  // Timer settings
  const [recordingDuration, setRecordingDuration] = useState(10); // seconds
  const [captureInterval, setCaptureInterval] = useState(3); // seconds between photos

  // Use shared chroma key hook for local video
  useChromaKey({
    videoElement: localVideoRef.current,
    canvasElement: localCanvasRef.current,
    stream: localStream,
    enabled: chromaKeyEnabled,
    sensitivity,
    smoothness,
    width: ASPECT_RATIOS[aspectRatio].width,
    height: ASPECT_RATIOS[aspectRatio].height,
  });

  // Use shared composite canvas hook
  useCompositeCanvas({
    compositeCanvas: compositeCanvasRef.current,
    backgroundVideo: remoteVideoRef.current,
    foregroundCanvas: localCanvasRef.current,
    localStream,
    remoteStream,
    width: ASPECT_RATIOS[aspectRatio].width,
    height: ASPECT_RATIOS[aspectRatio].height,
    guestFlipHorizontal,
    hostFlipHorizontal,
  });

  // Initialize video recorder once
  useEffect(() => {
    if (!videoRecorderRef.current) {
      console.log('[Host] Creating VideoRecorder with canvas getter');
      videoRecorderRef.current = new VideoRecorder(() => compositeCanvasRef.current);
      console.log('[Host] VideoRecorder initialized with getter function');
    }
  }, []); // Initialize only once

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

  // Toggle Host's display flip option
  const toggleHostFlip = () => {
    const newFlipState = !hostFlipHorizontal;
    setHostFlipHorizontal(newFlipState);

    // Broadcast to Guest
    if (store.roomId) {
      sendMessage({
        type: 'host-display-options',
        roomId: store.roomId,
        options: {
          flipHorizontal: newFlipState,
        },
      });
      console.log('[Host] Sent display options:', { flipHorizontal: newFlipState });
    }
  };

  // Update aspect ratio settings and broadcast
  const updateAspectRatio = (ratio: AspectRatio) => {
    setAspectRatio(ratio);

    if (store.roomId) {
      const settings = {
        ratio,
        width: ASPECT_RATIOS[ratio].width,
        height: ASPECT_RATIOS[ratio].height,
      };

      sendMessage({
        type: 'aspect-ratio-settings',
        roomId: store.roomId,
        settings,
      });

      console.log('[Host] Sent aspect ratio settings:', settings);
    }
  };

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

  // Listen to guest display options
  useEffect(() => {
    const handleGuestDisplayOptions = (message: any) => {
      console.log("[Host] Received guest display options:", message.options);
      if (message.options) {
        setGuestFlipHorizontal(message.options.flipHorizontal);
      }
    };

    on("guest-display-options", handleGuestDisplayOptions);

    return () => {
      // Cleanup if needed
    };
  }, [on]);

  // Listen to session settings broadcast from server
  useEffect(() => {
    const handleSessionSettings = (message: any) => {
      console.log("[Host] Received session settings broadcast from server:", message);
      if (message.settings) {
        console.log("[Host] Broadcast settings - recordingDuration:", message.settings.recordingDuration, "captureInterval:", message.settings.captureInterval);
      }
    };

    on("session-settings", handleSessionSettings);

    return () => {
      // Cleanup if needed
    };
  }, [on]);

  // Listen to video frame request from Guest
  useEffect(() => {
    const handleVideoFrameRequest = async (message: any) => {
      console.log('[Host] Received video frame request:', message);

      if (message.selectedPhotos && message.selectedPhotos.length === 4) {
        console.log('[Host] Auto-composing video frame for photos:', message.selectedPhotos);

        // Update peer selected photos
        setPeerSelectedPhotos(message.selectedPhotos);

        // Auto-compose and upload video
        await autoComposeAndUploadVideo(message.selectedPhotos);
      }
    };

    on('video-frame-request', handleVideoFrameRequest);

    return () => {
      // Cleanup if needed
    };
  }, [on, recordedSegments, recordingDuration, captureInterval]);

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

    console.log('[Host] ========== PHOTO SESSION START (Individual Recording) ==========');
    console.log('[Host] Session settings:');
    console.log('[Host]  - recordingDuration:', recordingDuration, 'seconds (영상 녹화 시간 = 촬영 카운트다운 시간)');
    console.log('[Host]  - captureInterval:', captureInterval, 'seconds (사진 촬영 후 다음 사진까지 대기 시간)');
    console.log('[Host] Mode: Individual segment recording (no FFmpeg splitting needed!)');
    console.log('[Host] ================================================');

    setIsCapturing(true);
    resetCapture();
    setRecordedSegments([]); // Clear previous segments
    setCurrentlyRecording(null);

    // Send session settings to server
    const sessionSettings = {
      type: "session-settings" as const,
      roomId: store.roomId,
      settings: {
        recordingDuration,
        captureInterval,
      },
    };
    console.log('[Host] Sending session settings to server:', sessionSettings);
    sendMessage(sessionSettings);

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

    console.log('[Host] ========== Taking photo', photoNumber, '==========');
    console.log('[Host] Starting individual video recording for this segment');

    // Start individual video recording for this photo
    if (videoRecorderRef.current) {
      setCurrentlyRecording(photoNumber);

      const recordingStartTime = Date.now();

      try {
        videoRecorderRef.current.startRecording(
          photoNumber,
          recordingDuration * 1000, // Convert seconds to milliseconds
          (blob, completedPhotoNumber) => {
            // Recording complete callback
            const recordingEndTime = Date.now();
            const duration = (recordingEndTime - recordingStartTime) / 1000;

            console.log(`[Host] ✅ Video segment ${completedPhotoNumber} recorded:`, {
              size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
              duration: `${duration.toFixed(2)}s`
            });

            // Create VideoSegment
            const segment: VideoSegment = {
              photoNumber: completedPhotoNumber,
              blob,
              url: URL.createObjectURL(blob),
              startTime: 0, // Each segment starts at 0
              endTime: duration,
            };

            // Save segment
            setRecordedSegments(prev => {
              const newSegments = [...prev, segment].sort((a, b) => a.photoNumber - b.photoNumber);
              console.log(`[Host] Total segments recorded: ${newSegments.length}/8`);
              return newSegments;
            });

            setCurrentlyRecording(null);
          }
        );

        console.log(`[Host] Recording started for photo ${photoNumber} (${recordingDuration}s)`);
      } catch (error) {
        console.error('[Host] Failed to start recording:', error);
        setCurrentlyRecording(null);
      }
    }

    // Countdown before taking photo (matches recording duration)
    let count = recordingDuration;
    setCountdown(count);
    console.log('[Host] Starting countdown from', count, 'seconds');

    // Send countdown ticks
    sendMessage({
      type: "countdown-tick",
      roomId: store.roomId,
      count,
      photoNumber,
    });

    const interval = setInterval(() => {
      count--;
      console.log('[Host] Countdown:', count);

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
    console.log(`[Host] 📸 Capturing photo ${photoNumber}`);

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

        // Take next photo or finish session
        if (photoNumber < 8) {
          console.log('[Host] Photo', photoNumber, 'captured successfully');
          console.log('[Host] ⏱️  Waiting', captureInterval, 'seconds before next photo');
          setTimeout(() => {
            console.log('[Host] Starting photo', photoNumber + 1);
            takePhoto(photoNumber + 1);
          }, captureInterval * 1000);
        } else {
          // Last photo
          console.log('[Host] ✅ Last photo captured!');
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

  const handleGenerateFrame = async () => {
    if (peerSelectedPhotos.length !== 4) {
      alert('Guest가 4장의 사진을 선택해야 합니다.');
      return;
    }

    setIsGeneratingFrame(true);
    try {
      await downloadPhotoFrame(photos, peerSelectedPhotos, store.roomId || 'frame', aspectRatio);
      console.log('[Host] Photo frame generated and downloaded');
    } catch (error) {
      console.error('[Host] Failed to generate frame:', error);
      alert('프레임 생성에 실패했습니다.');
    } finally {
      setIsGeneratingFrame(false);
    }
  };

  // Note: handleSplitVideo removed - no longer needed with individual recording!

  const autoComposeAndUploadVideo = async (selectedPhotoIndices: number[]) => {
    if (!store.roomId || !store.userId) {
      console.error('[Host] Missing roomId or userId');
      return;
    }

    // Check if we have recorded segments
    if (recordedSegments.length === 0) {
      console.error('[Host] No recorded segments available');
      alert('녹화된 영상이 없습니다.');
      return;
    }

    // Get selected segments (indices are 0-based, photoNumber is 1-based)
    const selectedSegments = selectedPhotoIndices
      .map(index => recordedSegments.find(seg => seg.photoNumber === index + 1))
      .filter((seg): seg is VideoSegment => seg !== undefined);

    if (selectedSegments.length !== 4) {
      console.error(`[Host] Failed to find all segments (${selectedSegments.length}/4)`);
      alert(`선택한 사진 중 ${4 - selectedSegments.length}개의 영상을 찾을 수 없습니다.`);
      return;
    }

    console.log('[Host] 🚀 Auto-composing with WebGL GPU (재인코딩 없음!)');
    console.log('[Host] Auto-composing video frame with segments:', selectedSegments.map(s => s.photoNumber));

    setIsComposing(true);
    setComposeProgress('WebGL GPU 합성 시작...');

    try {
      // Convert VideoSegment to VideoSource
      const videoSources: VideoSource[] = selectedSegments.map(seg => ({
        blob: seg.blob,
        startTime: seg.startTime,
        endTime: seg.endTime,
        photoNumber: seg.photoNumber,
      }));

      // Use WebGL composition (GPU-accelerated, no re-encoding!)
      const composedBlob = await composeVideoWithWebGL(
        videoSources,
        {
          width: ASPECT_RATIOS[aspectRatio].width,
          height: ASPECT_RATIOS[aspectRatio].height,
          frameRate: 24,
        },
        (progress) => {
          setComposeProgress(progress);
          console.log('[Host] WebGL compose progress:', progress);
        }
      );

      console.log('[Host] Composition complete, uploading to server...');
      setComposeProgress('서버에 업로드 중...');

      // Upload to server
      const formData = new FormData();
      formData.append('video', composedBlob, 'video-frame.mp4');
      formData.append('roomId', store.roomId);
      formData.append('userId', store.userId);

      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${API_URL}/api/video/upload`, {
        method: 'POST',
        headers: getApiHeadersMultipart(),
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result = await response.json();
      console.log('[Host] Upload complete:', result);

      // Save composed video locally
      const url = URL.createObjectURL(composedBlob);
      if (composedVideo) {
        URL.revokeObjectURL(composedVideo.url);
      }
      setComposedVideo({ blob: composedBlob, url });

      setComposeProgress('완료!');
      alert('영상 프레임이 생성되어 Guest에게 전송되었습니다! 🎉');

    } catch (error) {
      console.error('[Host] Failed to compose/upload video:', error);
      alert('영상 합성 또는 업로드에 실패했습니다: ' + (error instanceof Error ? error.message : ''));
    } finally {
      setIsComposing(false);
      setTimeout(() => setComposeProgress(''), 2000);
    }
  };

  const handleComposeVideoFrame = async () => {
    if (peerSelectedPhotos.length !== 4) {
      alert('Guest가 4장의 사진을 선택해야 합니다.');
      return;
    }

    // Check if we have recorded segments
    if (recordedSegments.length === 0) {
      alert('녹화된 영상이 없습니다. 촬영을 먼저 완료해주세요.');
      return;
    }

    // Get selected segments (Guest's selection is 0-indexed, photoNumber is 1-based)
    const selectedSegments = peerSelectedPhotos
      .map(index => recordedSegments.find(seg => seg.photoNumber === index + 1))
      .filter((seg): seg is VideoSegment => seg !== undefined);

    if (selectedSegments.length !== 4) {
      alert(`선택한 사진 중 ${4 - selectedSegments.length}개의 영상을 찾을 수 없습니다.`);
      return;
    }

    console.log('[Host] 🚀 WebGL GPU 합성 시작 (재인코딩 없음!)');
    console.log('[Host] Composing video frame with segments:', selectedSegments.map(s => s.photoNumber));

    setIsComposing(true);
    setComposeProgress('WebGL GPU 합성 시작...');

    try {
      // Convert VideoSegment to VideoSource
      const videoSources: VideoSource[] = selectedSegments.map(seg => ({
        blob: seg.blob,
        startTime: seg.startTime,
        endTime: seg.endTime,
        photoNumber: seg.photoNumber,
      }));

      // Use WebGL composition (GPU-accelerated, no re-encoding!)
      const composedBlob = await composeVideoWithWebGL(
        videoSources,
        {
          width: ASPECT_RATIOS[aspectRatio].width,
          height: ASPECT_RATIOS[aspectRatio].height,
          frameRate: 24,
        },
        (progress) => {
          setComposeProgress(progress);
          console.log('[Host] WebGL compose progress:', progress);
        }
      );

      const url = URL.createObjectURL(composedBlob);

      // Cleanup previous composed video
      if (composedVideo) {
        URL.revokeObjectURL(composedVideo.url);
      }

      setComposedVideo({ blob: composedBlob, url });
      console.log('[Host] ✅ WebGL composition complete (no re-encoding!):', {
        size: `${(composedBlob.size / 1024 / 1024).toFixed(2)} MB`,
      });

      alert('✨ 영상 프레임이 생성되었습니다! (WebGL GPU 합성 - 재인코딩 없음!)');
    } catch (error) {
      console.error('[Host] Failed to compose video with WebGL:', error);
      alert('영상 합성에 실패했습니다. ' + (error instanceof Error ? error.message : ''));
    } finally {
      setIsComposing(false);
      setComposeProgress('');
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

  // Cleanup - only on component unmount
  useEffect(() => {
    return () => {
      console.log('[Host] Component unmounting - cleaning up resources');
      stopCamera();
      if (videoRecorderRef.current) {
        videoRecorderRef.current.dispose();
      }
    };
  }, []); // Empty dependency - cleanup only on unmount

  // Cleanup URLs when segments/video change
  useEffect(() => {
    return () => {
      // Cleanup segment URLs when they change
      if (recordedSegments.length > 0) {
        recordedSegments.forEach(segment => {
          URL.revokeObjectURL(segment.url);
        });
      }
    };
  }, [recordedSegments]);

  useEffect(() => {
    return () => {
      // Cleanup composed video URL when it changes
      if (composedVideo) {
        URL.revokeObjectURL(composedVideo.url);
      }
    };
  }, [composedVideo]);

  console.log("HOST: isProcessing", isProcessing);

  return (
    <div className="min-h-screen bg-light text-dark p-8">
      <FlashOverlay show={showFlash} />

      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-4 text-dark">
            Host (VTuber with Chroma Key)
          </h1>
          <div className="space-y-3">
            {store.roomId && (
              <div className="bg-primary px-6 py-3 rounded-lg inline-block shadow-md">
                <span className="text-sm opacity-90 text-white">Room ID:</span>
                <span className="text-2xl font-bold ml-2 text-white">{store.roomId}</span>
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
        <div className="bg-white border-2 border-neutral rounded-lg p-6 mb-6 shadow-md">
          <div className="flex flex-wrap gap-4 items-center mb-4">
            {!isCameraActive ? (
              <button
                onClick={startCamera}
                disabled={!isConnected}
                className="px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold transition shadow-md disabled:opacity-50"
              >
                {isConnected ? "카메라 시작" : "연결 중..."}
              </button>
            ) : (
              <button
                onClick={stopCamera}
                className="px-6 py-3 bg-secondary hover:bg-secondary-dark text-white rounded-lg font-semibold transition shadow-md"
              >
                카메라 중지
              </button>
            )}

            {isCameraActive && (
              <button
                onClick={() => setChromaKeyEnabled(!chromaKeyEnabled)}
                className={`px-6 py-3 rounded-lg font-semibold transition shadow-md ${
                  chromaKeyEnabled
                    ? "bg-primary hover:bg-primary-dark text-white"
                    : "bg-neutral hover:bg-neutral-dark text-dark"
                }`}
              >
                크로마키: {chromaKeyEnabled ? "ON" : "OFF"}
              </button>
            )}

            {isCameraActive && (
              <button
                onClick={toggleHostFlip}
                className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
                  hostFlipHorizontal
                    ? 'bg-primary hover:bg-primary-dark text-white shadow-md'
                    : 'bg-neutral hover:bg-neutral-dark text-dark'
                }`}
                title="내 화면 좌우 반전"
              >
                {hostFlipHorizontal ? '↔️ Host 반전 ON' : '↔️ Host 반전 OFF'}
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

        {/* Timer settings */}
        {remoteStream && (
          <div className="bg-white border-2 border-neutral rounded-lg p-6 mb-6 shadow-md">
            <h2 className="text-xl font-semibold mb-4 text-dark">촬영 설정</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  녹화 시간 (Recording Duration): {recordingDuration}초
                </label>
                <input
                  type="range"
                  min="5"
                  max="30"
                  value={recordingDuration}
                  onChange={(e) => setRecordingDuration(Number(e.target.value))}
                  disabled={isCapturing}
                  className="w-full disabled:opacity-50"
                />
                <p className="text-xs text-gray-400 mt-1">
                  각 사진 촬영 시 녹화할 영상의 길이 및 촬영 카운트다운 시간 (5~30초)
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  촬영 간격 (Capture Interval): {captureInterval}초
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={captureInterval}
                  onChange={(e) => setCaptureInterval(Number(e.target.value))}
                  disabled={isCapturing}
                  className="w-full disabled:opacity-50"
                />
                <p className="text-xs text-gray-400 mt-1">
                  사진 촬영 사이의 대기 시간 (1~10초)
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Aspect Ratio settings */}
        {remoteStream && (
          <div className="bg-white border-2 border-neutral rounded-lg p-6 mb-6 shadow-md">
            <h2 className="text-xl font-semibold mb-4 text-dark">화면 비율 설정</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-3">
                  촬영 비율 (Aspect Ratio): {ASPECT_RATIOS[aspectRatio].label}
                </label>
                <div className="grid grid-cols-5 gap-3">
                  {(Object.keys(ASPECT_RATIOS) as AspectRatio[]).map((ratio) => (
                    <button
                      key={ratio}
                      onClick={() => updateAspectRatio(ratio)}
                      disabled={isCapturing}
                      className={`px-4 py-3 rounded-lg font-semibold text-sm transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${
                        aspectRatio === ratio
                          ? 'bg-primary hover:bg-primary-dark text-white'
                          : 'bg-neutral hover:bg-neutral-dark text-dark'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-3">
                  미리보기, 사진 촬영, 영상 녹화, 합성 등 모든 과정에 적용됩니다
                </p>
                <div className="mt-2 px-4 py-2 bg-neutral/30 rounded-lg">
                  <p className="text-xs text-dark/70 font-medium">
                    해상도: {ASPECT_RATIOS[aspectRatio].width} × {ASPECT_RATIOS[aspectRatio].height}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

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
            {/* 1:1 Container to prevent layout shift */}
            <div className="relative rounded-lg overflow-hidden aspect-square">
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

              {/* Canvas container with dynamic aspect ratio */}
              <div className="absolute inset-0 flex items-center justify-center">
                {/* Show own chroma key canvas when alone */}
                <canvas
                  ref={localCanvasRef}
                  className={`absolute max-w-full max-h-full transition-opacity ${
                    remoteStream ? "opacity-0" : "opacity-100"
                  }`}
                  style={{
                    transform: hostFlipHorizontal ? 'scaleX(-1)' : 'scaleX(1)',
                    aspectRatio: aspectRatio.replace(':', '/'),
                  }}
                />

                {/* Show composite when connected */}
                <canvas
                  ref={compositeCanvasRef}
                  className={`absolute max-w-full max-h-full transition-opacity ${
                    !remoteStream ? "opacity-0" : "opacity-100"
                  }`}
                  style={{
                    aspectRatio: aspectRatio.replace(':', '/'),
                  }}
                />
              </div>

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
            <div className="bg-white border-2 border-neutral rounded-lg p-6 mt-6 shadow-md">
              <h2 className="text-xl font-semibold mb-4 text-dark">사진 촬영</h2>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-lg text-dark font-semibold">촬영: {photoCount} / 8</div>
                  {currentlyRecording !== null && (
                    <div className="flex items-center gap-2 text-sm text-primary font-medium">
                      <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                      영상 #{currentlyRecording} 녹화 중
                    </div>
                  )}
                </div>
                <button
                  onClick={startPhotoSession}
                  disabled={!remoteStream || isCapturing}
                  className="w-full px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCapturing ? "촬영 중..." : "촬영 시작 (사진 + 영상)"}
                </button>
              </div>

              <PhotoThumbnailGrid photos={photos} totalSlots={8} />
            </div>
          )}

          <ProcessingIndicator show={isProcessing} />

          <PhotoSelectionPanel
            photos={photos}
            selectedPhotos={[]}
            onGenerateFrame={handleGenerateFrame}
            readOnly={true}
            role="host"
            peerSelectedPhotos={peerSelectedPhotos}
            isGenerating={isGeneratingFrame}
          />

          {/* Video Frame Composition */}
          {recordedSegments.length >= 4 && peerSelectedPhotos.length === 4 && (
            <div className="bg-white border-2 border-neutral rounded-lg p-6 mt-6 shadow-md">
              <h2 className="text-2xl font-semibold mb-4 text-dark">🚀 영상 프레임 생성 (WebGL GPU 합성)</h2>
              <p className="text-dark/70 mb-4">
                Guest가 선택한 4개의 사진에 해당하는 영상을 2x2 그리드로 합성합니다.
                <br />
                <span className="text-primary font-semibold">⚡ GPU 가속 - 재인코딩 없이 실시간 합성!</span>
              </p>

              {isComposing && (
                <div className="bg-neutral/30 border border-neutral rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    <div className="text-sm text-dark font-medium">
                      {composeProgress || '처리 중...'}
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={handleComposeVideoFrame}
                disabled={isComposing}
                className="w-full px-6 py-4 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold text-lg transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isComposing ? '⚡ GPU 합성 중...' : '⚡ 영상 프레임 생성 (WebGL GPU)'}
              </button>

              {composedVideo && (
                <div className="mt-4">
                  <div className="bg-dark rounded-lg overflow-hidden mb-4 border-2 border-neutral">
                    <video
                      src={composedVideo.url}
                      controls
                      className="w-full aspect-video bg-black"
                    />
                  </div>
                  <div className="bg-neutral/30 border border-neutral rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-primary">⚡ WebGL 합성 완료</span>
                      <span className="text-xs text-dark/70 font-medium">
                        WebM · {(composedVideo.blob.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                        downloadWebGLComposedVideo(composedVideo.blob, `vshot-frame-${store.roomId}-${timestamp}.webm`);
                      }}
                      className="w-full px-4 py-3 bg-secondary hover:bg-secondary-dark text-white rounded-lg font-semibold transition shadow-md"
                    >
                      📥 영상 프레임 다운로드 (WebM - WebGL 합성)
                    </button>
                    <p className="text-xs text-dark/70 mt-3 text-center">
                      ⚡ WebGL GPU로 실시간 합성 - FFmpeg 재인코딩 없음!
                      <br />
                      💡 Guest가 선택한 4개 영상을 2x2 그리드로 합성한 WebM 파일입니다.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recorded video segments panel */}
          {recordedSegments.length > 0 && !isCapturing && (
            <div className="bg-white border-2 border-neutral rounded-lg p-6 mt-6 shadow-md">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold text-dark">⚡ 녹화된 영상 세그먼트 (개별 녹화)</h2>
                <div className="px-3 py-1 bg-primary text-white rounded-full text-sm font-semibold shadow-md">
                  ✓ {recordedSegments.length}개 구간
                </div>
              </div>
              <p className="text-dark/70 mb-4">
                각 사진 촬영 시 개별로 녹화된 영상 (FFmpeg 분할 불필요!)
              </p>

              {/* Video grid */}
              <div className="grid grid-cols-4 gap-4 mb-4">
                {recordedSegments.map((segment) => (
                  <div key={segment.photoNumber} className="bg-neutral/30 border border-neutral rounded-lg overflow-hidden">
                    <video
                      src={segment.url}
                      controls
                      className="w-full aspect-video bg-black"
                    />
                    <div className="p-3">
                      <div className="text-sm font-semibold mb-1 text-dark">
                        영상 #{segment.photoNumber}
                      </div>
                      <div className="text-xs text-dark/70 mb-2 font-medium">
                        {segment.startTime.toFixed(1)}s - {segment.endTime.toFixed(1)}s
                        <br />
                        {(segment.blob.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                      <button
                        onClick={() => {
                          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                          downloadVideo(segment.blob, `vshot-video-${store.roomId}-${segment.photoNumber}-${timestamp}.webm`);
                        }}
                        className="w-full px-3 py-2 bg-secondary hover:bg-secondary-dark text-white rounded text-sm font-semibold transition shadow-md"
                      >
                        다운로드
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Download all button */}
              <button
                onClick={() => {
                  if (store.roomId) {
                    downloadSegments(recordedSegments, store.roomId);
                  }
                }}
                className="w-full px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold transition shadow-md"
              >
                ⚡ 모든 구간 다운로드 ({recordedSegments.length}개)
              </button>
              <div className="mt-4 bg-primary/10 border-2 border-primary rounded-lg p-4">
                <p className="text-xs text-dark font-medium">
                  ✅ 개별 녹화 방식으로 FFmpeg 분할 단계가 완전히 제거되었습니다!
                  <br />
                  ⚡ 영상 합성 시간이 90% 단축됩니다.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Usage info */}
        {!store.peerId && isCameraActive && (
          <div className="mt-8 bg-white border-2 border-neutral rounded-lg p-6 shadow-md">
            <h2 className="text-xl font-semibold mb-4 text-dark">안내</h2>
            <ul className="list-disc list-inside space-y-2 text-dark/80">
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
