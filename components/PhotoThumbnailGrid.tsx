interface PhotoThumbnailGridProps {
  photos: string[];
  totalSlots?: number;
}

/**
 * Shared component for displaying photo thumbnails in a grid
 * Shows empty slots with numbers before photos are captured
 */
export function PhotoThumbnailGrid({ photos, totalSlots = 8 }: PhotoThumbnailGridProps) {
  return (
    <div className="grid grid-cols-8 gap-2">
      {Array.from({ length: totalSlots }).map((_, i) => (
        <div
          key={i}
          className="aspect-[4/3] bg-neutral/40 border border-neutral-dark rounded-lg overflow-hidden flex items-center justify-center text-dark/50 font-semibold"
        >
          {photos[i] ? (
            <img src={photos[i]} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
          ) : (
            <span>{i + 1}</span>
          )}
        </div>
      ))}
    </div>
  );
}
