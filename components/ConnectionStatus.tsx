import { Loader2, UserCheck, Users, Wifi } from 'lucide-react';

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
    <div className="flex gap-3 items-center flex-wrap">
      {!isConnected && (
        <div className="px-4 py-2 bg-secondary/20 border border-secondary text-dark rounded-lg text-sm font-medium flex items-center gap-2">
          <Loader2 size={16} className="animate-spin" />
          서버에 연결 중...
        </div>
      )}
      {isConnected && !peerId && (
        <div className="px-4 py-2 bg-primary/20 border border-primary text-dark rounded-lg text-sm font-medium flex items-center gap-2">
          <Users size={16} />
          {peerRole} 대기 중...
        </div>
      )}
      {peerId && !remoteStream && (
        <div className="px-4 py-2 bg-secondary border border-secondary text-white rounded-lg text-sm font-medium flex items-center gap-2 animate-pulse">
          <Wifi size={16} />
          {peerRole} 연결 중...
        </div>
      )}
      {peerId && remoteStream && (
        <div className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-md">
          <UserCheck size={16} />
          {peerRole} 연결됨
        </div>
      )}
    </div>
  );
}
