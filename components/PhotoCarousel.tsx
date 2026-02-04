import { memo, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PhotoCarouselProps {
  photos: string[];
  selectedPhotos: number[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onPhotoSelect: (index: number) => void;
  maxSelection: number;
}

/**
 * Single photo carousel with navigation for mobile.
 * Shows one large photo at a time.
 * Left/right arrow buttons for navigation.
 * Tap to toggle selection.
 * Selection indicator on photo.
 */
export const PhotoCarousel = memo(function PhotoCarousel({
  photos,
  selectedPhotos,
  currentIndex,
  onIndexChange,
  onPhotoSelect,
  maxSelection,
}: PhotoCarouselProps) {
  const photo = photos[currentIndex];
  const isSelected = selectedPhotos.includes(currentIndex);
  const selectionOrder = isSelected ? selectedPhotos.indexOf(currentIndex) + 1 : 0;
  const canSelectMore = selectedPhotos.length < maxSelection;

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      onIndexChange(currentIndex - 1);
    }
  }, [currentIndex, onIndexChange]);

  const goToNext = useCallback(() => {
    if (currentIndex < photos.length - 1) {
      onIndexChange(currentIndex + 1);
    }
  }, [currentIndex, photos.length, onIndexChange]);

  const handlePhotoClick = useCallback(() => {
    // Can select if already selected (to deselect) or if under max
    if (isSelected || canSelectMore) {
      onPhotoSelect(currentIndex);
    }
  }, [isSelected, canSelectMore, onPhotoSelect, currentIndex]);

  if (!photo) return null;

  return (
    <div className="flex items-center justify-center gap-2">
      {/* Left arrow */}
      <button
        onClick={goToPrev}
        disabled={currentIndex === 0}
        className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-white border-2 border-neutral rounded-full shadow-md disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition"
        aria-label="Previous photo"
      >
        <ChevronLeft className="w-5 h-5 text-dark" />
      </button>

      {/* Photo */}
      <div
        onClick={handlePhotoClick}
        className={`relative flex-1 max-w-[300px] aspect-[2/3] rounded-lg overflow-hidden cursor-pointer border-4 transition-all ${
          isSelected
            ? 'border-primary shadow-lg scale-[1.02]'
            : canSelectMore
            ? 'border-transparent hover:border-secondary/50'
            : 'border-transparent opacity-70'
        }`}
      >
        <img
          src={photo}
          alt={`Photo ${currentIndex + 1}`}
          className="w-full h-full object-cover"
        />

        {/* Selection indicator */}
        {isSelected && (
          <div className="absolute top-3 right-3 w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg">
            {selectionOrder}
          </div>
        )}

        {/* Photo number badge */}
        <div className="absolute bottom-3 left-3 px-3 py-1 bg-dark/70 rounded-full text-sm text-light font-medium">
          #{currentIndex + 1}
        </div>

        {/* Tap hint */}
        {!isSelected && canSelectMore && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark/20 opacity-0 hover:opacity-100 transition-opacity">
            <span className="text-white text-sm font-medium bg-dark/60 px-3 py-1.5 rounded-full">
              Tap to select
            </span>
          </div>
        )}
      </div>

      {/* Right arrow */}
      <button
        onClick={goToNext}
        disabled={currentIndex === photos.length - 1}
        className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-white border-2 border-neutral rounded-full shadow-md disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition"
        aria-label="Next photo"
      >
        <ChevronRight className="w-5 h-5 text-dark" />
      </button>
    </div>
  );
});
