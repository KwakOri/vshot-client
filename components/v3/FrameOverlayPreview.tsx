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
    updateInterval: 100,
  });

  if (enabled && !isReady && !error) {
    return (
      <div className={`frame-overlay-loading ${className}`}>
        <p className="text-sm text-dark/50">프레임 로딩 중...</p>
      </div>
    );
  }

  if (error) {
    console.error('[FrameOverlayPreview] Error:', error);
  }

  return null;
}

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
        ${className}
      `}
      style={{
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.2) 100%)',
      }}
    >
      {/* Outer ring */}
      <div className="absolute w-48 h-48 rounded-full border-2 border-white/10 animate-pulse-ring" />

      {/* Countdown number */}
      <div className="animate-countdown-pop" key={countdown}>
        <span
          className="font-display text-[10rem] font-black text-white leading-none select-none"
          style={{
            textShadow: '0 0 40px rgba(252, 113, 43, 0.4), 0 4px 20px rgba(0, 0, 0, 0.5)',
            WebkitTextStroke: '2px rgba(255, 255, 255, 0.1)',
          }}
        >
          {countdown}
        </span>
      </div>
    </div>
  );
}
