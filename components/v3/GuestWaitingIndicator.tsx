'use client';

interface GuestWaitingIndicatorProps {
  waitingForGuest: boolean;
  completedSessionCount: number;
  className?: string;
}

export function GuestWaitingIndicator({
  waitingForGuest,
  completedSessionCount,
  className = '',
}: GuestWaitingIndicatorProps) {
  if (!waitingForGuest) return null;

  return (
    <div className={`booth-card-warm p-6 text-center ${className}`}>
      {/* Animated waiting icon */}
      <div className="mb-4 flex justify-center">
        <div className="relative">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center animate-float">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FC712B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          {/* Pulse ring */}
          <div className="absolute inset-0 w-14 h-14 rounded-full border-2 border-primary/30 animate-pulse-ring" />
        </div>
      </div>

      {/* Message */}
      <h3 className="font-display text-lg font-bold text-dark mb-1">
        {completedSessionCount === 0 ? '게스트 대기 중' : '다음 게스트 대기 중'}
      </h3>

      <p className="text-sm text-dark/50 mb-4">
        {completedSessionCount === 0
          ? '게스트가 입장할 때까지 기다려주세요'
          : `${completedSessionCount}명의 게스트와 촬영 완료`}
      </p>

      {/* Tips */}
      <div className="p-3 rounded-xl bg-white/60 border border-neutral/30">
        <p className="font-display text-xs font-semibold text-dark/40 uppercase tracking-wider mb-2">
          설정 유지됨
        </p>
        <div className="flex justify-center gap-4">
          <div className="flex items-center gap-1.5 text-xs text-dark/50">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
            카메라
          </div>
          <div className="flex items-center gap-1.5 text-xs text-dark/50">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
            프레임
          </div>
          <div className="flex items-center gap-1.5 text-xs text-dark/50">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
            크로마키
          </div>
        </div>
      </div>
    </div>
  );
}

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
    <div className={`${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="font-display text-sm font-bold text-dark/60">촬영 기록</h3>
        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold">
          {completedSessions.length}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {completedSessions.map((session, index) => (
          <div
            key={session.sessionId}
            className="relative aspect-[2/3] rounded-xl overflow-hidden booth-card group"
          >
            {session.frameResultUrl ? (
              <img
                src={session.frameResultUrl}
                alt={`Session ${index + 1}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-light">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E2D4C4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </div>
            )}

            {/* Session number badge */}
            <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-display font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #FC712B, #FD9319)' }}>
              #{index + 1}
            </div>

            {/* Download overlay on hover */}
            {session.frameResultUrl && (
              <a
                href={session.frameResultUrl}
                download={`session_${index + 1}.png`}
                className="absolute inset-0 bg-dark/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
