interface ConnectionStatusProps {
  isConnected: boolean;
  peerId: string | null;
  remoteStream: MediaStream | null;
  role: 'host' | 'guest';
}

/**
 * Shared component for displaying connection status
 * Shows: Server connecting, Peer waiting, Peer connecting, Connected
 */
export function ConnectionStatus({
  isConnected,
  peerId,
  remoteStream,
  role
}: ConnectionStatusProps) {
  const peerRole = role === 'host' ? 'Guest' : 'Host';

  return (
    <div className="flex gap-3 items-center">
      {!isConnected && (
        <div className="px-4 py-2 bg-yellow-600 rounded-lg text-sm">
          서버에 연결 중...
        </div>
      )}
      {isConnected && !peerId && (
        <div className="px-4 py-2 bg-blue-600 rounded-lg text-sm">
          {peerRole} 대기 중...
        </div>
      )}
      {peerId && !remoteStream && (
        <div className="px-4 py-2 bg-orange-600 rounded-lg text-sm animate-pulse">
          {peerRole} 연결 중...
        </div>
      )}
      {peerId && remoteStream && (
        <div className="px-4 py-2 bg-green-600 rounded-lg text-sm">
          ✓ {peerRole} 연결됨
        </div>
      )}
    </div>
  );
}
