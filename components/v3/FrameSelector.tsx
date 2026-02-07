'use client';

import { useState } from 'react';
import { FrameLayout } from '@/types';
import Image from 'next/image';

interface FrameSelectorProps {
  layouts: FrameLayout[];
  selectedLayoutId: string | null;
  onSelect: (layout: FrameLayout) => void;
  className?: string;
}

/**
 * Frame Selector Component for V3
 *
 * Allows users to select frame layout before capture
 */
export function FrameSelector({
  layouts,
  selectedLayoutId,
  onSelect,
  className = '',
}: FrameSelectorProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className={`frame-selector ${className}`}>
      <h3 className="text-lg font-semibold mb-4" style={{ color: '#1B1612' }}>
        프레임 선택
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
                relative aspect-video rounded-lg overflow-hidden
                transition-all duration-200
                ${isSelected ? 'ring-4 ring-[#FC712B] scale-105' : 'ring-2 ring-[#E2D4C4]'}
                ${isHovered && !isSelected ? 'ring-[#FD9319] scale-102' : ''}
                hover:shadow-lg
              `}
              style={{
                backgroundColor: '#F3E9E7',
              }}
            >
              {/* Thumbnail */}
              <div className="relative w-full h-full">
                <Image
                  src={layout.thumbnailSrc}
                  alt={layout.label}
                  fill
                  className="object-cover"
                />

                {/* Overlay */}
                {isSelected && (
                  <div
                    className="absolute inset-0 bg-[#FC712B] bg-opacity-10
                               flex items-center justify-center"
                  >
                    <div
                      className="bg-[#FC712B] text-white px-3 py-1 rounded-full
                                 text-sm font-semibold"
                    >
                      선택됨
                    </div>
                  </div>
                )}
              </div>

              {/* Label */}
              <div
                className="absolute bottom-0 left-0 right-0
                           bg-gradient-to-t from-black/70 to-transparent
                           p-2"
              >
                <p className="text-white text-sm font-medium text-center">
                  {layout.label}
                </p>
                <p className="text-white/70 text-xs text-center">
                  {layout.slotCount}장
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected frame info */}
      {selectedLayoutId && (
        <div className="mt-4 p-4 rounded-lg bg-[#F3E9E7] border border-[#E2D4C4]">
          {(() => {
            const selected = layouts.find((l) => l.id === selectedLayoutId);
            if (!selected) return null;

            return (
              <div>
                <p className="text-sm font-semibold text-[#1B1612] mb-1">
                  선택한 프레임: {selected.label}
                </p>
                {selected.description && (
                  <p className="text-xs text-[#1B1612]/70">{selected.description}</p>
                )}
                <p className="text-xs text-[#1B1612]/50 mt-2">
                  {selected.canvasWidth} × {selected.canvasHeight}px
                </p>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
