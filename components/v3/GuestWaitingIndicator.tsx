'use client';

interface GuestWaitingIndicatorProps {
  waitingForGuest: boolean;
  completedSessionCount: number;
  className?: string;
}

/**
 * Guest Waiting Indicator Component
 *
 * Shows Host status when waiting for next guest
 */
export function GuestWaitingIndicator({
  waitingForGuest,
  completedSessionCount,
  className = '',
}: GuestWaitingIndicatorProps) {
  if (!waitingForGuest) return null;

  return (
    <div
      className={`
        p-6 rounded-lg border-2 border-dashed
        text-center
        ${className}
      `}
      style={{
        borderColor: '#FD9319',
        backgroundColor: '#F3E9E7',
      }}
    >
      {/* Animated waiting icon */}
      <div className="mb-4 flex justify-center">
        <div
          className="w-16 h-16 rounded-full
                     flex items-center justify-center
                     animate-pulse"
          style={{ backgroundColor: '#FC712B' }}
        >
          <span className="text-3xl">👥</span>
        </div>
      </div>

      {/* Message */}
      <h3 className="text-xl font-bold mb-2" style={{ color: '#1B1612' }}>
        {completedSessionCount === 0 ? '게스트 대기 중...' : '다음 게스트 대기 중...'}
      </h3>

      <p className="text-sm mb-4" style={{ color: '#1B1612', opacity: 0.7 }}>
        {completedSessionCount === 0
          ? '게스트가 입장할 때까지 기다려주세요'
          : `${completedSessionCount}명의 게스트와 촬영을 완료했습니다`}
      </p>

      {/* Tips */}
      <div className="mt-6 p-4 rounded-lg bg-white/50">
        <p className="text-xs font-semibold mb-2" style={{ color: '#1B1612' }}>
          💡 팁
        </p>
        <ul className="text-xs text-left space-y-1" style={{ color: '#1B1612', opacity: 0.6 }}>
          <li>• 카메라 설정이 유지되어 있습니다</li>
          <li>• 프레임 설정이 유지되어 있습니다</li>
          <li>• 새로운 게스트가 입장하면 바로 촬영 가능합니다</li>
        </ul>
      </div>

      {/* QR Code placeholder for future */}
      <div className="mt-4">
        <p className="text-xs" style={{ color: '#1B1612', opacity: 0.5 }}>
          게스트에게 입장 링크를 공유하세요
        </p>
      </div>
    </div>
  );
}

/**
 * Session History Panel
 *
 * Shows completed sessions
 */
interface SessionHistoryPanelProps {
  completedSessions: Array<{
    sessionId: string;
    guestId: string;
    frameResultUrl: string | null;
  }>;
  className?: string;
}

export function SessionHistoryPanel({
  completedSessions,
  className = '',
}: SessionHistoryPanelProps) {
  if (completedSessions.length === 0) return null;

  return (
    <div className={`session-history-panel ${className}`}>
      <h3 className="text-lg font-semibold mb-4" style={{ color: '#1B1612' }}>
        촬영 완료 ({completedSessions.length})
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {completedSessions.map((session, index) => (
          <div
            key={session.sessionId}
            className="relative aspect-video rounded-lg overflow-hidden
                       border-2 hover:shadow-lg transition-shadow cursor-pointer"
            style={{ borderColor: '#E2D4C4' }}
          >
            {session.frameResultUrl ? (
              <img
                src={session.frameResultUrl}
                alt={`Session ${index + 1}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center"
                style={{ backgroundColor: '#F3E9E7' }}
              >
                <span className="text-4xl">📸</span>
              </div>
            )}

            {/* Session number badge */}
            <div
              className="absolute top-2 left-2
                         px-2 py-1 rounded-full
                         text-xs font-semibold text-white"
              style={{ backgroundColor: '#FC712B' }}
            >
              #{index + 1}
            </div>

            {/* Download button */}
            {session.frameResultUrl && (
              <a
                href={session.frameResultUrl}
                download={`session_${index + 1}.png`}
                className="absolute bottom-2 right-2
                           px-3 py-1 rounded-full
                           text-xs font-semibold text-white
                           hover:scale-110 transition-transform"
                style={{ backgroundColor: '#FD9319' }}
                onClick={(e) => e.stopPropagation()}
              >
                다운로드
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
