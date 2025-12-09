import { Image } from 'lucide-react';

interface PhotoSelectionPanelProps {
  photos: string[];
  selectedPhotos: number[];
  onPhotoSelect?: (index: number) => void;
  onGenerateFrame?: () => void;
  maxSelection?: number;
  readOnly?: boolean;
  role: 'host' | 'guest';
  peerSelectedPhotos?: number[];
  isGenerating?: boolean;
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
  onGenerateFrame,
  maxSelection = 4,
  readOnly = false,
  role,
  peerSelectedPhotos = [],
  isGenerating = false
}: PhotoSelectionPanelProps) {
  if (photos.length === 0) return null;

  const displaySelections = readOnly ? peerSelectedPhotos : selectedPhotos;
  const selectionCount = displaySelections.length;

  return (
    <div className="bg-neutral/30 border-2 border-neutral rounded-lg p-6 mt-6">
      <div className="flex items-center gap-2 mb-2">
        <Image size={24} className="text-primary" />
        <h2 className="text-2xl font-semibold text-dark">
          {readOnly ? 'Guest의 사진 선택' : '사진 선택'}
        </h2>
      </div>
      <p className="text-dark/70 mb-4">
        {readOnly ? (
          <>
            Guest가 선택한 사진을 확인하세요
            {selectionCount > 0 && (
              <span className="ml-2 text-primary font-semibold">
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
              className={`relative aspect-[4/3] rounded-lg overflow-hidden transition-all border-2 ${
                isSelected
                  ? 'ring-4 ring-primary scale-105 border-primary'
                  : readOnly
                  ? 'opacity-50 border-neutral'
                  : 'hover:ring-2 hover:ring-secondary hover:scale-102 cursor-pointer border-neutral-dark'
              }`}
            >
              <img
                src={photo}
                alt={`Photo ${index + 1}`}
                className="w-full h-full object-cover"
              />

              {/* Selection indicator */}
              {isSelected && (
                <div className="absolute top-2 right-2 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-bold shadow-lg">
                  {selectionOrder}
                </div>
              )}

              {/* Photo number */}
              <div className="absolute bottom-2 left-2 px-2 py-1 bg-dark/70 rounded text-sm text-light font-medium">
                #{index + 1}
              </div>
            </div>
          );
        })}
      </div>

      {/* Generate frame button */}
      {selectionCount === maxSelection && onGenerateFrame && (
        <div className="mt-6">
          <button
            onClick={onGenerateFrame}
            disabled={isGenerating}
            className="w-full px-6 py-4 bg-primary hover:bg-primary-dark text-white rounded-lg font-semibold text-lg transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating
              ? (role === 'guest' ? '사진 및 영상 생성 중...' : '프레임 생성 중...')
              : (role === 'guest' ? '사진 및 영상 생성하기' : '프레임 생성하기')
            }
          </button>
        </div>
      )}
    </div>
  );
}
