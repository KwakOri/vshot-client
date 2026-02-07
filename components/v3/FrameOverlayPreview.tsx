'use client';

import { useEffect, useRef } from 'react';
import { FrameLayout } from '@/types';
import { useFrameOverlay } from '@/hooks/v3/useFrameOverlay';

interface FrameOverlayPreviewProps {
  canvas: HTMLCanvasElement | null;
  layout: FrameLayout | null;
  enabled: boolean;
  opacity?: number;
  className?: string;
}

/**
 * Frame Overlay Preview Component
 *
 * Renders frame overlay on top of composite canvas during capture countdown
 * Helps users align their shot with the final frame layout
 */
export function FrameOverlayPreview({
  canvas,
  layout,
  enabled,
  opacity = 0.3,
  className = '',
}: FrameOverlayPreviewProps) {
  const { isReady, error } = useFrameOverlay({
    canvas,
    layout,
    enabled,
    opacity,
    updateInterval: 100, // 10fps for overlay
  });

  // Show loading/error states if needed
  if (enabled && !isReady && !error) {
    return (
      <div className={`frame-overlay-loading ${className}`}>
        <p className="text-sm text-[#1B1612]/50">프레임 로딩 중...</p>
      </div>
    );
  }

  if (error) {
    console.error('[FrameOverlayPreview] Error:', error);
  }

  // This component doesn't render anything visible - it manages canvas overlay
  return null;
}

/**
 * Countdown Overlay Component
 *
 * Shows countdown numbers with frame preview
 */
interface CountdownOverlayProps {
  countdown: number | null;
  frameLayout: FrameLayout | null;
  className?: string;
}

export function CountdownOverlay({
  countdown,
  frameLayout,
  className = '',
}: CountdownOverlayProps) {
  if (countdown === null || countdown === 0) return null;

  return (
    <div
      className={`
        fixed inset-0 z-50
        flex items-center justify-center
        bg-black/30
        ${className}
      `}
    >
      <div
        className="text-[10rem] font-bold text-white"
        style={{
          textShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
        }}
      >
        {countdown}
      </div>
    </div>
  );
}
