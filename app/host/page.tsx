"use client";

import {
  ConnectionStatus,
  FlashOverlay,
  PhotoCounter,
  PhotoSelectionPanel,
  ProcessingIndicator,
  SegmentedBar,
  SettingsPanel,
  VideoDisplayPanel,
} from "@/components";
import { useChromaKey } from "@/hooks/useChromaKey";
import { useCompositeCanvas } from "@/hooks/useCompositeCanvas";
import { usePhotoCapture } from "@/hooks/usePhotoCapture";
import { useSignaling } from "@/hooks/useSignaling";
import { useWebRTC } from "@/hooks/useWebRTC";
import { getApiHeadersMultipart } from "@/lib/api";
import { downloadPhotoFrame } from "@/lib/frame-generator";
import { useAppStore } from "@/lib/store";
import { VideoRecorder } from "@/lib/video-recorder";
import { type VideoSegment } from "@/lib/video-splitter";
import {
  composeVideoWithWebGL,
  downloadWebGLComposedVideo,
  checkCodecSupport,
  type VideoSource,
} from "@/lib/webgl-video-composer";
import { FRAME_LAYOUTS, getLayoutById } from "@/constants/frame-layouts";
import { RESOLUTION } from "@/constants/constants";
import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";

export default function HostPage() {
  const store = useAppStore();
  const { connect, sendMessage, on, off, isConnected } = useSignaling();
  const { localStream, remoteStream, startLocalStream, createOffer } =
    useWebRTC({ sendMessage, on });

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [sourceType, setSourceType] = useState<"camera" | "screen">("camera"); // Track source type
  const [chromaKeyEnabled, setChromaKeyEnabled] = useState(true); // Default ON for VR
  const [sensitivity, setSensitivity] = useState(50);
  const [smoothness, setSmoothness] = useState(10);

  // Display options (flip horizontal)
  const [hostFlipHorizontal, setHostFlipHorizontal] = useState(false);
  const [guestFlipHorizontal, setGuestFlipHorizontal] = useState(false);

  // Photo capture state
  const [isCapturing, setIsCapturing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  const [peerSelectedPhotos, setPeerSelectedPhotos] = useState<number[]>([]);
  const [isGeneratingFrame, setIsGeneratingFrame] = useState(false);

  // Calculate photo counts based on selected frame layout
  const selectedLayout = getLayoutById(store.selectedFrameLayoutId);
  const slotCount = selectedLayout?.slotCount || 4;
  const totalPhotos = slotCount * 2; // Total photos to capture
  const selectablePhotos = slotCount; // Photos user can select

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
  const compositeCanvasRef = useRef<HTMLCanvasElement>(null);
  const initializedRef = useRef(false);
  const videoRecorderRef = useRef<VideoRecorder | null>(null);

  // Video recording state - Individual segments per photo
  const [recordedSegments, setRecordedSegments] = useState<VideoSegment[]>([]);
  const [currentlyRecording, setCurrentlyRecording] = useState<number | null>(
    null
  ); // photoNumber being recorded

  // Video composition state
  const [composedVideo, setComposedVideo] = useState<{
    blob: Blob;
    url: string;
  } | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [composeProgress, setComposeProgress] = useState("");

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
    width: RESOLUTION.VIDEO_WIDTH,
    height: RESOLUTION.VIDEO_HEIGHT,
  });

  // Use shared composite canvas hook
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
    blurGuest: true, // Blur guest video on host screen
  });

  // Initialize video recorder once
  useEffect(() => {
    if (!videoRecorderRef.current) {
      videoRecorderRef.current = new VideoRecorder(
        () => compositeCanvasRef.current
      );
    }
  }, []);

  // Initialize AFTER Zustand persist hydration is complete
  useEffect(() => {
    if (!store._hasHydrated) return;
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      let userId = store.userId;
      const existingRoomId = store.roomId;
      const existingRole = store.role;

      if (!userId) {
        userId = uuidv4();
        store.setUserId(userId);
      }

      try {
        await connect();

        if (existingRoomId && existingRole === "host") {
          // Try to rejoin the existing room
          sendMessage({
            type: "join",
            roomId: existingRoomId,
            userId,
            role: "host",
          });
        } else {
          // Create new room
          store.setRole("host");
          sendMessage({
            type: "join",
            roomId: "",
            userId,
            role: "host",
          });
        }
      } catch (error) {
        console.error("[Host] Connection failed:", error);
        alert("서버에 연결할 수 없습니다.");
      }
    };

    init();
  }, [store._hasHydrated]);

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
      setSourceType("camera");
      setChromaKeyEnabled(true); // Enable chroma key for camera
      console.log("[Host] Camera started");
    } catch (error) {
      console.error("[Host] Camera error:", error);
      alert("카메라에 접근할 수 없습니다.");
    }
  };

  // Start screen share
  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "never", // Hide mouse cursor in screen share
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: true,
      });

      // Handle when user stops sharing via browser UI
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        console.log("[Host] Screen share stopped by user");
        stopSource();
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      await startLocalStream(() => Promise.resolve(stream));
      setIsCameraActive(true);
      setSourceType("screen");
      // Keep chroma key state - user can choose to enable/disable for screen share
      console.log("[Host] Screen share started");
    } catch (error) {
      console.error("[Host] Screen share error:", error);
      alert("화면 공유에 접근할 수 없습니다.");
    }
  };

  // Stop camera or screen share
  const stopSource = () => {
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
        type: "host-display-options",
        roomId: store.roomId,
        options: {
          flipHorizontal: newFlipState,
        },
      });
      console.log("[Host] Sent display options:", {
        flipHorizontal: newFlipState,
      });
    }
  };

  // Broadcast frame layout settings when changed
  useEffect(() => {
    if (store.roomId && remoteStream) {
      const settings = {
        layoutId: store.selectedFrameLayoutId,
        slotCount,
        totalPhotos,
        selectablePhotos,
      };

      sendMessage({
        type: "frame-layout-settings",
        roomId: store.roomId,
        settings,
      });

      console.log("[Host] Sent frame layout settings:", settings);
    }
  }, [store.selectedFrameLayoutId, store.roomId, remoteStream, slotCount, totalPhotos, selectablePhotos, sendMessage]);

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
      console.log(
        "[Host] Received session settings broadcast from server:",
        message
      );
      if (message.settings) {
        console.log(
          "[Host] Broadcast settings - recordingDuration:",
          message.settings.recordingDuration,
          "captureInterval:",
          message.settings.captureInterval
        );
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
      console.log("[Host] Received video frame request:", message);

      if (message.selectedPhotos && message.selectedPhotos.length === selectablePhotos) {
        console.log(
          "[Host] Auto-composing video frame for photos:",
          message.selectedPhotos
        );

        // Update peer selected photos
        setPeerSelectedPhotos(message.selectedPhotos);

        // Auto-compose and upload video
        await autoComposeAndUploadVideo(message.selectedPhotos);
      }
    };

    on("video-frame-request", handleVideoFrameRequest);

    return () => {
      // Cleanup if needed
    };
  }, [on, recordedSegments, recordingDuration, captureInterval, selectablePhotos]);

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

    console.log(
      "[Host] ========== PHOTO SESSION START (Individual Recording) =========="
    );
    console.log("[Host] Session settings:");
    console.log(
      "[Host]  - recordingDuration:",
      recordingDuration,
      "seconds (영상 녹화 시간 = 촬영 카운트다운 시간)"
    );
    console.log(
      "[Host]  - captureInterval:",
      captureInterval,
      "seconds (사진 촬영 후 다음 사진까지 대기 시간)"
    );
    console.log(
      "[Host] Mode: Individual segment recording (no FFmpeg splitting needed!)"
    );
    console.log("[Host] ================================================");

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
    console.log("[Host] Sending session settings to server:", sessionSettings);
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
    if (!store.roomId || photoNumber > totalPhotos) {
      setIsCapturing(false);
      return;
    }

    console.log("[Host] ========== Taking photo", photoNumber, "==========");
    console.log("[Host] Starting individual video recording for this segment");

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

            console.log(
              `[Host] ✅ Video segment ${completedPhotoNumber} recorded:`,
              {
                size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
                duration: `${duration.toFixed(2)}s`,
              }
            );

            // Create VideoSegment
            const segment: VideoSegment = {
              photoNumber: completedPhotoNumber,
              blob,
              url: URL.createObjectURL(blob),
              startTime: 0, // Each segment starts at 0
              endTime: duration,
            };

            // Save segment
            setRecordedSegments((prev) => {
              const newSegments = [...prev, segment].sort(
                (a, b) => a.photoNumber - b.photoNumber
              );
              console.log(
                `[Host] Total segments recorded: ${newSegments.length}/8`
              );
              return newSegments;
            });

            setCurrentlyRecording(null);
          }
        );

        console.log(
          `[Host] Recording started for photo ${photoNumber} (${recordingDuration}s)`
        );
      } catch (error) {
        console.error("[Host] Failed to start recording:", error);
        setCurrentlyRecording(null);
      }
    }

    // Countdown before taking photo (matches recording duration)
    let count = recordingDuration;
    setCountdown(count);
    console.log("[Host] Starting countdown from", count, "seconds");

    // Send countdown ticks
    sendMessage({
      type: "countdown-tick",
      roomId: store.roomId,
      count,
      photoNumber,
    });

    const interval = setInterval(() => {
      count--;
      console.log("[Host] Countdown:", count);

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
        if (photoNumber < totalPhotos) {
          console.log("[Host] Photo", photoNumber, "captured successfully");
          console.log(
            "[Host] ⏱️  Waiting",
            captureInterval,
            "seconds before next photo"
          );
          setTimeout(() => {
            console.log("[Host] Starting photo", photoNumber + 1);
            takePhoto(photoNumber + 1);
          }, captureInterval * 1000);
        } else {
          // Last photo
          console.log("[Host] ✅ Last photo captured!");
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
    if (peerSelectedPhotos.length !== selectablePhotos) {
      alert(`Guest가 ${selectablePhotos}장의 사진을 선택해야 합니다.`);
      return;
    }

    setIsGeneratingFrame(true);
    try {
      const layout = getLayoutById(store.selectedFrameLayoutId);

      if (!layout) {
        throw new Error(`Layout not found: ${store.selectedFrameLayoutId}`);
      }

      // Use only the number of photos that match the layout's slot count
      const photosToUse = peerSelectedPhotos.slice(0, layout.slotCount);
      const selectedPhotoUrls = photosToUse.map((index) => photos[index]);

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `vshot-frame-${store.roomId || 'frame'}-${timestamp}.png`;

      await generatePhotoFrameWithLayout(selectedPhotoUrls, layout, filename);
      console.log("[Host] Photo frame generated and downloaded");
    } catch (error) {
      console.error("[Host] Failed to generate frame:", error);
      alert("프레임 생성에 실패했습니다.");
    } finally {
      setIsGeneratingFrame(false);
    }
  };

  // Note: handleSplitVideo removed - no longer needed with individual recording!

  const autoComposeAndUploadVideo = async (selectedPhotoIndices: number[]) => {
    if (!store.roomId || !store.userId) {
      console.error("[Host] Missing roomId or userId");
      return;
    }

    // Check if we have recorded segments
    if (recordedSegments.length === 0) {
      console.error("[Host] No recorded segments available");
      alert("녹화된 영상이 없습니다.");
      return;
    }

    // Get selected segments (indices are 0-based, photoNumber is 1-based)
    const selectedSegments = selectedPhotoIndices
      .map((index) =>
        recordedSegments.find((seg) => seg.photoNumber === index + 1)
      )
      .filter((seg): seg is VideoSegment => seg !== undefined);

    if (selectedSegments.length !== selectablePhotos) {
      console.error(
        `[Host] Failed to find all segments (${selectedSegments.length}/${selectablePhotos})`
      );
      alert(
        `선택한 사진 중 ${
          selectablePhotos - selectedSegments.length
        }개의 영상을 찾을 수 없습니다.`
      );
      return;
    }

    console.log("[Host] 🚀 Auto-composing with Canvas 2D + selected layout");
    console.log(
      "[Host] Auto-composing video frame with segments:",
      selectedSegments.map((s) => s.photoNumber)
    );
    console.log("[Host] Selected layout:", store.selectedFrameLayoutId);

    setIsComposing(true);
    setComposeProgress("영상 합성 시작...");

    try {
      // Convert VideoSegment to VideoSource
      const videoSources: VideoSource[] = selectedSegments.map((seg) => ({
        blob: seg.blob,
        startTime: seg.startTime,
        endTime: seg.endTime,
        photoNumber: seg.photoNumber,
      }));

      // Get selected frame layout
      const selectedLayout = getLayoutById(store.selectedFrameLayoutId);

      if (!selectedLayout) {
        console.error("[Host] Selected layout not found:", store.selectedFrameLayoutId);
        alert("선택한 프레임 레이아웃을 찾을 수 없습니다.");
        setIsComposing(false);
        return;
      }

      console.log("[Host] Using layout for auto composition:", {
        id: selectedLayout.id,
        label: selectedLayout.label,
        slotCount: selectedLayout.slotCount,
        videoSourcesCount: videoSources.length
      });

      // Use Canvas 2D composition with selected layout
      // NOTE: Use canvas size from layout configuration
      const composedBlob = await composeVideoWithWebGL(
        videoSources,
        {
          width: selectedLayout.canvasWidth,
          height: selectedLayout.canvasHeight,
          frameRate: 24,
          layout: selectedLayout,
        },
        (progress) => {
          setComposeProgress(progress);
          console.log("[Host] Video compose progress:", progress);
        }
      );

      console.log("[Host] Composition complete, uploading to server...");
      setComposeProgress("서버에 업로드 중...");

      // Determine file extension based on blob MIME type
      const extension = composedBlob.type.includes('mp4') ? 'mp4' : 'webm';
      const filename = `video-frame.${extension}`;

      // Upload to server
      const formData = new FormData();
      formData.append("video", composedBlob, filename);
      formData.append("roomId", store.roomId);
      formData.append("userId", store.userId);

      console.log(`[Host] Uploading ${extension.toUpperCase()} video (${(composedBlob.size / 1024 / 1024).toFixed(2)} MB)`);

      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const response = await fetch(`${API_URL}/api/video/upload`, {
        method: "POST",
        headers: getApiHeadersMultipart(),
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const result = await response.json();
      console.log("[Host] Upload complete:", result);

      // Save composed video locally
      const url = URL.createObjectURL(composedBlob);
      if (composedVideo) {
        URL.revokeObjectURL(composedVideo.url);
      }
      setComposedVideo({ blob: composedBlob, url });

      console.log("[Host] ✅ Video composition & upload complete:", {
        codec: composedBlob.type,
        size: `${(composedBlob.size / 1024 / 1024).toFixed(2)} MB`,
        format: composedBlob.type.includes('mp4') ? 'MP4 (H.264 Hardware)' : 'WebM (Software)',
        serverUrl: result.videoUrl,
      });

      setComposeProgress("완료!");
      alert("영상 프레임이 생성되어 Guest에게 전송되었습니다! 🎉");
    } catch (error) {
      console.error("[Host] Failed to compose/upload video:", error);
      alert(
        "영상 합성 또는 업로드에 실패했습니다: " +
          (error instanceof Error ? error.message : "")
      );
    } finally {
      setIsComposing(false);
      setTimeout(() => setComposeProgress(""), 2000);
    }
  };

  const handleComposeVideoFrame = async () => {
    if (peerSelectedPhotos.length !== selectablePhotos) {
      alert(`Guest가 ${selectablePhotos}장의 사진을 선택해야 합니다.`);
      return;
    }

    // Check if we have recorded segments
    if (recordedSegments.length === 0) {
      alert("녹화된 영상이 없습니다. 촬영을 먼저 완료해주세요.");
      return;
    }

    // Get selected segments (Guest's selection is 0-indexed, photoNumber is 1-based)
    const selectedSegments = peerSelectedPhotos
      .map((index) =>
        recordedSegments.find((seg) => seg.photoNumber === index + 1)
      )
      .filter((seg): seg is VideoSegment => seg !== undefined);

    if (selectedSegments.length !== selectablePhotos) {
      alert(
        `선택한 사진 중 ${
          selectablePhotos - selectedSegments.length
        }개의 영상을 찾을 수 없습니다.`
      );
      return;
    }

    console.log("[Host] 🚀 Canvas 2D 합성 시작 + selected layout");
    console.log(
      "[Host] Composing video frame with segments:",
      selectedSegments.map((s) => s.photoNumber)
    );
    console.log("[Host] Selected layout:", store.selectedFrameLayoutId);

    setIsComposing(true);
    setComposeProgress("영상 합성 시작...");

    try {
      // Convert VideoSegment to VideoSource
      const videoSources: VideoSource[] = selectedSegments.map((seg) => ({
        blob: seg.blob,
        startTime: seg.startTime,
        endTime: seg.endTime,
        photoNumber: seg.photoNumber,
      }));

      // Get selected frame layout
      const selectedLayout = getLayoutById(store.selectedFrameLayoutId);

      if (!selectedLayout) {
        console.error("[Host] Selected layout not found:", store.selectedFrameLayoutId);
        alert("선택한 프레임 레이아웃을 찾을 수 없습니다.");
        setIsComposing(false);
        return;
      }

      console.log("[Host] Using layout for manual composition:", {
        id: selectedLayout.id,
        label: selectedLayout.label,
        slotCount: selectedLayout.slotCount,
        videoSourcesCount: videoSources.length
      });

      // Use Canvas 2D composition with selected layout
      // NOTE: Use canvas size from layout configuration
      const composedBlob = await composeVideoWithWebGL(
        videoSources,
        {
          width: selectedLayout.canvasWidth,
          height: selectedLayout.canvasHeight,
          frameRate: 24,
          layout: selectedLayout,
        },
        (progress) => {
          setComposeProgress(progress);
          console.log("[Host] Video compose progress:", progress);
        }
      );

      const url = URL.createObjectURL(composedBlob);

      // Cleanup previous composed video
      if (composedVideo) {
        URL.revokeObjectURL(composedVideo.url);
      }

      setComposedVideo({ blob: composedBlob, url });
      console.log("[Host] ✅ Video composition complete:", {
        codec: composedBlob.type,
        size: `${(composedBlob.size / 1024 / 1024).toFixed(2)} MB`,
        format: composedBlob.type.includes('mp4') ? 'MP4 (H.264 Hardware)' : 'WebM (Software)',
        layout: store.selectedFrameLayoutId,
      });

      alert("✨ 영상 프레임이 생성되었습니다!");
    } catch (error) {
      console.error("[Host] Failed to compose video with WebGL:", error);
      alert(
        "영상 합성에 실패했습니다. " +
          (error instanceof Error ? error.message : "")
      );
    } finally {
      setIsComposing(false);
      setComposeProgress("");
    }
  };

  // Manual screen share start (removed auto-start)

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
      console.log("[Host] Component unmounting - cleaning up resources");
      stopSource();
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
        recordedSegments.forEach((segment) => {
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

  // Check codec support on mount
  useEffect(() => {
    console.log('[Host] Checking MediaRecorder codec support...');
    checkCodecSupport();
  }, []);

  console.log("HOST: isProcessing", isProcessing);

  return (
    <div className="min-h-screen bg-light text-dark p-8">
      <FlashOverlay show={showFlash} />

      <div className="max-w-6xl mx-auto">
        <div className="mb-2 sm:mb-4 landscape:mb-2">
          <div className="flex flex-col landscape:flex-row gap-2 landscape:gap-3 items-start landscape:items-center landscape:justify-between">
            <h1 className="text-lg sm:text-2xl landscape:text-lg font-bold text-dark">
              Host
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
                role="host"
              />
            </div>
          </div>
        </div>

        {/* Main Layout: Video (left) + Settings (right) on PC, stacked on mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 mb-6">
          {/* Left Column: Video Display */}
          <div className="flex justify-center lg:justify-start">
            <VideoDisplayPanel
              role="host"
              isActive={isCameraActive}
              remoteStream={remoteStream}
              localVideoRef={localVideoRef}
              localCanvasRef={localCanvasRef}
              remoteVideoRef={remoteVideoRef}
              compositeCanvasRef={compositeCanvasRef}
              flipHorizontal={hostFlipHorizontal}
              countdown={countdown}
            />
          </div>

          {/* Right Column: Settings Panel */}
          <div className="space-y-6 lg:max-h-[90vh] lg:overflow-y-auto lg:pr-2">
            {/* Controls */}
            <SettingsPanel>
              <div className="flex flex-wrap gap-4 items-center mb-4">
                {!isCameraActive ? (
                  <button
                    onClick={startScreenShare}
                    disabled={!isConnected}
                    className="px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold transition shadow-md disabled:opacity-50"
                  >
                    {isConnected ? "🖥️ 화면 공유 시작" : "연결 중..."}
                  </button>
                ) : (
                  <button
                    onClick={stopSource}
                    className="px-6 py-3 bg-secondary hover:bg-secondary-dark text-white rounded-lg font-semibold transition shadow-md"
                  >
                    🖥️ 화면 공유 중지
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
                        ? "bg-primary hover:bg-primary-dark text-white shadow-md"
                        : "bg-neutral hover:bg-neutral-dark text-dark"
                    }`}
                    title="내 화면 좌우 반전"
                  >
                    {hostFlipHorizontal
                      ? "↔️ Host 반전 ON"
                      : "↔️ Host 반전 OFF"}
                  </button>
                )}
              </div>

              {/* Chroma key settings */}
              {isCameraActive && chromaKeyEnabled && (
                <div className="space-y-6">
                  <SegmentedBar
                    label="민감도 (Sensitivity)"
                    value={sensitivity}
                    values={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
                    onChange={setSensitivity}
                    color="primary"
                  />
                  <SegmentedBar
                    label="부드러움 (Smoothness)"
                    value={smoothness}
                    values={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
                    onChange={setSmoothness}
                    color="primary"
                  />
                </div>
              )}
            </SettingsPanel>

            {/* Timer settings */}
            {remoteStream && (
              <SettingsPanel title="촬영 설정">
                <div className="space-y-6">
                  <SegmentedBar
                    label="녹화 시간"
                    value={recordingDuration}
                    values={[5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]}
                    onChange={setRecordingDuration}
                    unit="초"
                    color="primary"
                    disabled={isCapturing}
                    description="촬영 카운트다운 시간 (5~15초)"
                  />
                  <SegmentedBar
                    label="촬영 간격"
                    value={captureInterval}
                    values={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
                    onChange={setCaptureInterval}
                    unit="초"
                    color="secondary"
                    disabled={isCapturing}
                    description="사진 촬영 사이의 대기 시간 (0~10초)"
                  />
                </div>
              </SettingsPanel>
            )}

            {/* Frame Layout Selection */}
            {remoteStream && (
              <SettingsPanel title="프레임 레이아웃">
                <div className="space-y-4">
                  <p className="text-sm text-dark/70">
                    영상 프레임 생성 시 사용할 레이아웃을 선택하세요
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {FRAME_LAYOUTS.filter((layout) => layout.isActive).map(
                      (layout) => {
                        const isSelected =
                          store.selectedFrameLayoutId === layout.id;
                        return (
                          <button
                            key={layout.id}
                            onClick={() =>
                              store.setSelectedFrameLayoutId(layout.id)
                            }
                            disabled={isCapturing}
                            className={`
                              relative p-3 rounded-lg border-2 transition
                              ${
                                isSelected
                                  ? "border-primary bg-primary/10"
                                  : "border-neutral hover:border-primary/50"
                              }
                              disabled:opacity-50 disabled:cursor-not-allowed
                            `}
                          >
                            <div className="text-left">
                              <div
                                className={`text-sm font-semibold mb-1 ${
                                  isSelected ? "text-primary" : "text-dark"
                                }`}
                              >
                                {layout.label}
                              </div>
                              <div className="text-xs text-dark/60">
                                {layout.description}
                              </div>
                            </div>
                            {isSelected && (
                              <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                <span className="text-white text-xs">✓</span>
                              </div>
                            )}
                          </button>
                        );
                      }
                    )}
                  </div>
                </div>
              </SettingsPanel>
            )}

            {/* Photo capture panel */}
            {remoteStream && (
              <SettingsPanel title="사진 촬영">
                <div className="mb-4">
                  <PhotoCounter current={photoCount} total={totalPhotos} />

                  {currentlyRecording !== null && (
                    <div className="flex items-center justify-center gap-2 mb-3 text-sm text-primary font-medium">
                      <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                      영상 #{currentlyRecording} 녹화 중
                    </div>
                  )}

                  <button
                    onClick={startPhotoSession}
                    disabled={!remoteStream || isCapturing}
                    className="w-full px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCapturing ? "촬영 중..." : "촬영 시작 (사진 + 영상)"}
                  </button>
                </div>
              </SettingsPanel>
            )}
          </div>
        </div>

        {/* Full-width panels below */}
        <div className="space-y-6">
          <ProcessingIndicator show={isProcessing} />

          <PhotoSelectionPanel
            photos={photos}
            selectedPhotos={[]}
            onGenerateFrame={handleGenerateFrame}
            readOnly={true}
            role="host"
            peerSelectedPhotos={peerSelectedPhotos}
            isGenerating={isGeneratingFrame}
            maxSelection={selectablePhotos}
          />

          {/* Video Frame Composition */}
          {recordedSegments.length >= selectablePhotos && peerSelectedPhotos.length === selectablePhotos && (
            <div className="bg-white border-2 border-neutral rounded-lg p-6 mt-6 shadow-md">
              <h2 className="text-2xl font-semibold mb-4 text-dark">
                영상 프레임 생성
              </h2>
              <p className="text-dark/70 mb-4">
                Guest가 선택한 {selectablePhotos}개의 사진에 해당하는 영상을 {selectedLayout?.label || '프레임'}으로
                합성합니다.
              </p>

              {isComposing && (
                <div className="bg-neutral/30 border border-neutral rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    <div className="text-sm text-dark font-medium">
                      {composeProgress || "처리 중..."}
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={handleComposeVideoFrame}
                disabled={isComposing}
                className="w-full px-6 py-4 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold text-lg transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isComposing ? "합성 중..." : "영상 프레임 생성"}
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
                      <span className="text-sm font-semibold text-primary">
                        합성 완료
                      </span>
                      <span className="text-xs text-dark/70 font-medium">
                        {(composedVideo.blob.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        const timestamp = new Date()
                          .toISOString()
                          .replace(/[:.]/g, "-")
                          .slice(0, -5);

                        // Auto-detect file extension based on blob MIME type
                        const extension = composedVideo.blob.type.includes('mp4') ? 'mp4' : 'webm';

                        downloadWebGLComposedVideo(
                          composedVideo.blob,
                          `vshot-frame-${store.roomId}-${timestamp}.${extension}`
                        );
                      }}
                      className="w-full px-4 py-3 bg-secondary hover:bg-secondary-dark text-white rounded-lg font-semibold transition shadow-md"
                    >
                      📥 영상 프레임 다운로드
                    </button>
                    <p className="text-xs text-dark/70 mt-3 text-center">
                      Guest가 선택한 {selectablePhotos}개 영상을 {selectedLayout?.label || '프레임'}으로 합성한 파일입니다.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Usage info */}
          {!store.peerId && isCameraActive && (
            <div className="bg-white border-2 border-neutral rounded-lg p-6 shadow-md">
              <h2 className="text-xl font-semibold mb-4 text-dark">안내</h2>
              <ul className="list-disc list-inside space-y-2 text-dark/80">
                <li>Room ID를 Guest에게 공유하세요</li>
                <li>Guest가 입장하면 자동으로 연결됩니다</li>
                <li>화면 공유를 통해 VTuber 화면을 공유합니다</li>
                <li>
                  크로마키를 활성화하여 특정 색상 배경을 제거할 수 있습니다
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
