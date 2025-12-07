interface PhotoSelectionPanelProps {
  photos: string[];
  selectedPhotos: number[];
  onPhotoSelect?: (index: number) => void;
  maxSelection?: number;
  readOnly?: boolean;
  role: 'host' | 'guest';
  peerSelectedPhotos?: number[];
}

/**
 * Shared component for photo selection
 * Guest: Interactive selection (onPhotoSelect provided)
 * Host: Read-only display of guest's selections (readOnly=true, peerSelectedPhotos provided)
 */
export function PhotoSelectionPanel({
  photos,
  selectedPhotos,
  onPhotoSelect,
  maxSelection = 4,
  readOnly = false,
  role,
  peerSelectedPhotos = []
}: PhotoSelectionPanelProps) {
  if (photos.length === 0) return null;

  const displaySelections = readOnly ? peerSelectedPhotos : selectedPhotos;
  const selectionCount = displaySelections.length;

  return (
    <div className="bg-gray-800 rounded-lg p-6 mt-6">
      <h2 className="text-2xl font-semibold mb-2">
        {readOnly ? 'Guest의 사진 선택' : '사진 선택'}
      </h2>
      <p className="text-gray-400 mb-4">
        {readOnly ? (
          <>
            Guest가 선택한 사진을 확인하세요
            {selectionCount > 0 && (
              <span className="ml-2 text-pink-400">
                ({selectionCount} / {maxSelection} 선택됨)
              </span>
            )}
          </>
        ) : (
          `${maxSelection}장의 사진을 선택해주세요 (${selectionCount} / ${maxSelection} 선택됨)`
        )}
      </p>

      {/* Photo grid */}
      <div className="grid grid-cols-4 gap-4">
        {photos.map((photo, index) => {
          const isSelected = displaySelections.includes(index);
          const selectionOrder = displaySelections.indexOf(index) + 1;
          const canSelect = !readOnly && onPhotoSelect;

          return (
            <div
              key={index}
              onClick={() => canSelect && onPhotoSelect(index)}
              className={`relative aspect-[4/3] rounded-lg overflow-hidden transition-all ${
                isSelected
                  ? 'ring-4 ring-pink-500 scale-105'
                  : readOnly
                  ? 'opacity-50'
                  : 'hover:ring-2 hover:ring-gray-500 hover:scale-102 cursor-pointer'
              }`}
            >
              <img
                src={photo}
                alt={`Photo ${index + 1}`}
                className="w-full h-full object-cover"
              />

              {/* Selection indicator */}
              {isSelected && (
                <div className="absolute top-2 right-2 w-8 h-8 bg-pink-500 rounded-full flex items-center justify-center text-white font-bold shadow-lg">
                  {selectionOrder}
                </div>
              )}

              {/* Photo number */}
              <div className="absolute bottom-2 left-2 px-2 py-1 bg-black bg-opacity-50 rounded text-sm">
                #{index + 1}
              </div>
            </div>
          );
        })}
      </div>

      {/* Generate frame button */}
      {selectionCount === maxSelection && (
        <div className="mt-6">
          <button
            className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg font-semibold text-lg transition"
          >
            프레임 생성하기
          </button>
        </div>
      )}
    </div>
  );
}
