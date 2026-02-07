'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { FrameLayout } from '@/types';
import {
  drawFrameOverlay,
  preloadFrameImage,
  clearFrameCache,
} from '@/lib/v3/frame-overlay';

interface UseFrameOverlayOptions {
  canvas: HTMLCanvasElement | null;
  layout: FrameLayout | null;
  enabled: boolean;
  opacity?: number;
  updateInterval?: number; // ms, default 100 (10fps for overlay)
}

/**
 * Hook to manage frame overlay rendering on canvas
 *
 * Automatically renders frame overlay when enabled
 * Uses requestAnimationFrame for smooth rendering
 */
export function useFrameOverlay({
  canvas,
  layout,
  enabled,
  opacity = 0.3,
  updateInterval = 100,
}: UseFrameOverlayOptions) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);

  // Preload frame image when layout changes
  useEffect(() => {
    if (!layout) {
      setIsReady(false);
      return;
    }

    setIsReady(false);
    setError(null);

    preloadFrameImage(layout.frameSrc)
      .then(() => {
        setIsReady(true);
      })
      .catch((err) => {
        console.error('[useFrameOverlay] Failed to preload frame:', err);
        setError(err);
      });
  }, [layout]);

  // Render overlay
  const renderOverlay = useCallback(() => {
    if (!canvas || !layout || !enabled || !isReady) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('[useFrameOverlay] Failed to get canvas context');
      return;
    }

    try {
      drawFrameOverlay(ctx, layout, opacity);
    } catch (err) {
      console.error('[useFrameOverlay] Failed to draw overlay:', err);
      setError(err as Error);
    }
  }, [canvas, layout, enabled, isReady, opacity]);

  // Animation loop
  useEffect(() => {
    if (!enabled || !isReady || !canvas || !layout) {
      // Cancel any existing animation
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const animate = (timestamp: number) => {
      // Throttle updates to updateInterval
      if (timestamp - lastUpdateRef.current >= updateInterval) {
        renderOverlay();
        lastUpdateRef.current = timestamp;
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [enabled, isReady, canvas, layout, updateInterval, renderOverlay]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearFrameCache();
    };
  }, []);

  return {
    isReady,
    error,
    renderOverlay, // Manual render function if needed
  };
}
