import { Loader2 } from 'lucide-react';

interface ProcessingIndicatorProps {
  show: boolean;
}

/**
 * Shared component for showing processing/merging state
 */
export function ProcessingIndicator({ show }: ProcessingIndicatorProps) {
  if (!show) return null;

  return (
    <div className="bg-neutral/30 border-2 border-neutral rounded-lg p-8 mt-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 size={64} className="text-primary animate-spin" strokeWidth={2.5} />
        <div className="text-xl font-semibold text-dark">사진 합성 중...</div>
        <p className="text-dark/70">서버에서 고해상도 사진을 합성하고 있습니다</p>
      </div>
    </div>
  );
}
