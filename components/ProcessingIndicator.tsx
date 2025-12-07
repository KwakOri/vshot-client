interface ProcessingIndicatorProps {
  show: boolean;
}

/**
 * Shared component for showing processing/merging state
 */
export function ProcessingIndicator({ show }: ProcessingIndicatorProps) {
  if (!show) return null;

  return (
    <div className="bg-gray-800 rounded-lg p-8 mt-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-xl font-semibold">사진 합성 중...</div>
        <p className="text-gray-400">서버에서 고해상도 사진을 합성하고 있습니다</p>
      </div>
    </div>
  );
}
