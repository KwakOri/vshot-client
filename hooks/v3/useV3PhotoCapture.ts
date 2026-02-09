'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { SignalMessage } from '@/types';

interface ChromaKeySettings {
  enabled: boolean;
  color: string;
  sensitivity: number;
  smoothness: number;
}

interface UseV3PhotoCaptureOptions {
  roomId: string;
  userId: string;
  role: 'host' | 'guest';
  backgroundVideo: HTMLVideoElement | null;
  foregroundVideo: HTMLVideoElement | null;
  chromaKeySettings: ChromaKeySettings;
  guestFlip: boolean;
  hostFlip: boolean;
  sendSignal: (message: SignalMessage) => void;
  onCaptureComplete?: (photoUrl: string) => void;
  onMergeComplete?: (mergedPhotoUrl: string) => void;
  onSessionComplete?: (sessionId: string, frameResultUrl: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook for single-shot photo capture in V3
 *
 * Flow (Server-coordinated):
 * 1. Host triggers start-capture-v3
 * 2. Server broadcasts countdown-tick-v3 (3, 2, 1)
 * 3. Server broadcasts capture-now-v3
 * 4. Both clients capture and upload
 * 5. Server merges and broadcasts photos-merged-v3
 * 6. Server broadcasts session-complete-v3
 */
export function useV3PhotoCapture({
  roomId,
  userId,
  role,
  backgroundVideo,
  foregroundVideo,
  chromaKeySettings,
  guestFlip,
  hostFlip,
  sendSignal,
  onCaptureComplete,
  onMergeComplete,
  onSessionComplete,
  onError,
}: UseV3PhotoCaptureOptions) {
  const [isCapturing, setIsCapturing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [mergedPhotoUrl, setMergedPhotoUrl] = useState<string | null>(null);

  // Abort controller for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);
  const isCapturingRef = useRef(false);

  /**
   * Start capture (Host only) - sends signal to server
   * Server will coordinate the countdown for both clients
   */
  const startCapture = useCallback(() => {
    if (role !== 'host') {
      console.warn('[V3PhotoCapture] Only host can start capture');
      return;
    }

    if (!backgroundVideo) {
      const error = new Error('Background video not ready');
      console.error('[V3PhotoCapture]', error);
      onError?.(error);
      return;
    }

    if (isCapturingRef.current) {
      console.warn('[V3PhotoCapture] Capture already in progress');
      return;
    }

    // Reset state
    setIsCapturing(true);
    isCapturingRef.current = true;
    setCapturedPhotoUrl(null);
    setMergedPhotoUrl(null);
    setUploadProgress(0);
    abortControllerRef.current = new AbortController();

    // Notify server to start capture countdown
    // Server will broadcast countdown-tick-v3 to both Host and Guest
    sendSignal({
      type: 'start-capture-v3',
      roomId,
    });

    console.log('[V3PhotoCapture] Capture started, waiting for server countdown');
  }, [role, backgroundVideo, roomId, sendSignal, onError]);

  /**
   * Handle countdown tick from server
   */
  const handleCountdownTick = useCallback(
    (message: Extract<SignalMessage, { type: 'countdown-tick-v3' }>) => {
      if (message.roomId !== roomId) return;

      setCountdown(message.count);
      setIsCapturing(true);
      isCapturingRef.current = true;

      console.log(`[V3PhotoCapture] Countdown: ${message.count}`);
    },
    [roomId]
  );

  /**
   * Handle capture-now from server - actually capture the photo
   */
  const handleCaptureNow = useCallback(
    async (message: Extract<SignalMessage, { type: 'capture-now-v3' }>) => {
      if (message.roomId !== roomId) return;

      if (!backgroundVideo) {
        console.error('[V3PhotoCapture] Background video not ready for capture');
        onError?.(new Error('Background video not ready'));
        return;
      }

      // Check if cancelled
      if (abortControllerRef.current?.signal.aborted) {
        console.log('[V3PhotoCapture] Capture was cancelled');
        return;
      }

      try {
        setCountdown(0);
        console.log('[V3PhotoCapture] Capturing high-res now!');

        // Brief flash effect delay
        await sleep(100);

        // High-resolution capture (local camera only)
        const photoBlob = await captureHighRes(
          role,
          backgroundVideo,
          foregroundVideo,
          chromaKeySettings,
          guestFlip,
          hostFlip,
        );

        // Convert to base64
        const photoBase64 = await blobToBase64(photoBlob);

        // Upload to server
        setUploadProgress(10);
        const photoUrl = await uploadPhoto(roomId, userId, role, photoBase64);

        setUploadProgress(100);
        setCapturedPhotoUrl(photoUrl);

        // Notify server that upload is complete
        sendSignal({
          type: 'photo-uploaded-v3',
          roomId,
          userId,
          role,
          photoUrl,
        });

        console.log(`[V3PhotoCapture] Photo captured and uploaded: ${photoUrl}`);
        onCaptureComplete?.(photoUrl);
      } catch (error) {
        console.error('[V3PhotoCapture] Capture failed:', error);
        onError?.(error as Error);
        setIsCapturing(false);
        isCapturingRef.current = false;
        setCountdown(null);
      }
    },
    [roomId, backgroundVideo, foregroundVideo, chromaKeySettings, guestFlip, hostFlip, userId, role, sendSignal, onCaptureComplete, onError]
  );

  /**
   * Handle photos merged notification from server
   */
  const handlePhotosMerged = useCallback(
    (message: Extract<SignalMessage, { type: 'photos-merged-v3' }>) => {
      if (message.roomId !== roomId) return;

      console.log(`[V3PhotoCapture] Photos merged: ${message.mergedPhotoUrl}`);
      setMergedPhotoUrl(message.mergedPhotoUrl);
      onMergeComplete?.(message.mergedPhotoUrl);
    },
    [roomId, onMergeComplete]
  );

  /**
   * Handle session complete notification from server
   */
  const handleSessionComplete = useCallback(
    (message: Extract<SignalMessage, { type: 'session-complete-v3' }>) => {
      if (message.roomId !== roomId) return;

      console.log(`[V3PhotoCapture] Session complete: ${message.sessionId}`);

      // Reset capture state
      setIsCapturing(false);
      isCapturingRef.current = false;
      setCountdown(null);

      onSessionComplete?.(message.sessionId, message.frameResultUrl);
    },
    [roomId, onSessionComplete]
  );

  /**
   * Register signal handlers - call this from parent component
   */
  const handleSignalMessage = useCallback(
    (message: SignalMessage) => {
      switch (message.type) {
        case 'countdown-tick-v3':
          handleCountdownTick(message);
          break;
        case 'capture-now-v3':
          handleCaptureNow(message);
          break;
        case 'photos-merged-v3':
          handlePhotosMerged(message);
          break;
        case 'session-complete-v3':
          handleSessionComplete(message);
          break;
      }
    },
    [handleCountdownTick, handleCaptureNow, handlePhotosMerged, handleSessionComplete]
  );

  /**
   * Cancel capture
   */
  const cancelCapture = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setIsCapturing(false);
    isCapturingRef.current = false;
    setCountdown(null);
    setUploadProgress(0);

    console.log('[V3PhotoCapture] Capture cancelled');
  }, []);

  /**
   * Reset state for next capture
   */
  const reset = useCallback(() => {
    cancelCapture();
    setCapturedPhotoUrl(null);
    setMergedPhotoUrl(null);
  }, [cancelCapture]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    // State
    isCapturing,
    countdown,
    uploadProgress,
    capturedPhotoUrl,
    mergedPhotoUrl,

    // Actions
    startCapture, // Host only
    cancelCapture,
    reset,

    // Signal handler - register this in useSignaling
    handleSignalMessage,
  };
}

/**
 * Parse hex color string to RGB values (0-255)
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return { r, g, b };
}

/**
 * Draw video onto canvas with object-cover behavior and optional flip
 */
function drawWithCover(
  ctx: OffscreenCanvasRenderingContext2D,
  video: HTMLVideoElement,
  canvasW: number,
  canvasH: number,
  flip: boolean,
) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const videoAspect = vw / vh;
  const canvasAspect = canvasW / canvasH;

  let drawW: number;
  let drawH: number;
  let ox: number;
  let oy: number;

  if (videoAspect > canvasAspect) {
    drawH = canvasH;
    drawW = canvasH * videoAspect;
    ox = (canvasW - drawW) / 2;
    oy = 0;
  } else {
    drawW = canvasW;
    drawH = canvasW / videoAspect;
    ox = 0;
    oy = (canvasH - drawH) / 2;
  }

  if (flip) {
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -ox - drawW, oy, drawW, drawH);
    ctx.restore();
  } else {
    ctx.drawImage(video, ox, oy, drawW, drawH);
  }
}

/**
 * Apply chroma key to a video frame on an offscreen canvas (one-shot)
 */
function applyChromaKeyOneShot(
  video: HTMLVideoElement,
  width: number,
  height: number,
  chromaKey: ChromaKeySettings,
  flip: boolean,
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;

  // Draw video with cover + flip
  drawWithCover(ctx, video, width, height, flip);

  if (chromaKey.enabled) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const keyColorRgb = hexToRgb(chromaKey.color);

    const threshold = chromaKey.sensitivity * 2;
    const smoothing = chromaKey.smoothness * 0.5;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const distance =
        Math.abs(r - keyColorRgb.r) +
        Math.abs(g - keyColorRgb.g) +
        Math.abs(b - keyColorRgb.b);

      if (distance < threshold) {
        if (distance < threshold - smoothing) {
          data[i + 3] = 0;
        } else {
          const alpha = ((distance - (threshold - smoothing)) / smoothing) * 255;
          data[i + 3] = Math.max(0, Math.min(255, alpha));
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  return canvas;
}

/**
 * High-resolution capture: captures only the LOCAL camera at native resolution.
 *
 * - Guest: captures backgroundVideo (local camera) as opaque PNG
 * - Host: captures foregroundVideo (local camera) with chroma key → alpha PNG
 *
 * Server merges guest (background) + host (alpha foreground) once.
 */
async function captureHighRes(
  role: 'host' | 'guest',
  backgroundVideo: HTMLVideoElement,
  foregroundVideo: HTMLVideoElement | null,
  chromaKey: ChromaKeySettings,
  guestFlip: boolean,
  hostFlip: boolean,
): Promise<Blob> {
  const localVideo = role === 'guest' ? backgroundVideo : foregroundVideo;
  const flip = role === 'guest' ? guestFlip : hostFlip;

  if (!localVideo || localVideo.videoWidth === 0 || localVideo.videoHeight === 0) {
    throw new Error(`Local video not ready for ${role}`);
  }

  const vw = localVideo.videoWidth;
  const vh = localVideo.videoHeight;

  // Calculate 2:3 max size from native resolution
  const targetRatio = 2 / 3;
  let captureW: number;
  let captureH: number;

  if (vw / vh <= targetRatio) {
    captureW = vw;
    captureH = Math.floor(vw / targetRatio);
  } else {
    captureH = vh;
    captureW = Math.floor(vh * targetRatio);
  }

  // Ensure even dimensions
  captureW = captureW % 2 === 0 ? captureW : captureW - 1;
  captureH = captureH % 2 === 0 ? captureH : captureH - 1;

  console.log(`[V3PhotoCapture] ${role} high-res capture: video=${vw}x${vh} → capture=${captureW}x${captureH}`);

  if (role === 'host') {
    // Host: apply chroma key to produce alpha PNG
    const canvas = applyChromaKeyOneShot(localVideo, captureW, captureH, chromaKey, flip);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    console.log(`[V3PhotoCapture] Host captured alpha PNG: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
    return blob;
  }

  // Guest: plain opaque capture
  const canvas = new OffscreenCanvas(captureW, captureH);
  const ctx = canvas.getContext('2d')!;
  drawWithCover(ctx, localVideo, captureW, captureH, flip);

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  console.log(`[V3PhotoCapture] Guest captured PNG: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
  return blob;
}

/**
 * Convert blob to base64
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Upload photo to server
 */
async function uploadPhoto(
  roomId: string,
  userId: string,
  role: 'host' | 'guest',
  imageData: string
): Promise<string> {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const API_KEY = process.env.NEXT_PUBLIC_API_KEY;

  const response = await fetch(`${API_URL}/api/photo-v3/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY || '',
    },
    body: JSON.stringify({
      roomId,
      userId,
      role,
      imageData,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Upload failed: ${response.status} ${response.statusText} - ${errorData.error || 'Unknown error'}`
    );
  }

  const data = await response.json();
  return data.url;
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
