interface CountdownOverlayProps {
  countdown: number | null;
}

/**
 * Shared component for countdown overlay during photo capture
 */
export function CountdownOverlay({ countdown }: CountdownOverlayProps) {
  if (countdown === null) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="text-8xl font-bold text-white animate-ping">
        {countdown}
      </div>
    </div>
  );
}
