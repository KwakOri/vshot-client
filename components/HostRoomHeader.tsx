'use client';

import { ConnectionStatus } from './ConnectionStatus';

interface HostRoomHeaderProps {
  onBack: () => void;
  backButtonTitle: string;
  roomId: string | null;
  isConnected: boolean;
  peerId: string | null;
  remoteStream: MediaStream | null;
  localMicMuted: boolean;
  onToggleLocalMic: () => void;
  remoteAudioEnabled: boolean;
  onToggleRemoteAudio: () => void;
  onOpenSettings: () => void;
  /** 방 코드 복사 버튼 표시 여부 (기본: true) */
  showRoomCode?: boolean;
  /**
   * 'compact': 사진 선택 화면용 (단일 행)
   * 'default': 메인 비디오 화면용 (반응형)
   */
  variant?: 'compact' | 'default';
}

export function HostRoomHeader({
  onBack,
  backButtonTitle,
  roomId,
  isConnected,
  peerId,
  remoteStream,
  localMicMuted,
  onToggleLocalMic,
  remoteAudioEnabled,
  onToggleRemoteAudio,
  onOpenSettings,
  showRoomCode = true,
  variant = 'default',
}: HostRoomHeaderProps) {
  const handleCopyRoomCode = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
      alert('방 코드가 클립보드에 복사되었습니다!');
    }
  };

  // 마이크 아이콘
  const MicOnIcon = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );

  const MicOffIcon = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );

  // 스피커 아이콘
  const SpeakerOnIcon = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );

  const SpeakerOffIcon = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );

  // 뒤로가기 아이콘
  const BackIcon = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );

  // 설정 아이콘
  const SettingsIcon = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  );

  // 복사 아이콘
  const CopyIcon = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-white"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  );

  // 공통 버튼들
  const renderBackButton = () => (
    <button
      onClick={onBack}
      className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-neutral/40 hover:bg-neutral rounded-lg transition"
      title={backButtonTitle}
    >
      <BackIcon />
    </button>
  );

  const renderRoomCodeButton = () =>
    showRoomCode && roomId && (
      <button
        onClick={handleCopyRoomCode}
        className={`flex items-center gap-2 bg-secondary hover:bg-secondary-dark rounded-lg shadow-md transition ${
          variant === 'compact'
            ? 'px-3 py-1.5'
            : 'px-2 sm:px-4 py-1 sm:py-2 landscape:py-1'
        }`}
        title="방 코드 복사"
      >
        <CopyIcon />
        <span
          className={`font-bold text-white ${
            variant === 'compact'
              ? 'text-sm'
              : 'text-sm sm:text-lg landscape:text-sm'
          }`}
        >
          방 코드 복사
        </span>
      </button>
    );

  const renderMicButton = () => (
    <button
      onClick={onToggleLocalMic}
      className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg transition ${
        localMicMuted
          ? 'bg-red-500 hover:bg-red-600 text-white'
          : 'bg-neutral/40 hover:bg-neutral text-dark'
      }`}
      title={localMicMuted ? '마이크 켜기' : '마이크 끄기'}
    >
      {localMicMuted ? <MicOffIcon /> : <MicOnIcon />}
    </button>
  );

  const renderSpeakerButton = () => (
    <button
      onClick={onToggleRemoteAudio}
      className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg transition ${
        remoteAudioEnabled
          ? 'bg-neutral/40 hover:bg-neutral text-dark'
          : 'bg-red-500 hover:bg-red-600 text-white'
      }`}
      title={remoteAudioEnabled ? '상대방 음성 끄기' : '상대방 음성 켜기'}
    >
      {remoteAudioEnabled ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
    </button>
  );

  const renderSettingsButton = () => (
    <button
      onClick={onOpenSettings}
      className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-neutral/40 hover:bg-neutral rounded-lg transition"
      title="Settings"
    >
      <SettingsIcon />
    </button>
  );

  // Compact 레이아웃 (사진 선택 화면)
  if (variant === 'compact') {
    return (
      <div className="flex-shrink-0 flex items-center gap-2 bg-white border-2 border-neutral rounded-lg m-4 mb-0 p-2 shadow-md">
        {renderBackButton()}
        <h1 className="text-lg font-bold text-dark">Host</h1>
        {renderRoomCodeButton()}
        <ConnectionStatus
          isConnected={isConnected}
          peerId={peerId}
          remoteStream={remoteStream}
          role="host"
        />
        <div className="flex-1" />
        {renderMicButton()}
        {renderSpeakerButton()}
        {renderSettingsButton()}
      </div>
    );
  }

  // Default 레이아웃 (메인 비디오 화면)
  return (
    <div className="flex-shrink-0 mb-2">
      <div className="flex flex-col landscape:flex-row gap-2 landscape:gap-3 items-start landscape:items-center landscape:justify-between">
        {/* Back button + Title */}
        <div className="flex items-center gap-2">
          {renderBackButton()}
          <h1 className="text-lg sm:text-2xl landscape:text-lg font-bold text-dark">
            Host
          </h1>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {renderRoomCodeButton()}
          <ConnectionStatus
            isConnected={isConnected}
            peerId={peerId}
            remoteStream={remoteStream}
            role="host"
          />
          {renderMicButton()}
          {renderSpeakerButton()}
          {renderSettingsButton()}
        </div>
      </div>
    </div>
  );
}
