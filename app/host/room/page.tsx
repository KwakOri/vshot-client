"use client";

import {
  ConnectionStatus,
  FlashOverlay,
  FullScreenPhotoSelection,
  PhotoCounter,
  PhotoSelectionPanel,
  ProcessingIndicator,
  SegmentedBar,
  SettingsModal,
  SettingsPanel,
  VideoDisplayPanel,
} from "@/components";
import { useMediaDevices } from "@/hooks/useMediaDevices";
import { useChromaKey } from "@/hooks/useChromaKey";
import { useCompositeCanvas } from "@/hooks/useCompositeCanvas";
import { usePhotoCapture } from "@/hooks/usePhotoCapture";
import { useSignaling } from "@/hooks/useSignaling";
import { useWebRTC } from "@/hooks/useWebRTC";
import { getApiHeaders, getApiHeadersMultipart } from "@/lib/api";
import { uploadBlob } from "@/lib/files";
import { downloadPhotoFrame, generatePhotoFrameWithLayout } from "@/lib/frame-generator";
import { useAppStore } from "@/lib/store";
import { VideoRecorder } from "@/lib/video-recorder";
import { type VideoSegment } from "@/lib/video-splitter";
import { FRAME_LAYOUTS, getLayoutById } from "@/constants/frame-layouts";
import { RESOLUTION } from "@/constants/constants";
import { useRouter } from "next/navigation";
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

export default function HostRoomPage() {
  const router = useRouter();
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

  // Full-screen photo selection mode
  const [showPhotoSelection, setShowPhotoSelection] = useState(false);

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

  // R2 upload state for composed video
  const [isUploadingComposed, setIsUploadingComposed] = useState(false);
  const [uploadComposedComplete, setUploadComposedComplete] = useState(false);
  const [uploadComposedError, setUploadComposedError] = useState<string | null>(null);

  // Timer settings
  const [recordingDuration, setRecordingDuration] = useState(10); // seconds
  const [captureInterval, setCaptureInterval] = useState(3); // seconds between photos

  // Audio settings
  const [remoteAudioEnabled, setRemoteAudioEnabled] = useState(true);
  const [localMicMuted, setLocalMicMuted] = useState(false);

  // Device selection from store
  const { audioDevices, audioOutputDevices, refreshDevices } = useMediaDevices();
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string | null>(
    store.selectedAudioDeviceId
  );
  const [selectedAudioOutputDeviceId, setSelectedAudioOutputDeviceId] = useState<string | null>(
    store.selectedAudioOutputDeviceId
  );

  // Settings modal
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [pendingAudioDeviceId, setPendingAudioDeviceId] = useState<string | null>(null);
  const [pendingAudioOutputDeviceId, setPendingAudioOutputDeviceId] = useState<string | null>(null);

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

    // Check if role is set (came from ready page)
    if (store.role !== "host") {
      console.log("[Host Room] No host role, redirecting to ready page");
      router.push("/host/ready");
      return;
    }

    initializedRef.current = true;

    const init = async () => {
      let userId = store.userId;
      const existingRoomId = store.roomId;

      if (!userId) {
        userId = uuidv4();
        store.setUserId(userId);
      }

      try {
        await connect();

        if (existingRoomId) {
          // Try to rejoin the existing room
          sendMessage({
            type: "join",
            roomId: existingRoomId,
            userId,
            role: "host",
          });
        } else {
          // Create new room
          sendMessage({
            type: "join",
            roomId: "",
            userId,
            role: "host",
          });
        }

        // Apply saved speaker setting
        if (store.selectedAudioOutputDeviceId && remoteVideoRef.current) {
          try {
            if ("setSinkId" in remoteVideoRef.current) {
              await (remoteVideoRef.current as any).setSinkId(
                store.selectedAudioOutputDeviceId
              );
              console.log("[Host Room] Speaker set from saved settings");
            }
          } catch (e) {
            console.error("[Host Room] Failed to set speaker:", e);
          }
        }
      } catch (error) {
        console.error("[Host Room] Connection failed:", error);
        alert("서버에 연결할 수 없습니다.");
      }
    };

    init();
  }, [store._hasHydrated, store.role]);

  // Leave room and go back
  const leaveRoom = () => {
    stopSource();
    store.setRoomId(null as any);
    store.setRole(null);
    router.push("/host/ready");
  };

  // Start camera
  const startCamera = async () => {
    try {
      const audioConstraints: MediaTrackConstraints | boolean = store.selectedAudioDeviceId
        ? { deviceId: { exact: store.selectedAudioDeviceId } }
        : true;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: audioConstraints,
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      await startLocalStream(() => Promise.resolve(stream));
      setIsCameraActive(true);
      setSourceType("camera");
      setChromaKeyEnabled(true); // Enable chroma key for camera
      refreshDevices();
      console.log("[Host Room] Camera started");
    } catch (error) {
      console.error("[Host Room] Camera error:", error);
      alert("카메라에 접근할 수 없습니다.");
    }
  };

  // Start screen share
  const startScreenShare = async () => {
    try {
      const audioConstraints: MediaTrackConstraints | boolean = store.selectedAudioDeviceId
        ? { deviceId: { exact: store.selectedAudioDeviceId } }
        : true;

      // Get microphone stream separately
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "never", // Hide mouse cursor in screen share
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        } as MediaTrackConstraints & { cursor: string },
        audio: false, // We'll use microphone audio instead
      });

      // Add microphone audio track to the stream
      const audioTrack = micStream.getAudioTracks()[0];
      if (audioTrack) {
        stream.addTrack(audioTrack);
      }

      // Handle when user stops sharing via browser UI
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        console.log("[Host Room] Screen share stopped by user");
        stopSource();
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      await startLocalStream(() => Promise.resolve(stream));
      setIsCameraActive(true);
      setSourceType("screen");
      refreshDevices();
      // Keep chroma key state - user can choose to enable/disable for screen share
      console.log("[Host Room] Screen share started with microphone");
    } catch (error) {
      console.error("[Host Room] Screen share error:", error);
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

  // Open settings modal
  const openSettings = () => {
    setPendingAudioDeviceId(selectedAudioDeviceId);
    setPendingAudioOutputDeviceId(selectedAudioOutputDeviceId);
    setIsSettingsOpen(true);
  };

  // Apply settings changes (microphone + speaker for Host)
  const applySettings = async () => {
    const audioInputChanged = pendingAudioDeviceId !== selectedAudioDeviceId;
    const audioOutputChanged = pendingAudioOutputDeviceId !== selectedAudioOutputDeviceId;

    // Apply speaker change (setSinkId)
    if (audioOutputChanged && pendingAudioOutputDeviceId && remoteVideoRef.current) {
      try {
        // Check if setSinkId is supported
        if ('setSinkId' in remoteVideoRef.current) {
          await (remoteVideoRef.current as any).setSinkId(pendingAudioOutputDeviceId);
          console.log('[Host Room] Speaker changed to:', pendingAudioOutputDeviceId);
        }
      } catch (error) {
        console.error('[Host Room] Failed to change speaker:', error);
      }
    }
    setSelectedAudioOutputDeviceId(pendingAudioOutputDeviceId);
    store.setSelectedAudioOutputDeviceId(pendingAudioOutputDeviceId);

    // Apply microphone change
    if (audioInputChanged && pendingAudioDeviceId && localStream) {
      try {
        // Get new audio stream with selected microphone
        const newAudioStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: pendingAudioDeviceId } },
        });

        const newAudioTrack = newAudioStream.getAudioTracks()[0];
        const oldAudioTrack = localStream.getAudioTracks()[0];

        if (oldAudioTrack && newAudioTrack) {
          // Replace audio track in the stream
          localStream.removeTrack(oldAudioTrack);
          localStream.addTrack(newAudioTrack);
          oldAudioTrack.stop();

          console.log('[Host Room] Microphone changed to:', pendingAudioDeviceId);
        }
      } catch (error) {
        console.error('[Host Room] Failed to change microphone:', error);
      }
    }
    setSelectedAudioDeviceId(pendingAudioDeviceId);
    store.setSelectedAudioDeviceId(pendingAudioDeviceId);
  };

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
      console.log("[Host Room] Sent display options:", {
        flipHorizontal: newFlipState,
      });
    }
  };

  // Toggle local microphone mute
  const toggleLocalMic = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = localMicMuted; // Toggle: if muted, enable; if enabled, mute
      });
      setLocalMicMuted(!localMicMuted);
      console.log("[Host Room] Local mic muted:", !localMicMuted);
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

      console.log("[Host Room] Sent frame layout settings:", settings);
    }
  }, [store.selectedFrameLayoutId, store.roomId, remoteStream, slotCount, totalPhotos, selectablePhotos, sendMessage]);

  // Setup remote video
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      console.log("[Host Room] Remote stream connected");
    }
  }, [remoteStream]);

  // Listen to peer's photo selection
  useEffect(() => {
    const handlePhotoSelectSync = (message: any) => {
      console.log("[Host Room] Received peer photo selection:", message);
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
      console.log("[Host Room] Received guest display options:", message.options);
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
        "[Host Room] Received session settings broadcast from server:",
        message
      );
      if (message.settings) {
        console.log(
          "[Host Room] Broadcast settings - recordingDuration:",
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
      console.log("[Host Room] Received video frame request:", message);

      if (message.selectedPhotos && message.selectedPhotos.length === selectablePhotos) {
        console.log(
          "[Host Room] Auto-composing video frame for photos:",
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
      console.log("[Host Room] Received merged photos from server:", message);

      if (message.photos && Array.isArray(message.photos)) {
        // Create photos array with merged images
        const API_URL =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        const mergedPhotos = message.photos
          .sort((a: any, b: any) => a.photoNumber - b.photoNumber)
          .map((photo: any) => `${API_URL}${photo.mergedImageUrl}`);

        setMergedPhotos(mergedPhotos);
        // Show full-screen photo selection UI
        setShowPhotoSelection(true);
        console.log(`[Host Room] Displayed ${mergedPhotos.length} merged photos, showing full-screen selection`);
      }
    };

    on("photos-merged", handlePhotosMerged);

    return () => {
      // Cleanup if needed
    };
  }, [on, setMergedPhotos]);

  // Auto-upload composed video to R2
  useEffect(() => {
    const uploadComposedVideo = async () => {
      if (!composedVideo || isUploadingComposed || uploadComposedComplete) return;

      setIsUploadingComposed(true);
      setUploadComposedError(null);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

      try {
        const extension = composedVideo.blob.type.includes('mp4') ? 'mp4' : 'webm';
        const filename = `vshot-video-${store.roomId}-${timestamp}.${extension}`;

        const uploadResult = await uploadBlob(composedVideo.blob, filename);
        if (!uploadResult.success) {
          throw new Error(uploadResult.error || '영상 업로드 실패');
        }
        console.log('[Host Room] Composed video uploaded to R2:', uploadResult.file?.id);

        setUploadComposedComplete(true);
      } catch (error) {
        console.error('[Host Room] Failed to upload composed video to R2:', error);
        setUploadComposedError(error instanceof Error ? error.message : '업로드 실패');
      } finally {
        setIsUploadingComposed(false);
      }
    };

    uploadComposedVideo();
  }, [composedVideo, isUploadingComposed, uploadComposedComplete, store.roomId]);

  // Listen for session-restart from Guest
  useEffect(() => {
    const handleSessionRestartFromPeer = (message: any) => {
      if (message.type === "session-restart" && message.roomId === store.roomId) {
        console.log("[Host Room] Received session-restart from Guest");
        // Don't notify peer back to avoid infinite loop
        handleRestartSession(false);
      }
    };

    on("session-restart", handleSessionRestartFromPeer);
    return () => {};
  }, [on, store.roomId]);

  // Photo capture logic
  const startPhotoSession = () => {
    if (!store.roomId) return;

    console.log(
      "[Host Room] ========== PHOTO SESSION START (Individual Recording) =========="
    );
    console.log("[Host Room] Session settings:");
    console.log(
      "[Host Room]  - recordingDuration:",
      recordingDuration,
      "seconds"
    );
    console.log(
      "[Host Room]  - captureInterval:",
      captureInterval,
      "seconds"
    );
    console.log(
      "[Host Room] Mode: Individual segment recording + Server FFmpeg composition"
    );
    console.log("[Host Room] ================================================");

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
    console.log("[Host Room] Sending session settings to server:", sessionSettings);
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

    console.log("[Host Room] ========== Taking photo", photoNumber, "==========");
    console.log("[Host Room] Starting individual video recording for this segment");

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
              `[Host Room] Video segment ${completedPhotoNumber} recorded:`,
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
                `[Host Room] Total segments recorded: ${newSegments.length}/${totalPhotos}`
              );
              return newSegments;
            });

            setCurrentlyRecording(null);

            // Immediately upload segment to server in background
            uploadSegmentToServer(segment)
              .then(() => {
                setUploadedSegmentNumbers((prev) => {
                  const updated = [...prev, completedPhotoNumber].sort((a, b) => a - b);
                  console.log(`[Host Room] Segment ${completedPhotoNumber} uploaded. Total uploaded: ${updated.length}/${totalPhotos}`);
                  return updated;
                });
              })
              .catch((err) => {
                console.error(`[Host Room] Failed to upload segment ${completedPhotoNumber}:`, err);
                setSegmentUploadErrors((prev) => [...prev, completedPhotoNumber]);
              });
          }
        );

        console.log(
          `[Host Room] Recording started for photo ${photoNumber} (${recordingDuration}s)`
        );
      } catch (error) {
        console.error("[Host Room] Failed to start recording:", error);
        setCurrentlyRecording(null);
      }
    }

    // Countdown before taking photo (matches recording duration)
    let count = recordingDuration;
    setCountdown(count);
    console.log("[Host Room] Starting countdown from", count, "seconds");

    // Send countdown ticks
    sendMessage({
      type: "countdown-tick",
      roomId: store.roomId,
      count,
      photoNumber,
    });

    const interval = setInterval(() => {
      count--;
      console.log("[Host Room] Countdown:", count);

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
    console.log(`[Host Room] Capturing photo ${photoNumber}`);

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
          console.log("[Host Room] Photo", photoNumber, "captured successfully");
          console.log(
            "[Host Room] Waiting",
            captureInterval,
            "seconds before next photo"
          );
          setTimeout(() => {
            console.log("[Host Room] Starting photo", photoNumber + 1);
            takePhoto(photoNumber + 1);
          }, captureInterval * 1000);
        } else {
          // Last photo
          console.log("[Host Room] Last photo captured!");
          setIsCapturing(false);
          startProcessing();
          console.log("[Host Room] Photo session complete, waiting for merge...");
        }
      } catch (error) {
        console.error(`[Host Room] Failed to upload photo ${photoNumber}:`, error);
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
      console.log("[Host Room] Photo frame generated and downloaded");
    } catch (error) {
      console.error("[Host Room] Failed to generate frame:", error);
      alert("프레임 생성에 실패했습니다.");
    } finally {
      setIsGeneratingFrame(false);
    }
  };

  /**
   * Reset session to initial state
   * @param notifyPeer - If true, sends restart message to peer (use when Host initiates restart)
   */
  const handleRestartSession = (notifyPeer: boolean = true) => {
    // Reset capture state
    setIsCapturing(false);
    resetCapture();
    setRecordedSegments([]);
    setCurrentlyRecording(null);
    setUploadedSegmentNumbers([]);
    setSegmentUploadErrors([]);
    setPeerSelectedPhotos([]);
    setIsGeneratingFrame(false);
    setShowPhotoSelection(false);

    // Reset video composition state
    if (composedVideo) {
      URL.revokeObjectURL(composedVideo.url);
    }
    setComposedVideo(null);
    setIsComposing(false);
    setComposeProgress("");
    setIsUploadingComposed(false);
    setUploadComposedComplete(false);
    setUploadComposedError(null);

    // Clear server segments
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    fetch(`${API_URL}/api/video-v2/clear-segments`, {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify({ roomId: store.roomId }),
    }).catch((err) => console.error("[Host Room] Failed to clear segments:", err));

    // Notify Guest only if Host initiates the restart
    if (notifyPeer && store.roomId) {
      sendMessage({
        type: "session-restart",
        roomId: store.roomId,
        userId: store.userId,
      });
    }

    console.log("[Host Room] Session restarted");
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

    console.log(`[Host Room] Uploading segment ${segment.photoNumber} to server...`, {
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
    console.log(`[Host Room] Segment ${segment.photoNumber} uploaded:`, result);
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

    console.log("[Host Room] Requesting compose from uploaded segments:", {
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
    console.log("[Host Room] Server compose result:", result);

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

    console.log("[Host Room] Sending segments to server for FFmpeg compose:", {
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
    console.log("[Host Room] Server compose result:", result);

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
      console.error("[Host Room] Missing roomId or userId");
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
      console.error("[Host Room] Some segments not uploaded yet:", missing);
      alert(`일부 영상이 아직 업로드되지 않았습니다. (미완료: ${missing.join(", ")})`);
      return;
    }

    console.log("[Host Room] Auto-composing from uploaded segments");
    console.log("[Host Room] Selected photo numbers:", selectedPhotoNumbers);
    console.log("[Host Room] Selected layout:", store.selectedFrameLayoutId);

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

      console.log("[Host Room] Video composition complete:", {
        size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
        serverUrl: videoUrl,
      });

      setComposeProgress("완료!");
      alert("영상 프레임이 서버에서 생성되어 Guest에게 전송되었습니다!");
    } catch (error) {
      console.error("[Host Room] Failed to compose video:", error);
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

    console.log("[Host Room] Server FFmpeg compose from uploaded start");
    console.log("[Host Room] Selected photo numbers:", selectedPhotoNumbers);
    console.log("[Host Room] Selected layout:", store.selectedFrameLayoutId);

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
      console.log("[Host Room] Video composition complete:", {
        size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
        layout: store.selectedFrameLayoutId,
      });

      alert("영상 프레임이 생성되었습니다!");
    } catch (error) {
      console.error("[Host Room] Failed to compose video:", error);
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
        "[Host Room] Peer joined, waiting before creating offer:",
        store.peerId
      );
      // Wait a bit for guest to initialize their stream
      const timer = setTimeout(() => {
        console.log("[Host Room] Creating offer for peer:", store.peerId);
        createOffer().catch((error) => {
          console.error("[Host Room] Failed to create offer:", error);
        });
      }, 1000); // 1 second delay to ensure guest is ready

      return () => clearTimeout(timer);
    }
  }, [store.peerId, localStream, createOffer]);

  // Cleanup - only on component unmount
  useEffect(() => {
    return () => {
      console.log("[Host Room] Component unmounting - cleaning up resources");
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

  console.log("HOST: isProcessing", isProcessing);

  // Show full-screen photo selection when photos are ready (read-only for Host)
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
          ref={compositeCanvasRef}
          className="absolute top-0 left-0 w-0 h-0 opacity-0 pointer-events-none"
        />

        {/* 녹화 전용 hidden canvas */}
        <canvas
          ref={recordingCanvasRef}
          width={RESOLUTION.VIDEO_WIDTH}
          height={RESOLUTION.VIDEO_HEIGHT}
          className="absolute top-0 left-0 w-0 h-0 opacity-0 pointer-events-none"
        />

        {/* Header */}
        <div className="flex-shrink-0 flex items-center gap-2 bg-white border-2 border-neutral rounded-lg m-4 mb-0 p-2 shadow-md">
          {/* Back button - returns to video view */}
          <button
            onClick={() => setShowPhotoSelection(false)}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-neutral/40 hover:bg-neutral rounded-lg transition"
            title="영상 화면으로 돌아가기"
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

          <h1 className="text-lg font-bold text-dark">Host</h1>

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
            role="host"
          />

          {/* Spacer */}
          <div className="flex-1" />

          {/* My mic mute button */}
          <button
            onClick={toggleLocalMic}
            className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg transition ${
              localMicMuted
                ? "bg-red-500 hover:bg-red-600 text-white"
                : "bg-neutral/40 hover:bg-neutral text-dark"
            }`}
            title={localMicMuted ? "마이크 켜기" : "마이크 끄기"}
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

          {/* Remote audio toggle button */}
          <button
            onClick={() => setRemoteAudioEnabled(!remoteAudioEnabled)}
            className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg transition ${
              remoteAudioEnabled
                ? "bg-neutral/40 hover:bg-neutral text-dark"
                : "bg-red-500 hover:bg-red-600 text-white"
            }`}
            title={remoteAudioEnabled ? "상대방 음성 끄기" : "상대방 음성 켜기"}
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

          {/* Settings button */}
          <button
            onClick={openSettings}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-neutral/40 hover:bg-neutral rounded-lg transition"
            title="Settings"
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
              <circle cx="12" cy="12" r="1" />
              <circle cx="12" cy="5" r="1" />
              <circle cx="12" cy="19" r="1" />
            </svg>
          </button>
        </div>

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
          showCamera={false}
          showMicrophone={true}
        />

        {/* Full-screen Photo Selection (read-only for Host) */}
        <div className="flex-1 min-h-0 p-4">
          <FullScreenPhotoSelection
            photos={photos}
            selectedPhotos={[]}
            onPhotoSelect={() => {}}
            onComplete={() => {}}
            frameLayout={selectedLayout}
            maxSelection={selectablePhotos}
            role="host"
            readOnly={true}
            peerSelectedPhotos={peerSelectedPhotos}
            isGenerating={isComposing}
          />
        </div>

        {/* Video Frame Composition - shown when peer selected photos */}
        {uploadedSegmentNumbers.length >= selectablePhotos && peerSelectedPhotos.length === selectablePhotos && (
          <div className="flex-shrink-0 bg-white border-t-2 border-neutral p-4">
            <div className="max-w-xl mx-auto">
              {isComposing ? (
                <div className="flex items-center justify-center gap-3 p-3 bg-neutral/30 rounded-lg">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                  <span className="text-sm text-dark font-medium">{composeProgress || "처리 중..."}</span>
                </div>
              ) : composedVideo ? (
                <div className="space-y-2">
                  <video src={composedVideo.url} controls className="w-full rounded-lg border-2 border-neutral" />
                  {isUploadingComposed ? (
                    <div className="flex items-center justify-center gap-3 p-3 bg-neutral/30 rounded-lg">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                      <span className="text-sm text-dark font-medium">저장 중...</span>
                    </div>
                  ) : uploadComposedComplete ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-center gap-2 p-3 bg-green-100 rounded-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                          <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                        <span className="text-sm text-green-700 font-semibold">저장 완료! 관리자 페이지에서 확인하세요.</span>
                      </div>
                      <button
                        onClick={() => handleRestartSession()}
                        className="w-full px-4 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold transition shadow-md"
                      >
                        다시 시작
                      </button>
                    </div>
                  ) : uploadComposedError ? (
                    <div className="flex items-center justify-center gap-2 p-3 bg-red-100 rounded-lg">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                      <span className="text-sm text-red-700 font-semibold">저장 실패: {uploadComposedError}</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2 p-3 bg-neutral/30 rounded-lg">
                      <span className="text-sm text-dark font-medium">저장 준비 중...</span>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={handleComposeVideoFrame}
                  className="w-full px-4 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold transition shadow-md"
                >
                  영상 프레임 생성
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

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
            {/* Back button + Title */}
            <div className="flex items-center gap-2">
              <button
                onClick={leaveRoom}
                className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-neutral/40 hover:bg-neutral rounded-lg transition"
                title="나가기"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-lg sm:text-2xl landscape:text-lg font-bold text-dark">
                Host
              </h1>
            </div>
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

              {/* My mic mute button */}
              <button
                onClick={toggleLocalMic}
                className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg transition ${
                  localMicMuted
                    ? "bg-red-500 hover:bg-red-600 text-white"
                    : "bg-neutral/40 hover:bg-neutral text-dark"
                }`}
                title={localMicMuted ? "마이크 켜기" : "마이크 끄기"}
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

              {/* Remote audio toggle button */}
              <button
                onClick={() => setRemoteAudioEnabled(!remoteAudioEnabled)}
                className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg transition ${
                  remoteAudioEnabled
                    ? "bg-neutral/40 hover:bg-neutral text-dark"
                    : "bg-red-500 hover:bg-red-600 text-white"
                }`}
                title={remoteAudioEnabled ? "상대방 음성 끄기" : "상대방 음성 켜기"}
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

              {/* Settings button */}
              <button
                onClick={openSettings}
                className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-neutral/40 hover:bg-neutral rounded-lg transition"
                title="Settings"
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
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="12" cy="5" r="1" />
                  <circle cx="12" cy="19" r="1" />
                </svg>
              </button>
            </div>
          </div>
        </div>

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
          showCamera={false}
          showMicrophone={true}
        />

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
              remoteAudioEnabled={remoteAudioEnabled}
            />
          </div>

          {/* Right Column: Settings Panel */}
          <div className="space-y-4 overflow-y-auto pr-2">
            {/* Show capture status during capture */}
            {isCapturing ? (
              <div className="bg-white border-2 border-primary rounded-lg p-8 shadow-md">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-3 mb-4">
                    <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="text-xl font-semibold text-dark">촬영 중</span>
                  </div>
                  <div className="text-xl font-semibold text-dark mb-2">
                    사진 {photoCount + 1} / {totalPhotos}
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

                    {/* Audio toggle */}
                    {remoteStream && (
                      <button
                        onClick={() => setRemoteAudioEnabled(!remoteAudioEnabled)}
                        className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
                          remoteAudioEnabled
                            ? "bg-primary hover:bg-primary-dark text-white shadow-md"
                            : "bg-neutral hover:bg-neutral-dark text-dark"
                        }`}
                        title="상대방 음성 켜기/끄기"
                      >
                        {remoteAudioEnabled ? "음성 ON" : "음성 OFF"}
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
