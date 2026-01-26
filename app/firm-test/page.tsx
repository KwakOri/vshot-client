"use client";

/**
 * FirmTestPage
 *
 * 서버의 사진/영상 처리 성능을 테스트하기 위한 페이지입니다.
 * Guest와의 통신 기능 없이 Host 단독으로 사진 촬영 후 서버로 전송하여
 * 합성 처리 시간을 측정합니다.
 *
 * 기존 /host, /guest 페이지에 영향을 주지 않습니다.
 */

import {
  FlashOverlay,
  PhotoCounter,
  SegmentedBar,
  SettingsPanel,
} from "@/components";
import { useChromaKey } from "@/hooks/useChromaKey";
import { getApiHeaders, getApiHeadersMultipart } from "@/lib/api";
import { VideoRecorder } from "@/lib/video-recorder";
import { type VideoSegment } from "@/lib/video-splitter";
import { checkCodecSupport } from "@/lib/webgl-video-composer";
import { FRAME_LAYOUTS, getLayoutById } from "@/constants/frame-layouts";
import { RESOLUTION } from "@/constants/constants";
import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";

interface TimingResult {
  testId: string;
  photoNumber: number;
  saveTimeMs: number;
  totalTimeMs: number;
  sizeMB: number;
  url?: string;
}

interface VideoTimingResult {
  testId: string;
  uploadTimeMs: number;
  composeTimeMs: number;
  totalTimeMs: number;
  inputSizeMB: number;
  outputSizeMB: number;
  duration: number;
  url: string;
}

export default function FirmTestPage() {
  // Generate testId only on client side to avoid hydration mismatch
  const [testId, setTestId] = useState<string>("");

  useEffect(() => {
    setTestId(uuidv4().slice(0, 8));
  }, []);

  // Camera/Screen state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [sourceType, setSourceType] = useState<"camera" | "screen">("camera");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  // Chroma key settings
  const [chromaKeyEnabled, setChromaKeyEnabled] = useState(true);
  const [sensitivity, setSensitivity] = useState(50);
  const [smoothness, setSmoothness] = useState(10);

  // Display options
  const [flipHorizontal, setFlipHorizontal] = useState(false);

  // Photo capture state
  const [isCapturing, setIsCapturing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  const [photoCount, setPhotoCount] = useState(0);
  const [photos, setPhotos] = useState<string[]>([]);

  // Frame layout
  const [selectedFrameLayoutId, setSelectedFrameLayoutId] = useState("layout-4-grid");
  const selectedLayout = getLayoutById(selectedFrameLayoutId);
  const slotCount = selectedLayout?.slotCount || 4;
  const totalPhotos = slotCount * 2;

  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localCanvasRef = useRef<HTMLCanvasElement>(null);
  const videoRecorderRef = useRef<VideoRecorder | null>(null);

  // State to track DOM elements for hooks (refs don't trigger re-renders)
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);

  // Video recording state
  const [recordedSegments, setRecordedSegments] = useState<VideoSegment[]>([]);
  const [currentlyRecording, setCurrentlyRecording] = useState<number | null>(null);

  // Video composition state
  const [composedVideo, setComposedVideo] = useState<{
    blob: Blob;
    url: string;
  } | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [composeProgress, setComposeProgress] = useState("");

  // Timer settings
  const [recordingDuration, setRecordingDuration] = useState(10);
  const [captureInterval, setCaptureInterval] = useState(3);

  // Timing results
  const [photoTimings, setPhotoTimings] = useState<TimingResult[]>([]);
  const [videoTiming, setVideoTiming] = useState<VideoTimingResult | null>(null);

  // Set DOM element references after mount
  useEffect(() => {
    setVideoElement(localVideoRef.current);
    setCanvasElement(localCanvasRef.current);
  }, []);

  // Use chroma key hook
  useChromaKey({
    videoElement,
    canvasElement,
    stream: localStream,
    enabled: chromaKeyEnabled,
    sensitivity,
    smoothness,
    width: RESOLUTION.VIDEO_WIDTH,
    height: RESOLUTION.VIDEO_HEIGHT,
  });

  // Initialize video recorder
  useEffect(() => {
    if (!videoRecorderRef.current) {
      videoRecorderRef.current = new VideoRecorder(() => localCanvasRef.current);
    }
  }, []);

  // Check codec support on mount
  useEffect(() => {
    console.log("[FirmTest] Checking MediaRecorder codec support...");
    checkCodecSupport();
  }, []);

  // Start camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        await localVideoRef.current.play().catch(() => {});
      }

      setLocalStream(stream);
      setIsCameraActive(true);
      setSourceType("camera");
      setChromaKeyEnabled(true);
      console.log("[FirmTest] Camera started");
    } catch (error) {
      console.error("[FirmTest] Camera error:", error);
      alert("카메라에 접근할 수 없습니다.");
    }
  };

  // Start screen share
  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "never",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        } as MediaTrackConstraints & { cursor: string },
        audio: false,
      });

      stream.getVideoTracks()[0].addEventListener("ended", () => {
        console.log("[FirmTest] Screen share stopped by user");
        stopSource();
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        await localVideoRef.current.play().catch(() => {});
      }

      setLocalStream(stream);
      setIsCameraActive(true);
      setSourceType("screen");
      console.log("[FirmTest] Screen share started");
    } catch (error) {
      console.error("[FirmTest] Screen share error:", error);
      alert("화면 공유에 접근할 수 없습니다.");
    }
  };

  // Stop source
  const stopSource = () => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
      setIsCameraActive(false);
    }
  };

  // Capture photo and upload to test API
  const capturePhotoToServer = async (photoNumber: number): Promise<TimingResult | null> => {
    const localCanvas = localCanvasRef.current;
    if (!localCanvas) {
      console.error("[FirmTest] No canvas available");
      return null;
    }

    try {
      // Trigger flash
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 300);

      // Capture from canvas
      const targetWidth = RESOLUTION.PHOTO_WIDTH;
      const targetHeight = RESOLUTION.PHOTO_HEIGHT;

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = targetWidth;
      tempCanvas.height = targetHeight;
      const tempCtx = tempCanvas.getContext("2d");

      if (!tempCtx) {
        throw new Error("Could not get canvas context");
      }

      // Use cover mode
      const sourceAspect = localCanvas.width / localCanvas.height;
      const targetAspect = targetWidth / targetHeight;

      let sx = 0, sy = 0, sWidth = localCanvas.width, sHeight = localCanvas.height;

      if (sourceAspect > targetAspect) {
        sWidth = localCanvas.height * targetAspect;
        sx = (localCanvas.width - sWidth) / 2;
      } else {
        sHeight = localCanvas.width / targetAspect;
        sy = (localCanvas.height - sHeight) / 2;
      }

      tempCtx.drawImage(
        localCanvas,
        sx, sy, sWidth, sHeight,
        0, 0, targetWidth, targetHeight
      );

      const photoData = tempCanvas.toDataURL("image/png");

      console.log(`[FirmTest] Captured photo ${photoNumber}, uploading to server...`);

      // Upload to test API
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const response = await fetch(`${API_URL}/api/test/photo-single`, {
        method: "POST",
        headers: getApiHeaders(),
        body: JSON.stringify({
          imageData: photoData,
          photoNumber,
        }),
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const result = await response.json();
      console.log(`[FirmTest] Photo ${photoNumber} uploaded:`, result);

      const timing: TimingResult = {
        testId: result.testId,
        photoNumber,
        saveTimeMs: result.timing.saveTimeMs,
        totalTimeMs: result.timing.totalTimeMs,
        sizeMB: result.fileInfo.estimatedSizeMB,
        url: result.url,
      };

      setPhotoCount(photoNumber);
      setPhotos((prev) => [...prev, `${API_URL}${result.url}`]);
      setPhotoTimings((prev) => [...prev, timing]);

      return timing;
    } catch (error) {
      console.error(`[FirmTest] Failed to upload photo ${photoNumber}:`, error);
      throw error;
    }
  };

  // Start photo session
  const startPhotoSession = () => {
    console.log("[FirmTest] ========== PHOTO SESSION START ==========");
    console.log("[FirmTest] Session settings:");
    console.log("[FirmTest]  - recordingDuration:", recordingDuration, "seconds");
    console.log("[FirmTest]  - captureInterval:", captureInterval, "seconds");
    console.log("[FirmTest]  - totalPhotos:", totalPhotos);

    setIsCapturing(true);
    setPhotoCount(0);
    setPhotos([]);
    setPhotoTimings([]);
    setRecordedSegments([]);
    setCurrentlyRecording(null);

    // Start first photo after a brief delay
    setTimeout(() => {
      takePhoto(1);
    }, 1000);
  };

  const takePhoto = async (photoNumber: number) => {
    if (photoNumber > totalPhotos) {
      setIsCapturing(false);
      console.log("[FirmTest] Photo session complete!");
      return;
    }

    console.log("[FirmTest] ========== Taking photo", photoNumber, "==========");

    // Start video recording for this segment
    if (videoRecorderRef.current) {
      setCurrentlyRecording(photoNumber);

      const recordingStartTime = Date.now();

      try {
        await videoRecorderRef.current.startRecording(
          photoNumber,
          recordingDuration * 1000,
          (blob, completedPhotoNumber) => {
            const recordingEndTime = Date.now();
            const duration = (recordingEndTime - recordingStartTime) / 1000;

            console.log(`[FirmTest] Video segment ${completedPhotoNumber} recorded:`, {
              size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
              duration: `${duration.toFixed(2)}s`,
            });

            const segment: VideoSegment = {
              photoNumber: completedPhotoNumber,
              blob,
              url: URL.createObjectURL(blob),
              startTime: 0,
              endTime: duration,
            };

            setRecordedSegments((prev) => {
              const newSegments = [...prev, segment].sort(
                (a, b) => a.photoNumber - b.photoNumber
              );
              return newSegments;
            });

            setCurrentlyRecording(null);
          }
        );
      } catch (error) {
        console.error("[FirmTest] Failed to start recording:", error);
        setCurrentlyRecording(null);
      }
    }

    // Countdown
    let count = recordingDuration;
    setCountdown(count);

    const interval = setInterval(() => {
      count--;

      if (count <= 0) {
        clearInterval(interval);
        setCountdown(null);
        capturePhoto(photoNumber);
      } else {
        setCountdown(count);
      }
    }, 1000);
  };

  const capturePhoto = async (photoNumber: number) => {
    console.log(`[FirmTest] Capturing photo ${photoNumber}`);

    try {
      await capturePhotoToServer(photoNumber);

      if (photoNumber < totalPhotos) {
        console.log(`[FirmTest] Waiting ${captureInterval} seconds before next photo`);
        setTimeout(() => {
          takePhoto(photoNumber + 1);
        }, captureInterval * 1000);
      } else {
        setIsCapturing(false);
        console.log("[FirmTest] All photos captured!");
      }
    } catch (error) {
      console.error(`[FirmTest] Failed to capture photo ${photoNumber}:`, error);
      alert(`사진 ${photoNumber} 업로드에 실패했습니다.`);
      setIsCapturing(false);
    }
  };

  // Compose video on server (FFmpeg)
  const handleComposeVideo = async () => {
    if (recordedSegments.length < slotCount) {
      alert(`최소 ${slotCount}개의 영상 세그먼트가 필요합니다.`);
      return;
    }

    // Select first slotCount segments
    const selectedSegments = recordedSegments.slice(0, slotCount);

    console.log("[FirmTest] Uploading segments for server composition:", selectedSegments.map((s) => s.photoNumber));

    setIsComposing(true);
    setComposeProgress("영상 세그먼트 업로드 중...");

    try {
      if (!selectedLayout) {
        throw new Error("Layout not found");
      }

      // Map client layout ID to server layout ID
      const layoutIdMap: Record<string, string> = {
        "layout-4-grid": "4cut-grid",
        "4cut-grid": "4cut-grid",
        "layout-1-polaroid": "1cut-polaroid",
        "1cut-polaroid": "1cut-polaroid",
        "layout-4-quoka": "4cut-quoka",
        "4cut-quoka": "4cut-quoka",
      };

      const serverLayoutId = layoutIdMap[selectedFrameLayoutId] || "4cut-grid";

      // Create FormData with all video segments
      const formData = new FormData();

      for (const seg of selectedSegments) {
        const extension = seg.blob.type.includes("mp4") ? "mp4" : "webm";
        formData.append("videos", seg.blob, `segment-${seg.photoNumber}.${extension}`);
      }

      formData.append("layoutId", serverLayoutId);

      const totalInputSize = selectedSegments.reduce((sum, seg) => sum + seg.blob.size, 0);
      console.log("[FirmTest] Uploading to server:", {
        segmentCount: selectedSegments.length,
        layoutId: serverLayoutId,
        totalSizeMB: (totalInputSize / 1024 / 1024).toFixed(2),
      });

      setComposeProgress("서버에서 영상 합성 중...");

      // Call server compose API
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const response = await fetch(`${API_URL}/api/test/video-compose`, {
        method: "POST",
        headers: getApiHeadersMultipart(),
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const result = await response.json();
      console.log("[FirmTest] Server composition complete:", result);

      // Fetch the composed video from server
      setComposeProgress("합성된 영상 다운로드 중...");

      const videoResponse = await fetch(`${API_URL}${result.videoUrl}`);
      if (!videoResponse.ok) {
        throw new Error("Failed to download composed video");
      }

      const composedBlob = await videoResponse.blob();
      const url = URL.createObjectURL(composedBlob);

      if (composedVideo) {
        URL.revokeObjectURL(composedVideo.url);
      }

      setComposedVideo({ blob: composedBlob, url });

      // Update timing result
      setVideoTiming({
        testId: result.testId,
        uploadTimeMs: result.timing.uploadTimeMs,
        composeTimeMs: result.timing.composeTimeMs,
        totalTimeMs: result.timing.totalTimeMs,
        inputSizeMB: result.fileInfo.inputTotalSizeMB,
        outputSizeMB: result.fileInfo.outputSizeMB,
        duration: result.fileInfo.duration,
        url: result.videoUrl,
      });

      console.log("[FirmTest] Video ready:", {
        serverTime: `${result.timing.totalTimeMs}ms`,
        composeTime: `${result.timing.composeTimeMs}ms`,
        outputSize: `${result.fileInfo.outputSizeMB} MB`,
        duration: `${result.fileInfo.duration}s`,
      });

      setComposeProgress("완료!");
    } catch (error) {
      console.error("[FirmTest] Server composition error:", error);
      alert("서버 영상 합성 실패: " + (error instanceof Error ? error.message : ""));
    } finally {
      setIsComposing(false);
      setTimeout(() => setComposeProgress(""), 2000);
    }
  };

  // Reset all
  const handleReset = () => {
    setPhotoCount(0);
    setPhotos([]);
    setPhotoTimings([]);
    setRecordedSegments([]);
    setVideoTiming(null);
    if (composedVideo) {
      URL.revokeObjectURL(composedVideo.url);
      setComposedVideo(null);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSource();
      if (videoRecorderRef.current) {
        videoRecorderRef.current.dispose();
      }
      if (composedVideo) {
        URL.revokeObjectURL(composedVideo.url);
      }
      recordedSegments.forEach((seg) => URL.revokeObjectURL(seg.url));
    };
  }, []);

  // Calculate timing summary
  const avgSaveTime = photoTimings.length > 0
    ? photoTimings.reduce((sum, t) => sum + t.saveTimeMs, 0) / photoTimings.length
    : 0;
  const totalSize = photoTimings.reduce((sum, t) => sum + t.sizeMB, 0);

  return (
    <div className="min-h-screen bg-light text-dark p-8">
      <FlashOverlay show={showFlash} />

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-dark">
                Firm Test Page
              </h1>
              <p className="text-sm text-dark/70 mt-1">
                서버 사진/영상 처리 성능 테스트 (Guest 통신 없음)
              </p>
            </div>
            <div className="bg-secondary px-4 py-2 rounded-lg shadow-md">
              <span className="text-xs opacity-90 text-white">Test ID:</span>
              <span className="text-lg font-bold ml-2 text-white">{testId}</span>
            </div>
          </div>
        </div>

        {/* Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
          {/* Left Column: Video Preview */}
          <div className="space-y-4">
            <div className="bg-white border-2 border-neutral rounded-lg p-4 shadow-md">
              <h2 className="text-lg font-semibold mb-4">미리보기</h2>

              <div className="relative aspect-[2/3] bg-dark rounded-lg overflow-hidden">
                {/* Video source (visually hidden but still renders) */}
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute w-1 h-1 opacity-0 pointer-events-none"
                />

                {/* Chroma key processed canvas */}
                <canvas
                  ref={localCanvasRef}
                  width={RESOLUTION.VIDEO_WIDTH}
                  height={RESOLUTION.VIDEO_HEIGHT}
                  className={`absolute inset-0 w-full h-full object-cover ${
                    flipHorizontal ? "scale-x-[-1]" : ""
                  }`}
                />

                {/* Countdown overlay */}
                {countdown !== null && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <span className="text-8xl font-bold text-white animate-pulse">
                      {countdown}
                    </span>
                  </div>
                )}

                {/* Recording indicator */}
                {currentlyRecording !== null && (
                  <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-500 px-3 py-1 rounded-full">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    <span className="text-white text-sm font-medium">
                      REC #{currentlyRecording}
                    </span>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="mt-4 space-y-3">
                <div className="flex gap-2">
                  {!isCameraActive ? (
                    <>
                      <button
                        onClick={startCamera}
                        className="flex-1 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg font-medium transition"
                      >
                        카메라
                      </button>
                      <button
                        onClick={startScreenShare}
                        className="flex-1 px-4 py-2 bg-secondary hover:bg-secondary-dark text-white rounded-lg font-medium transition"
                      >
                        화면 공유
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={stopSource}
                      className="flex-1 px-4 py-2 bg-neutral hover:bg-neutral-dark text-dark rounded-lg font-medium transition"
                    >
                      중지
                    </button>
                  )}
                </div>

                {isCameraActive && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setChromaKeyEnabled(!chromaKeyEnabled)}
                      className={`flex-1 px-4 py-2 rounded-lg font-medium transition ${
                        chromaKeyEnabled
                          ? "bg-primary text-white"
                          : "bg-neutral text-dark"
                      }`}
                    >
                      크로마키: {chromaKeyEnabled ? "ON" : "OFF"}
                    </button>
                    <button
                      onClick={() => setFlipHorizontal(!flipHorizontal)}
                      className={`flex-1 px-4 py-2 rounded-lg font-medium transition ${
                        flipHorizontal
                          ? "bg-primary text-white"
                          : "bg-neutral text-dark"
                      }`}
                    >
                      반전: {flipHorizontal ? "ON" : "OFF"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Settings & Results */}
          <div className="space-y-6 lg:max-h-[90vh] lg:overflow-y-auto lg:pr-2">
            {/* Chroma Key Settings */}
            {isCameraActive && chromaKeyEnabled && (
              <SettingsPanel title="크로마키 설정">
                <div className="space-y-4">
                  <SegmentedBar
                    label="민감도"
                    value={sensitivity}
                    values={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
                    onChange={setSensitivity}
                    color="primary"
                  />
                  <SegmentedBar
                    label="부드러움"
                    value={smoothness}
                    values={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
                    onChange={setSmoothness}
                    color="primary"
                  />
                </div>
              </SettingsPanel>
            )}

            {/* Capture Settings */}
            {isCameraActive && (
              <SettingsPanel title="촬영 설정">
                <div className="space-y-4">
                  <SegmentedBar
                    label="녹화 시간"
                    value={recordingDuration}
                    values={[5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]}
                    onChange={setRecordingDuration}
                    unit="초"
                    color="primary"
                    disabled={isCapturing}
                  />
                  <SegmentedBar
                    label="촬영 간격"
                    value={captureInterval}
                    values={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
                    onChange={setCaptureInterval}
                    unit="초"
                    color="secondary"
                    disabled={isCapturing}
                  />
                </div>
              </SettingsPanel>
            )}

            {/* Frame Layout Selection */}
            {isCameraActive && (
              <SettingsPanel title="프레임 레이아웃">
                <div className="grid grid-cols-2 gap-3">
                  {FRAME_LAYOUTS.filter((layout) => layout.isActive).map((layout) => {
                    const isSelected = selectedFrameLayoutId === layout.id;
                    return (
                      <button
                        key={layout.id}
                        onClick={() => setSelectedFrameLayoutId(layout.id)}
                        disabled={isCapturing}
                        className={`
                          relative p-3 rounded-lg border-2 transition
                          ${isSelected
                            ? "border-primary bg-primary/10"
                            : "border-neutral hover:border-primary/50"
                          }
                          disabled:opacity-50 disabled:cursor-not-allowed
                        `}
                      >
                        <div className="text-left">
                          <div className={`text-sm font-semibold mb-1 ${isSelected ? "text-primary" : "text-dark"}`}>
                            {layout.label}
                          </div>
                          <div className="text-xs text-dark/60">{layout.description}</div>
                        </div>
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                            <span className="text-white text-xs">v</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </SettingsPanel>
            )}

            {/* Photo Capture */}
            {isCameraActive && (
              <SettingsPanel title="사진 촬영">
                <PhotoCounter current={photoCount} total={totalPhotos} />

                <button
                  onClick={startPhotoSession}
                  disabled={isCapturing}
                  className="w-full mt-4 px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold transition shadow-md disabled:opacity-50"
                >
                  {isCapturing ? "촬영 중..." : `촬영 시작 (${totalPhotos}장)`}
                </button>

                <button
                  onClick={handleReset}
                  disabled={isCapturing}
                  className="w-full mt-2 px-6 py-2 bg-neutral hover:bg-neutral-dark text-dark rounded-lg font-medium transition disabled:opacity-50"
                >
                  초기화
                </button>
              </SettingsPanel>
            )}

            {/* Timing Results */}
            {photoTimings.length > 0 && (
              <SettingsPanel title="사진 처리 시간 결과">
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-primary/10 rounded-lg p-3">
                      <div className="text-2xl font-bold text-primary">{photoTimings.length}</div>
                      <div className="text-xs text-dark/70">장 업로드</div>
                    </div>
                    <div className="bg-secondary/10 rounded-lg p-3">
                      <div className="text-2xl font-bold text-secondary">{avgSaveTime.toFixed(0)}</div>
                      <div className="text-xs text-dark/70">평균 ms</div>
                    </div>
                    <div className="bg-neutral rounded-lg p-3">
                      <div className="text-2xl font-bold text-dark">{totalSize.toFixed(1)}</div>
                      <div className="text-xs text-dark/70">총 MB</div>
                    </div>
                  </div>

                  <div className="max-h-40 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-neutral/50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1 text-left">#</th>
                          <th className="px-2 py-1 text-right">저장(ms)</th>
                          <th className="px-2 py-1 text-right">전체(ms)</th>
                          <th className="px-2 py-1 text-right">크기(MB)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {photoTimings.map((t) => (
                          <tr key={t.photoNumber} className="border-b border-neutral/30">
                            <td className="px-2 py-1">{t.photoNumber}</td>
                            <td className="px-2 py-1 text-right font-mono">{t.saveTimeMs}</td>
                            <td className="px-2 py-1 text-right font-mono">{t.totalTimeMs}</td>
                            <td className="px-2 py-1 text-right font-mono">{t.sizeMB.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </SettingsPanel>
            )}

            {/* Captured Photos Preview */}
            {photos.length > 0 && (
              <SettingsPanel title="촬영된 사진">
                <div className="grid grid-cols-4 gap-2">
                  {photos.map((url, index) => (
                    <div key={index} className="aspect-[2/3] bg-neutral rounded-lg overflow-hidden">
                      <img
                        src={url}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </SettingsPanel>
            )}

            {/* Video Composition (Server-side FFmpeg) */}
            {recordedSegments.length >= slotCount && (
              <SettingsPanel title="서버 영상 합성">
                <div className="space-y-4">
                  <p className="text-sm text-dark/70">
                    녹화된 {recordedSegments.length}개 세그먼트 중 {slotCount}개를 서버에서 FFmpeg로 합성합니다.
                  </p>

                  {isComposing && (
                    <div className="bg-neutral/30 rounded-lg p-4 flex items-center gap-3">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                      <span className="text-sm">{composeProgress}</span>
                    </div>
                  )}

                  <button
                    onClick={handleComposeVideo}
                    disabled={isComposing}
                    className="w-full px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold transition disabled:opacity-50"
                  >
                    {isComposing ? "서버 합성 중..." : "서버 영상 합성 시작"}
                  </button>

                  {composedVideo && (
                    <div className="space-y-4">
                      <div className="bg-dark rounded-lg overflow-hidden">
                        <video
                          src={composedVideo.url}
                          controls
                          className="w-full aspect-[2/3]"
                        />
                      </div>
                      <button
                        onClick={() => {
                          const ext = composedVideo.blob.type.includes("mp4") ? "mp4" : "webm";
                          const link = document.createElement("a");
                          link.href = composedVideo.url;
                          link.download = `firm-test-${testId}.${ext}`;
                          link.click();
                        }}
                        className="w-full px-4 py-2 bg-secondary hover:bg-secondary-dark text-white rounded-lg font-medium transition"
                      >
                        다운로드
                      </button>

                      <div className="text-sm text-dark/70 text-center">
                        크기: {(composedVideo.blob.size / 1024 / 1024).toFixed(2)} MB
                        | 타입: {composedVideo.blob.type}
                      </div>
                    </div>
                  )}
                </div>
              </SettingsPanel>
            )}

            {/* Server Composition Timing Result */}
            {videoTiming && (
              <SettingsPanel title="서버 합성 결과">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="bg-primary/10 rounded-lg p-3">
                      <div className="text-xl font-bold text-primary">{videoTiming.uploadTimeMs}</div>
                      <div className="text-xs text-dark/70">업로드(ms)</div>
                    </div>
                    <div className="bg-secondary/10 rounded-lg p-3">
                      <div className="text-xl font-bold text-secondary">{videoTiming.composeTimeMs}</div>
                      <div className="text-xs text-dark/70">합성(ms)</div>
                    </div>
                    <div className="bg-neutral rounded-lg p-3">
                      <div className="text-xl font-bold text-dark">{videoTiming.totalTimeMs}</div>
                      <div className="text-xs text-dark/70">총 시간(ms)</div>
                    </div>
                    <div className="bg-neutral rounded-lg p-3">
                      <div className="text-xl font-bold text-dark">{videoTiming.duration.toFixed(1)}s</div>
                      <div className="text-xs text-dark/70">영상 길이</div>
                    </div>
                  </div>

                  <div className="bg-neutral/30 rounded-lg p-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-dark/70">입력 크기:</span>
                      <span className="font-mono">{videoTiming.inputSizeMB.toFixed(2)} MB</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-dark/70">출력 크기:</span>
                      <span className="font-mono">{videoTiming.outputSizeMB.toFixed(2)} MB</span>
                    </div>
                  </div>
                </div>
              </SettingsPanel>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
