import { memo, useCallback, useMemo } from 'react';

interface PhotoGridProps {
  photos: string[];
  selectedPhotos: number[];
  onPhotoSelect: (index: number) => void;
  maxSelection: number;
  columns?: number;
  readOnly?: boolean;
}

/**
 * Grid-only photo display component.
 * Refactored from PhotoSelectionPanel for reuse.
 */
export const PhotoGrid = memo(function PhotoGrid({
  photos,
  selectedPhotos,
  onPhotoSelect,
  maxSelection,
  columns = 4,
  readOnly = false,
}: PhotoGridProps) {
  const selectionSet = useMemo(() => new Set(selectedPhotos), [selectedPhotos]);
  const canSelectMore = selectedPhotos.length < maxSelection;

  const handlePhotoClick = useCallback((index: number) => {
    if (readOnly) return;
    const isSelected = selectionSet.has(index);
    if (isSelected || canSelectMore) {
      onPhotoSelect(index);
    }
  }, [readOnly, selectionSet, canSelectMore, onPhotoSelect]);

  return (
    <div
      className="grid gap-2"
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      }}
    >
      {photos.map((photo, index) => {
        const isSelected = selectionSet.has(index);
        const selectionOrder = isSelected ? selectedPhotos.indexOf(index) + 1 : 0;

        return (
          <div
            key={index}
            onClick={() => handlePhotoClick(index)}
            className={`relative aspect-[2/3] rounded-lg overflow-hidden border-2 transition-all ${
              isSelected
                ? 'ring-2 ring-primary ring-offset-1 border-primary scale-[1.02]'
                : readOnly
                ? 'opacity-50 border-neutral cursor-default'
                : canSelectMore
                ? 'hover:ring-2 hover:ring-secondary/50 hover:scale-[1.01] cursor-pointer border-neutral'
                : 'opacity-50 border-neutral cursor-not-allowed'
            }`}
          >
            <img
              src={photo}
              alt={`Photo ${index + 1}`}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />

            {/* Selection indicator */}
            {isSelected && (
              <div className="absolute top-1 right-1 w-6 h-6 bg-primary rounded-full flex items-center justify-center text-white font-bold text-xs shadow-md">
                {selectionOrder}
              </div>
            )}

            {/* Photo number */}
            <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-dark/70 rounded text-[10px] text-light font-medium">
              #{index + 1}
            </div>
          </div>
        );
      })}
    </div>
  );
});
