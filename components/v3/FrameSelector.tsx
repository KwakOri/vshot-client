'use client';

import { useState } from 'react';
import { FrameLayout } from '@/types';
import Image from 'next/image';

interface FrameSelectorProps {
  layouts: FrameLayout[];
  selectedLayoutId: string | null;
  onSelect: (layout: FrameLayout) => void;
  onDeselect?: () => void;
  className?: string;
  variant?: 'light' | 'dark';
}

const NONE_ID = '';

export function FrameSelector({
  layouts,
  selectedLayoutId,
  onSelect,
  onDeselect,
  className = '',
  variant = 'light',
}: FrameSelectorProps) {
  const isDark = variant === 'dark';
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const isNoneSelected = selectedLayoutId === NONE_ID || selectedLayoutId === null;
  const isNoneHovered = hoveredId === '__none__';

  const strokeColor = isDark ? '#E2D4C4' : '#1B1612';
  const cardBg = isDark ? '#2a2320' : '#F3E9E7';

  return (
    <div className={`${className}`}>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">

        {/* ── 선택 없음 카드 ── */}
        <button
          onClick={onDeselect}
          onMouseEnter={() => setHoveredId('__none__')}
          onMouseLeave={() => setHoveredId(null)}
          className={`
            relative aspect-[2/3] rounded-xl overflow-hidden
            transition-all duration-200 touch-manipulation
            ${isNoneSelected
              ? 'ring-[3px] ring-primary scale-[1.02] shadow-lg shadow-primary/15'
              : 'ring-1 hover:shadow-md'
            }
          `}
          style={{
            backgroundColor: cardBg,
            borderColor: isNoneSelected ? undefined : isDark ? 'rgba(226,212,196,0.2)' : 'rgba(27,22,18,0.15)',
          }}
        >
          {/* 대각선 사선 배경 패턴 */}
          <svg
            className="absolute inset-0 w-full h-full"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none"
          >
            <defs>
              <pattern
                id={`diag-${variant}`}
                x="0" y="0"
                width="10" height="10"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <line
                  x1="0" y1="0" x2="0" y2="10"
                  stroke={strokeColor}
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#diag-${variant})`} opacity="0.06" />
          </svg>

          {/* 중앙 아이콘 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div
              className={`transition-transform duration-200 ${isNoneHovered && !isNoneSelected ? 'scale-110' : ''}`}
            >
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* 프레임 아웃라인 (2:3 비율 점선 사각형) */}
                <rect
                  x="9" y="4"
                  width="30" height="40"
                  rx="3"
                  stroke={strokeColor}
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  opacity="0.35"
                />
                {/* 좌상→우하 사선 */}
                <line
                  x1="9" y1="4"
                  x2="39" y2="44"
                  stroke="#FC712B"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  opacity={isNoneSelected ? 0.9 : 0.5}
                />
                {/* 우상→좌하 사선 */}
                <line
                  x1="39" y1="4"
                  x2="9" y2="44"
                  stroke="#FC712B"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  opacity={isNoneSelected ? 0.9 : 0.5}
                />
              </svg>
            </div>
          </div>

          {/* 선택됨 오버레이 */}
          {isNoneSelected && (
            <div className="absolute inset-0 bg-primary/5 flex items-end justify-center pb-10">
              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-md">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </div>
          )}

          {/* 라벨 */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-dark/70 to-transparent p-2 pt-6">
            <p className="text-white text-xs font-display font-semibold text-center">
              선택 없음
            </p>
            <p className="text-white/50 text-[10px] text-center">
              프레임 없이 촬영
            </p>
          </div>
        </button>

        {/* ── 일반 레이아웃 카드들 ── */}
        {layouts.map((layout) => {
          const isSelected = layout.id === selectedLayoutId;
          const isHovered = layout.id === hoveredId;

          return (
            <button
              key={layout.id}
              onClick={() => onSelect(layout)}
              onMouseEnter={() => setHoveredId(layout.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={`
                relative aspect-[2/3] rounded-xl overflow-hidden
                transition-all duration-200 touch-manipulation
                ${isSelected
                  ? 'ring-[3px] ring-primary scale-[1.02] shadow-lg shadow-primary/15'
                  : 'ring-1.5 ring-neutral/60 hover:ring-secondary hover:shadow-md'
                }
              `}
              style={{ backgroundColor: cardBg }}
            >
              {/* 썸네일 */}
              <div className="relative w-full h-full">
                <Image
                  src={layout.thumbnailSrc}
                  alt={layout.label}
                  fill
                  className="object-cover"
                  unoptimized={layout.thumbnailSrc.startsWith('http')}
                />

                {/* 선택됨 오버레이 */}
                {isSelected && (
                  <div className="absolute inset-0 bg-primary/5 flex items-center justify-center">
                    <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-md">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  </div>
                )}
              </div>

              {/* 라벨 */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-dark/70 to-transparent p-2 pt-6">
                <p className="text-white text-xs font-display font-semibold text-center">
                  {layout.label}
                </p>
                <p className="text-white/50 text-[10px] text-center">
                  {layout.slotCount}장
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* 선택된 프레임 정보 */}
      {isNoneSelected ? (
        <div className={`mt-3 p-3 rounded-xl border ${isDark ? 'bg-white/[0.04] border-white/[0.08]' : 'bg-light/60 border-neutral/30'}`}>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-primary/50" />
            <p className={`text-sm font-display font-semibold ${isDark ? 'text-white' : 'text-dark'}`}>
              선택 없음
            </p>
          </div>
          <p className={`text-xs mt-0.5 ${isDark ? 'text-white/40' : 'text-dark/50'}`}>
            프레임 오버레이 없이 원본 영상을 그대로 합성합니다
          </p>
        </div>
      ) : selectedLayoutId ? (
        <div className={`mt-3 p-3 rounded-xl border ${isDark ? 'bg-white/[0.04] border-white/[0.08]' : 'bg-light/60 border-neutral/30'}`}>
          {(() => {
            const selected = layouts.find((l) => l.id === selectedLayoutId);
            if (!selected) return null;

            return (
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm font-display font-semibold ${isDark ? 'text-white' : 'text-dark'}`}>
                    {selected.label}
                  </p>
                  {selected.description && (
                    <p className={`text-xs mt-0.5 ${isDark ? 'text-white/40' : 'text-dark/50'}`}>
                      {selected.description}
                    </p>
                  )}
                </div>
                <span className={`text-[10px] font-mono ${isDark ? 'text-white/20' : 'text-dark/30'}`}>
                  {selected.canvasWidth}x{selected.canvasHeight}
                </span>
              </div>
            );
          })()}
        </div>
      ) : null}
    </div>
  );
}
