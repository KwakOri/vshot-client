interface FlashOverlayProps {
  show: boolean;
}

/**
 * Shared component for flash effect during photo capture
 */
export function FlashOverlay({ show }: FlashOverlayProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-white z-50 pointer-events-none animate-flash" />
  );
}
