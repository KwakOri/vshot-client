import { memo, useMemo } from 'react';
import { FrameLayout } from '@/types';

interface FramePreviewProps {
  photos: string[];
  selectedPhotos: number[];
  frameLayout: FrameLayout;
  size: 'thumbnail' | 'large';
  className?: string;
}

/**
 * Shows selected photos rendered in the frame layout slots.
 * Renders frame with 2:3 aspect ratio.
 * Shows empty slots as gray placeholders.
 * Fills slots with selected photos in order.
 * Applies frame overlay if frameSrc exists.
 */
export const FramePreview = memo(function FramePreview({
  photos,
  selectedPhotos,
  frameLayout,
  size,
  className = '',
}: FramePreviewProps) {
  // Calculate slot positions as percentages for responsive sizing
  const slotsWithPercentages = useMemo(() => {
    const { canvasWidth, canvasHeight, positions } = frameLayout;
    return positions.map((slot, index) => ({
      left: `${(slot.x / canvasWidth) * 100}%`,
      top: `${(slot.y / canvasHeight) * 100}%`,
      width: `${(slot.width / canvasWidth) * 100}%`,
      height: `${(slot.height / canvasHeight) * 100}%`,
      zIndex: slot.zIndex ?? index,
      photoIndex: selectedPhotos[index], // undefined if not selected yet
    }));
  }, [frameLayout, selectedPhotos]);

  // Get the photo URL for a slot
  const getPhotoUrl = (slotIndex: number): string | null => {
    if (slotIndex >= selectedPhotos.length) return null;
    const photoIndex = selectedPhotos[slotIndex];
    if (photoIndex === undefined || photoIndex >= photos.length) return null;
    return photos[photoIndex];
  };

  const sizeClasses = size === 'thumbnail'
    ? 'w-24 h-36 sm:w-32 sm:h-48'
    : 'max-w-[280px] w-full';

  return (
    <div
      className={`relative bg-neutral/30 rounded-lg overflow-hidden ${sizeClasses} ${className}`}
      style={{ aspectRatio: '2/3' }}
    >
      {/* Photo slots */}
      {slotsWithPercentages.map((slot, index) => {
        const photoUrl = getPhotoUrl(index);

        return (
          <div
            key={index}
            className="absolute overflow-hidden"
            style={{
              left: slot.left,
              top: slot.top,
              width: slot.width,
              height: slot.height,
              zIndex: slot.zIndex,
            }}
          >
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={`Selected photo ${index + 1}`}
                className="w-full h-full object-cover"
              />
            ) : (
              // Empty slot placeholder
              <div className="w-full h-full bg-neutral/50 flex items-center justify-center">
                <span className="text-dark/30 text-xs font-medium">
                  {index + 1}
                </span>
              </div>
            )}
          </div>
        );
      })}

      {/* Frame overlay (if exists) */}
      {frameLayout.frameSrc && (
        <img
          src={frameLayout.frameSrc}
          alt="Frame overlay"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ zIndex: 100 }}
        />
      )}

      {/* Selection count badge */}
      <div className="absolute bottom-1 right-1 bg-dark/70 text-white text-xs px-1.5 py-0.5 rounded font-medium" style={{ zIndex: 101 }}>
        {selectedPhotos.length}/{frameLayout.slotCount}
      </div>
    </div>
  );
});
