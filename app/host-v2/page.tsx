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
import { getApiHeaders, getApiHeadersMultipart } from "@/lib/api";
import { downloadPhotoFrame, generatePhotoFrameWithLayout } from "@/lib/frame-generator";
import { useAppStore } from "@/lib/store";
import { VideoRecorder } from "@/lib/video-recorder";
import { type VideoSegment } from "@/lib/video-splitter";
import { FRAME_LAYOUTS, getLayoutById } from "@/constants/frame-layouts";
import { RESOLUTION } from "@/constants/constants";
import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";

/**
 * Layout ID mapping for server-side FFmpeg composition.
 * Keys must match the layout IDs used in the client FRAME_LAYOUTS constant.
 */
const LAYOUT_ID_MAP: Record<string, string> = {
  "4cut-grid": "4cut-grid",
  "1cut-polaroid": "1cut-polaroid",
  "4cut-quoka": "4cut-quoka",
};

export default function HostV2Page() {
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
  const recordingCanvasRef = useRef<HTMLCanvasElement>(null); // 녹화 전용 canvas (blur 없음)
  const initializedRef = useRef(false);
  const videoRecorderRef = useRef<VideoRecorder | null>(null);

  // Video recording state - Individual segments per photo
  const [recordedSegments, setRecordedSegments] = useState<VideoSegment[]>([]);
  const [currentlyRecording, setCurrentlyRecording] = useState<number | null>(
    null
  ); // photoNumber being recorded

  // Video segment upload state (for immediate upload)
  const [uploadedSegmentNumbers, setUploadedSegmentNumbers] = useState<number[]>([]);
  const [segmentUploadErrors, setSegmentUploadErrors] = useState<number[]>([]);

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

  // Use shared composite canvas hook - 화면 표시용 (blur 적용)
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

  // 녹화 전용 composite canvas hook - blur 없음
  useCompositeCanvas({
    compositeCanvas: recordingCanvasRef.current,
    backgroundVideo: remoteVideoRef.current,
    foregroundCanvas: localCanvasRef.current,
    localStream,
    remoteStream,
    width: RESOLUTION.VIDEO_WIDTH,
    height: RESOLUTION.VIDEO_HEIGHT,
    guestFlipHorizontal,
    hostFlipHorizontal,
    blurGuest: false, // 녹화용은 blur 없이 원본 사용
  });

  // Initialize video recorder once - 녹화 전용 canvas 사용 (blur 없음)
  useEffect(() => {
    if (!videoRecorderRef.current) {
      videoRecorderRef.current = new VideoRecorder(
        () => recordingCanvasRef.current // 녹화용 canvas에서 캡처 (blur 없는 원본)
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
        console.error("[HostV2] Connection failed:", error);
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
      console.log("[HostV2] Camera started");
    } catch (error) {
      console.error("[HostV2] Camera error:", error);
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
        } as MediaTrackConstraints & { cursor: string },
        audio: true,
      });

      // Handle when user stops sharing via browser UI
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        console.log("[HostV2] Screen share stopped by user");
        stopSource();
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      await startLocalStream(() => Promise.resolve(stream));
      setIsCameraActive(true);
      setSourceType("screen");
      // Keep chroma key state - user can choose to enable/disable for screen share
      console.log("[HostV2] Screen share started");
    } catch (error) {
      console.error("[HostV2] Screen share error:", error);
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
      console.log("[HostV2] Sent display options:", {
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

      console.log("[HostV2] Sent frame layout settings:", settings);
    }
  }, [store.selectedFrameLayoutId, store.roomId, remoteStream, slotCount, totalPhotos, selectablePhotos, sendMessage]);

  // Setup remote video
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      console.log("[HostV2] Remote stream connected");
    }
  }, [remoteStream]);

  // Listen to peer's photo selection
  useEffect(() => {
    const handlePhotoSelectSync = (message: any) => {
      console.log("[HostV2] Received peer photo selection:", message);
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
      console.log("[HostV2] Received guest display options:", message.options);
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
        "[HostV2] Received session settings broadcast from server:",
        message
      );
      if (message.settings) {
        console.log(
          "[HostV2] Broadcast settings - recordingDuration:",
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
      console.log("[HostV2] Received video frame request:", message);

      if (message.selectedPhotos && message.selectedPhotos.length === selectablePhotos) {
        console.log(
          "[HostV2] Auto-composing video frame for photos:",
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
  }, [on, uploadedSegmentNumbers, recordingDuration, captureInterval, selectablePhotos]);

  // Listen to merged photos from server
  useEffect(() => {
    const handlePhotosMerged = (message: any) => {
      console.log("[HostV2] Received merged photos from server:", message);

      if (message.photos && Array.isArray(message.photos)) {
        // Create photos array with merged images
        const API_URL =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        const mergedPhotos = message.photos
          .sort((a: any, b: any) => a.photoNumber - b.photoNumber)
          .map((photo: any) => `${API_URL}${photo.mergedImageUrl}`);

        setMergedPhotos(mergedPhotos);
        console.log(`[HostV2] Displayed ${mergedPhotos.length} merged photos`);
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
      "[HostV2] ========== PHOTO SESSION START (Individual Recording) =========="
    );
    console.log("[HostV2] Session settings:");
    console.log(
      "[HostV2]  - recordingDuration:",
      recordingDuration,
      "seconds"
    );
    console.log(
      "[HostV2]  - captureInterval:",
      captureInterval,
      "seconds"
    );
    console.log(
      "[HostV2] Mode: Individual segment recording + Server FFmpeg composition"
    );
    console.log("[HostV2] ================================================");

    setIsCapturing(true);
    resetCapture();
    setRecordedSegments([]); // Clear previous segments
    setCurrentlyRecording(null);
    setUploadedSegmentNumbers([]); // Clear previous upload state
    setSegmentUploadErrors([]); // Clear previous errors

    // Send session settings to server
    const sessionSettings = {
      type: "session-settings" as const,
      roomId: store.roomId,
      settings: {
        recordingDuration,
        captureInterval,
      },
    };
    console.log("[HostV2] Sending session settings to server:", sessionSettings);
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

  const takePhoto = async (photoNumber: number) => {
    if (!store.roomId || photoNumber > totalPhotos) {
      setIsCapturing(false);
      return;
    }

    console.log("[HostV2] ========== Taking photo", photoNumber, "==========");
    console.log("[HostV2] Starting individual video recording for this segment");

    // Start individual video recording for this photo
    if (videoRecorderRef.current) {
      setCurrentlyRecording(photoNumber);

      const recordingStartTime = Date.now();

      try {
        await videoRecorderRef.current.startRecording(
          photoNumber,
          recordingDuration * 1000, // Convert seconds to milliseconds
          (blob, completedPhotoNumber) => {
            // Recording complete callback
            const recordingEndTime = Date.now();
            const duration = (recordingEndTime - recordingStartTime) / 1000;

            console.log(
              `[HostV2] Video segment ${completedPhotoNumber} recorded:`,
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
                `[HostV2] Total segments recorded: ${newSegments.length}/${totalPhotos}`
              );
              return newSegments;
            });

            setCurrentlyRecording(null);

            // Immediately upload segment to server in background
            uploadSegmentToServer(segment)
              .then(() => {
                setUploadedSegmentNumbers((prev) => {
                  const updated = [...prev, completedPhotoNumber].sort((a, b) => a - b);
                  console.log(`[HostV2] Segment ${completedPhotoNumber} uploaded. Total uploaded: ${updated.length}/${totalPhotos}`);
                  return updated;
                });
              })
              .catch((err) => {
                console.error(`[HostV2] Failed to upload segment ${completedPhotoNumber}:`, err);
                setSegmentUploadErrors((prev) => [...prev, completedPhotoNumber]);
              });
          }
        );

        console.log(
          `[HostV2] Recording started for photo ${photoNumber} (${recordingDuration}s)`
        );
      } catch (error) {
        console.error("[HostV2] Failed to start recording:", error);
        setCurrentlyRecording(null);
      }
    }

    // Countdown before taking photo (matches recording duration)
    let count = recordingDuration;
    setCountdown(count);
    console.log("[HostV2] Starting countdown from", count, "seconds");

    // Send countdown ticks
    sendMessage({
      type: "countdown-tick",
      roomId: store.roomId,
      count,
      photoNumber,
    });

    const interval = setInterval(() => {
      count--;
      console.log("[HostV2] Countdown:", count);

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
    console.log(`[HostV2] Capturing photo ${photoNumber}`);

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
          console.log("[HostV2] Photo", photoNumber, "captured successfully");
          console.log(
            "[HostV2] Waiting",
            captureInterval,
            "seconds before next photo"
          );
          setTimeout(() => {
            console.log("[HostV2] Starting photo", photoNumber + 1);
            takePhoto(photoNumber + 1);
          }, captureInterval * 1000);
        } else {
          // Last photo
          console.log("[HostV2] Last photo captured!");
          setIsCapturing(false);
          startProcessing();
          console.log("[HostV2] Photo session complete, waiting for merge...");
        }
      } catch (error) {
        console.error(`[HostV2] Failed to upload photo ${photoNumber}:`, error);
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
      console.log("[HostV2] Photo frame generated and downloaded");
    } catch (error) {
      console.error("[HostV2] Failed to generate frame:", error);
      alert("프레임 생성에 실패했습니다.");
    } finally {
      setIsGeneratingFrame(false);
    }
  };

  /**
   * Upload a single video segment to server immediately after recording.
   * This enables parallel upload during photo session.
   */
  const uploadSegmentToServer = async (segment: VideoSegment): Promise<void> => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

    const formData = new FormData();
    const ext = segment.blob.type.includes("mp4") ? "mp4" : "webm";
    formData.append("video", segment.blob, `segment-${segment.photoNumber}.${ext}`);
    formData.append("roomId", store.roomId!);
    formData.append("userId", store.userId!);
    formData.append("photoNumber", String(segment.photoNumber));

    console.log(`[HostV2] Uploading segment ${segment.photoNumber} to server...`, {
      size: `${(segment.blob.size / 1024 / 1024).toFixed(2)} MB`,
    });

    const response = await fetch(`${API_URL}/api/video-v2/upload-segment`, {
      method: "POST",
      headers: getApiHeadersMultipart(),
      body: formData,
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `Server responded ${response.status}`);
    }

    const result = await response.json();
    console.log(`[HostV2] Segment ${segment.photoNumber} uploaded:`, result);
  };

  /**
   * Request video composition from already uploaded segments.
   * Called when Guest selects photos.
   */
  const requestComposeFromUploaded = async (
    selectedPhotoIndices: number[]
  ): Promise<{ videoUrl: string }> => {
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

    // Convert 0-based indices to 1-based photo numbers
    const selectedPhotoNumbers = selectedPhotoIndices.map((i) => i + 1);

    // Check if all selected segments are uploaded
    const allUploaded = selectedPhotoNumbers.every((n) =>
      uploadedSegmentNumbers.includes(n)
    );

    if (!allUploaded) {
      const missing = selectedPhotoNumbers.filter(
        (n) => !uploadedSegmentNumbers.includes(n)
      );
      throw new Error(
        `일부 영상이 아직 업로드되지 않았습니다. (미완료: ${missing.join(", ")})`
      );
    }

    console.log("[HostV2] Requesting compose from uploaded segments:", {
      selectedPhotoNumbers,
      layoutId: LAYOUT_ID_MAP[store.selectedFrameLayoutId] || store.selectedFrameLayoutId,
    });

    const response = await fetch(`${API_URL}/api/video-v2/compose-from-uploaded`, {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({
        roomId: store.roomId,
        userId: store.userId,
        layoutId: LAYOUT_ID_MAP[store.selectedFrameLayoutId] || store.selectedFrameLayoutId,
        selectedPhotoNumbers,
      }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `Server responded ${response.status}`);
    }

    const result = await response.json();
    console.log("[HostV2] Server compose result:", result);

    return { videoUrl: result.videoUrl };
  };

  /**
   * Send video segments to server for FFmpeg composition.
   * Replaces the old WebGL client-side composition.
   * @deprecated Use requestComposeFromUploaded instead for better performance
   */
  const sendSegmentsToServer = async (
    selectedSegments: VideoSegment[]
  ): Promise<{ blob: Blob; videoUrl: string }> => {
    const API_URL =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

    const formData = new FormData();
    selectedSegments.forEach((seg, i) => {
      const ext = seg.blob.type.includes("mp4") ? "mp4" : "webm";
      formData.append("videos", seg.blob, `segment-${seg.photoNumber}.${ext}`);
    });
    formData.append("layoutId", LAYOUT_ID_MAP[store.selectedFrameLayoutId] || store.selectedFrameLayoutId);
    formData.append("roomId", store.roomId!);
    formData.append("userId", store.userId!);

    console.log("[HostV2] Sending segments to server for FFmpeg compose:", {
      segmentCount: selectedSegments.length,
      layoutId: LAYOUT_ID_MAP[store.selectedFrameLayoutId] || store.selectedFrameLayoutId,
      totalSize: `${(selectedSegments.reduce((s, seg) => s + seg.blob.size, 0) / 1024 / 1024).toFixed(2)} MB`,
    });

    const response = await fetch(`${API_URL}/api/video-v2/compose`, {
      method: "POST",
      headers: getApiHeadersMultipart(),
      body: formData,
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `Server responded ${response.status}`);
    }

    const result = await response.json();
    console.log("[HostV2] Server compose result:", result);

    // Fetch the composed video blob for local preview
    const videoResponse = await fetch(`${API_URL}${result.videoUrl}`);
    if (!videoResponse.ok) {
      throw new Error("Failed to fetch composed video for preview");
    }
    const blob = await videoResponse.blob();

    return { blob, videoUrl: result.videoUrl };
  };

  const autoComposeAndUploadVideo = async (selectedPhotoIndices: number[]) => {
    if (!store.roomId || !store.userId) {
      console.error("[HostV2] Missing roomId or userId");
      return;
    }

    // Convert to 1-based photo numbers
    const selectedPhotoNumbers = selectedPhotoIndices.map((i) => i + 1);

    // Check if all selected segments are uploaded
    const allUploaded = selectedPhotoNumbers.every((n) =>
      uploadedSegmentNumbers.includes(n)
    );

    if (!allUploaded) {
      const missing = selectedPhotoNumbers.filter(
        (n) => !uploadedSegmentNumbers.includes(n)
      );
      console.error("[HostV2] Some segments not uploaded yet:", missing);
      alert(`일부 영상이 아직 업로드되지 않았습니다. (미완료: ${missing.join(", ")})`);
      return;
    }

    console.log("[HostV2] Auto-composing from uploaded segments");
    console.log("[HostV2] Selected photo numbers:", selectedPhotoNumbers);
    console.log("[HostV2] Selected layout:", store.selectedFrameLayoutId);

    setIsComposing(true);
    setComposeProgress("서버에서 영상 합성 중...");

    try {
      const { videoUrl } = await requestComposeFromUploaded(selectedPhotoIndices);

      setComposeProgress("합성 완료, 미리보기 준비 중...");

      // Fetch the composed video blob for local preview
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const videoResponse = await fetch(`${API_URL}${videoUrl}`);
      if (!videoResponse.ok) {
        throw new Error("Failed to fetch composed video for preview");
      }
      const blob = await videoResponse.blob();

      // Save composed video locally for preview
      const url = URL.createObjectURL(blob);
      if (composedVideo) {
        URL.revokeObjectURL(composedVideo.url);
      }
      setComposedVideo({ blob, url });

      console.log("[HostV2] Video composition complete:", {
        size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
        serverUrl: videoUrl,
      });

      setComposeProgress("완료!");
      alert("영상 프레임이 서버에서 생성되어 Guest에게 전송되었습니다!");
    } catch (error) {
      console.error("[HostV2] Failed to compose video:", error);
      alert(
        "영상 합성에 실패했습니다: " +
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

    // Convert to 1-based photo numbers
    const selectedPhotoNumbers = peerSelectedPhotos.map((i) => i + 1);

    // Check if all selected segments are uploaded
    const allUploaded = selectedPhotoNumbers.every((n) =>
      uploadedSegmentNumbers.includes(n)
    );

    if (!allUploaded) {
      const missing = selectedPhotoNumbers.filter(
        (n) => !uploadedSegmentNumbers.includes(n)
      );
      alert(
        `일부 영상이 아직 업로드되지 않았습니다. (미완료: ${missing.join(", ")})\n업로드가 완료될 때까지 기다려주세요.`
      );
      return;
    }

    console.log("[HostV2] Server FFmpeg compose from uploaded start");
    console.log("[HostV2] Selected photo numbers:", selectedPhotoNumbers);
    console.log("[HostV2] Selected layout:", store.selectedFrameLayoutId);

    setIsComposing(true);
    setComposeProgress("서버에서 영상 합성 중...");

    try {
      const { videoUrl } = await requestComposeFromUploaded(peerSelectedPhotos);

      // Fetch the composed video blob for local preview
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const videoResponse = await fetch(`${API_URL}${videoUrl}`);
      if (!videoResponse.ok) {
        throw new Error("Failed to fetch composed video for preview");
      }
      const blob = await videoResponse.blob();

      const url = URL.createObjectURL(blob);

      // Cleanup previous composed video
      if (composedVideo) {
        URL.revokeObjectURL(composedVideo.url);
      }

      setComposedVideo({ blob, url });
      console.log("[HostV2] Video composition complete:", {
        size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
        layout: store.selectedFrameLayoutId,
      });

      alert("영상 프레임이 생성되었습니다!");
    } catch (error) {
      console.error("[HostV2] Failed to compose video:", error);
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
        "[HostV2] Peer joined, waiting before creating offer:",
        store.peerId
      );
      // Wait a bit for guest to initialize their stream
      const timer = setTimeout(() => {
        console.log("[HostV2] Creating offer for peer:", store.peerId);
        createOffer().catch((error) => {
          console.error("[HostV2] Failed to create offer:", error);
        });
      }, 1000); // 1 second delay to ensure guest is ready

      return () => clearTimeout(timer);
    }
  }, [store.peerId, localStream, createOffer]);

  // Cleanup - only on component unmount
  useEffect(() => {
    return () => {
      console.log("[HostV2] Component unmounting - cleaning up resources");
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

  console.log("HOST-V2: isProcessing", isProcessing);

  return (
    <div className="flex flex-col h-full p-4 overflow-hidden">
      <FlashOverlay show={showFlash} />

      {/* 녹화 전용 hidden canvas - blur 없는 원본 합성 */}
      <canvas
        ref={recordingCanvasRef}
        width={RESOLUTION.VIDEO_WIDTH}
        height={RESOLUTION.VIDEO_HEIGHT}
        className="absolute top-0 left-0 w-0 h-0 opacity-0 pointer-events-none"
      />

      <div className="flex flex-col h-full max-w-6xl mx-auto w-full">
        {/* Header - fixed height */}
        <div className="flex-shrink-0 mb-2">
          <div className="flex flex-col landscape:flex-row gap-2 landscape:gap-3 items-start landscape:items-center landscape:justify-between">
            <h1 className="text-lg sm:text-2xl landscape:text-lg font-bold text-dark">
              Host V2
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
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4 min-h-0 overflow-hidden">
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
          <div className="space-y-4 overflow-y-auto pr-2">
            {/* Show countdown during capture */}
            {isCapturing && countdown !== null ? (
              <div className="bg-white border-2 border-primary rounded-lg p-8 shadow-md">
                <div className="text-center">
                  <div className="text-8xl font-bold text-primary mb-4 animate-pulse">
                    {countdown}
                  </div>
                  <div className="text-xl font-semibold text-dark mb-2">
                    사진 {photoCount + 1} / {totalPhotos} 촬영 중
                  </div>
                  <PhotoCounter current={photoCount} total={totalPhotos} />

                  {currentlyRecording !== null && (
                    <div className="flex items-center justify-center gap-2 mt-4 text-sm text-primary font-medium">
                      <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                      영상 #{currentlyRecording} 녹화 중
                    </div>
                  )}
                </div>
              </div>
            ) : photos.length >= totalPhotos ? (
              /* Show photo selection panel after capture complete */
              <div className="space-y-4">
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

                {/* Video Frame Composition - integrated here */}
                {uploadedSegmentNumbers.length >= selectablePhotos && peerSelectedPhotos.length === selectablePhotos && (
                  <div className="bg-white border-2 border-neutral rounded-lg p-4 shadow-md">
                    <h3 className="text-lg font-semibold mb-3 text-dark">
                      영상 프레임 생성
                    </h3>

                    {isComposing && (
                      <div className="bg-neutral/30 border border-neutral rounded-lg p-3 mb-3">
                        <div className="flex items-center gap-3">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                          <div className="text-sm text-dark font-medium">
                            {composeProgress || "처리 중..."}
                          </div>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={handleComposeVideoFrame}
                      disabled={isComposing}
                      className="w-full px-4 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isComposing ? "합성 중..." : "영상 프레임 생성"}
                    </button>

                    {composedVideo && (
                      <div className="mt-3">
                        <div className="bg-dark rounded-lg overflow-hidden mb-3 border-2 border-neutral">
                          <video
                            src={composedVideo.url}
                            controls
                            className="w-full aspect-video bg-black"
                          />
                        </div>
                        <button
                          onClick={() => {
                            const timestamp = new Date()
                              .toISOString()
                              .replace(/[:.]/g, "-")
                              .slice(0, -5);

                            const extension = composedVideo.blob.type.includes('mp4') ? 'mp4' : 'webm';
                            const filename = `vshot-frame-${store.roomId}-${timestamp}.${extension}`;

                            const link = document.createElement("a");
                            link.href = composedVideo.url;
                            link.download = filename;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          }}
                          className="w-full px-4 py-3 bg-secondary hover:bg-secondary-dark text-white rounded-lg font-semibold transition shadow-md"
                        >
                          영상 프레임 다운로드
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Default: Show settings panels */
              <>
                {/* Controls */}
                <SettingsPanel>
                  <div className="flex flex-wrap gap-4 items-center mb-4">
                    {!isCameraActive ? (
                      <button
                        onClick={startScreenShare}
                        disabled={!isConnected}
                        className="px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold transition shadow-md disabled:opacity-50"
                      >
                        {isConnected ? "화면 공유 시작" : "연결 중..."}
                      </button>
                    ) : (
                      <button
                        onClick={stopSource}
                        className="px-6 py-3 bg-secondary hover:bg-secondary-dark text-white rounded-lg font-semibold transition shadow-md"
                      >
                        화면 공유 중지
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
                          ? "Host 반전 ON"
                          : "Host 반전 OFF"}
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

                {/* Photo capture start button only */}
                {remoteStream && (
                  <button
                    onClick={startPhotoSession}
                    disabled={!remoteStream || isCapturing}
                    className="w-full px-6 py-4 bg-primary hover:bg-primary-dark text-white rounded-xl font-bold text-lg transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    촬영 시작 (사진 + 영상)
                  </button>
                )}
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
