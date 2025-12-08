interface CountdownOverlayProps {
  countdown: number | null;
}

/**
 * Shared component for countdown overlay during photo capture
 */
export function CountdownOverlay({ countdown }: CountdownOverlayProps) {
  if (countdown === null) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30">
      <div className="text-9xl font-bold text-white drop-shadow-lg">
        {countdown}
      </div>
    </div>
  );
}
