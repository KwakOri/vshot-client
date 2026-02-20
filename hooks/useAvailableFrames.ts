'use client';

import { useEffect, useState } from 'react';
import { FrameLayout } from '@/types';
import { getActiveLayouts, dbFrameToLayout } from '@/constants/frame-layouts';
import { getAvailableFrames } from '@/lib/frames-api';
import type { Frame } from '@/types/frames';

/**
 * DB 프레임을 fetch하고 하드코딩 프레임과 merge하는 훅
 * - 하드코딩 프레임을 초기값으로 즉시 렌더링 (깜빡임 방지)
 * - DB 프레임 로드 후 merge (DB 우선, 하드코딩 fallback)
 * - API 실패 시 하드코딩 프레임만 조용히 사용
 */
export function useAvailableFrames() {
  const [layouts, setLayouts] = useState<FrameLayout[]>(() => getActiveLayouts());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchFrames() {
      try {
        const dbFrames: Frame[] = await getAvailableFrames();
        if (cancelled) return;

        if (dbFrames.length > 0) {
          const dbLayouts = dbFrames
            .filter((f) => f.isActive)
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
            .map((f) => dbFrameToLayout(f));

          // DB 프레임 우선, 하드코딩에만 있는 프레임은 fallback으로 추가
          const dbIds = new Set(dbLayouts.map((l) => l.id));
          const hardcodedFallbacks = getActiveLayouts().filter((l) => !dbIds.has(l.id));
          setLayouts([...dbLayouts, ...hardcodedFallbacks]);
        }
        // DB에 프레임이 없으면 하드코딩 유지
      } catch {
        // API 실패 시 하드코딩 프레임만 조용히 사용
        console.warn('[useAvailableFrames] DB 프레임 로드 실패, 하드코딩 프레임 사용');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchFrames();
    return () => { cancelled = true; };
  }, []);

  return { layouts, isLoading };
}
