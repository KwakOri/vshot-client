'use client';

import { useState } from 'react';
import { FrameLayout } from '@/types';
import Image from 'next/image';

interface FrameSelectorProps {
  layouts: FrameLayout[];
  selectedLayoutId: string | null;
  onSelect: (layout: FrameLayout) => void;
  className?: string;
  variant?: 'light' | 'dark';
}

export function FrameSelector({
  layouts,
  selectedLayoutId,
  onSelect,
  className = '',
  variant = 'light',
}: FrameSelectorProps) {
  const isDark = variant === 'dark';
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className={`${className}`}>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
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
              style={{ backgroundColor: isDark ? '#2a2320' : '#F3E9E7' }}
            >
              {/* Thumbnail */}
              <div className="relative w-full h-full">
                <Image
                  src={layout.thumbnailSrc}
                  alt={layout.label}
                  fill
                  className="object-cover"
                  unoptimized={layout.thumbnailSrc.startsWith('http')}
                />

                {/* Selected overlay */}
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

              {/* Label */}
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

      {/* Selected frame info */}
      {selectedLayoutId && (
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
                    <p className={`text-xs mt-0.5 ${isDark ? 'text-white/40' : 'text-dark/50'}`}>{selected.description}</p>
                  )}
                </div>
                <span className={`text-[10px] font-mono ${isDark ? 'text-white/20' : 'text-dark/30'}`}>
                  {selected.canvasWidth}x{selected.canvasHeight}
                </span>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
