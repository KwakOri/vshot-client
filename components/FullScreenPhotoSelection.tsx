'use client';

import { memo, useState, useCallback } from 'react';
import { FrameLayout } from '@/types';
import { FramePreview } from './FramePreview';
import { PhotoCarousel } from './PhotoCarousel';
import { PhotoGrid } from './PhotoGrid';

interface FullScreenPhotoSelectionProps {
  photos: string[];
  selectedPhotos: number[];
  onPhotoSelect: (index: number) => void;
  onComplete: () => void;
  frameLayout: FrameLayout;
  maxSelection: number;
  role: 'host' | 'guest';
  readOnly?: boolean;
  peerSelectedPhotos?: number[];
  isGenerating?: boolean;
}

/**
 * Full-screen photo selection UI that replaces video during selection phase.
 * Switches between desktop and mobile layouts based on breakpoint.
 *
 * Desktop (lg+):
 * - Frame preview on left (large)
 * - Photo grid on right with selection counter and button
 *
 * Mobile:
 * - Frame preview thumbnail at top
 * - Photo carousel in middle
 * - Selection counter and button at bottom
 */
export const FullScreenPhotoSelection = memo(function FullScreenPhotoSelection({
  photos,
  selectedPhotos,
  onPhotoSelect,
  onComplete,
  frameLayout,
  maxSelection,
  role,
  readOnly = false,
  peerSelectedPhotos = [],
  isGenerating = false,
}: FullScreenPhotoSelectionProps) {
  // For mobile carousel navigation
  const [currentCarouselIndex, setCurrentCarouselIndex] = useState(0);

  const displaySelections = readOnly ? peerSelectedPhotos : selectedPhotos;
  const selectionCount = displaySelections.length;
  const isSelectionComplete = selectionCount === maxSelection;

  const handleComplete = useCallback(() => {
    if (isSelectionComplete && !readOnly) {
      onComplete();
    }
  }, [isSelectionComplete, readOnly, onComplete]);

  // Read-only mode for host - just display peer's selections
  if (readOnly) {
    return (
      <div className="h-full flex flex-col bg-light p-4 overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 mb-4">
          <h2 className="text-lg font-bold text-dark">Guest의 사진 선택</h2>
          <p className="text-sm text-dark/70">
            Guest가 선택한 사진을 확인하세요 ({selectionCount}/{maxSelection})
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4">
          {/* Frame Preview */}
          <div className="flex-shrink-0 flex justify-center lg:items-start">
            <FramePreview
              photos={photos}
              selectedPhotos={displaySelections}
              frameLayout={frameLayout}
              size="large"
            />
          </div>

          {/* Photo Grid */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <PhotoGrid
              photos={photos}
              selectedPhotos={displaySelections}
              onPhotoSelect={() => {}}
              maxSelection={maxSelection}
              columns={4}
              readOnly={true}
            />
          </div>
        </div>

        {/* Generating indicator */}
        {isGenerating && (
          <div className="flex-shrink-0 mt-4 bg-primary/10 border-2 border-primary rounded-lg p-4">
            <div className="flex items-center justify-center gap-3">
              <div className="w-6 h-6 border-3 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-dark font-medium">프레임 생성 중...</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Interactive mode for guest
  return (
    <div className="h-full flex flex-col bg-light overflow-hidden">
      {/* Desktop Layout (lg+) */}
      <div className="hidden lg:flex flex-1 min-h-0 p-4 gap-6">
        {/* Left: Frame Preview (large) */}
        <div className="flex-shrink-0 flex flex-col">
          <FramePreview
            photos={photos}
            selectedPhotos={selectedPhotos}
            frameLayout={frameLayout}
            size="large"
          />
        </div>

        {/* Right: Photo Grid + Actions */}
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Header */}
          <div className="flex-shrink-0 mb-3">
            <h2 className="text-lg font-bold text-dark">사진 선택</h2>
            <p className="text-sm text-dark/70">
              {maxSelection}장의 사진을 선택해주세요 ({selectionCount}/{maxSelection})
            </p>
          </div>

          {/* Photo Grid */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-2">
            <PhotoGrid
              photos={photos}
              selectedPhotos={selectedPhotos}
              onPhotoSelect={onPhotoSelect}
              maxSelection={maxSelection}
              columns={4}
            />
          </div>

          {/* Action Button */}
          <div className="flex-shrink-0 mt-4">
            <button
              onClick={handleComplete}
              disabled={!isSelectionComplete || isGenerating}
              className="w-full px-6 py-4 bg-primary hover:bg-primary-dark text-white rounded-xl font-bold text-lg transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating
                ? '생성 중...'
                : isSelectionComplete
                ? '선택 완료'
                : `${selectionCount}/${maxSelection} 선택됨`
              }
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="flex lg:hidden flex-col h-full p-3 gap-3">
        {/* Top: Frame Preview (thumbnail) */}
        <div className="flex-shrink-0 flex justify-center">
          <FramePreview
            photos={photos}
            selectedPhotos={selectedPhotos}
            frameLayout={frameLayout}
            size="thumbnail"
          />
        </div>

        {/* Middle: Photo Carousel */}
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <PhotoCarousel
            photos={photos}
            selectedPhotos={selectedPhotos}
            currentIndex={currentCarouselIndex}
            onIndexChange={setCurrentCarouselIndex}
            onPhotoSelect={onPhotoSelect}
            maxSelection={maxSelection}
          />
        </div>

        {/* Bottom: Selection Counter + Button */}
        <div className="flex-shrink-0 space-y-2">
          {/* Photo indicators */}
          <div className="flex justify-center gap-1.5">
            {photos.map((_, index) => {
              const isSelected = selectedPhotos.includes(index);
              const isCurrent = index === currentCarouselIndex;
              return (
                <button
                  key={index}
                  onClick={() => setCurrentCarouselIndex(index)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    isSelected
                      ? 'bg-primary scale-125'
                      : isCurrent
                      ? 'bg-secondary'
                      : 'bg-neutral'
                  }`}
                  aria-label={`Go to photo ${index + 1}`}
                />
              );
            })}
          </div>

          {/* Action Button */}
          <button
            onClick={handleComplete}
            disabled={!isSelectionComplete || isGenerating}
            className="w-full px-4 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg font-bold text-base transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating
              ? '생성 중...'
              : isSelectionComplete
              ? '선택 완료'
              : `${selectionCount}/${maxSelection} 선택됨`
            }
          </button>
        </div>
      </div>
    </div>
  );
});
