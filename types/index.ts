// Signal message types (matching server)
export type SignalMessage =
  | { type: 'join'; roomId: string; userId: string; role: 'host' | 'guest' }
  | { type: 'joined'; roomId: string; role: 'host' | 'guest'; userId: string; hostId?: string }
  | { type: 'peer-joined'; userId: string; role: 'host' | 'guest' }
  | { type: 'peer-left'; userId: string }
  | { type: 'offer'; roomId: string; from: string; to: string; sdp: string }
  | { type: 'answer'; roomId: string; from: string; to: string; sdp: string }
  | { type: 'ice'; roomId: string; from: string; to: string; candidate: RTCIceCandidateInit }
  | { type: 'leave'; roomId: string; userId: string }
  | { type: 'photo-session-start'; roomId: string }
  | { type: 'session-settings'; roomId: string; settings: SessionSettings }
  | { type: 'countdown-tick'; roomId: string; count: number; photoNumber: number }
  | { type: 'capture-now'; roomId: string; photoNumber: number }
  | { type: 'capture-request'; roomId: string; photoNumber: number }
  | { type: 'capture-uploaded'; roomId: string; userId: string; role: 'host' | 'guest'; url: string; photoNumber: number }
  | { type: 'capture-complete'; roomId: string; imageUrl: string; photoNumber: number }
  | { type: 'photos-merged'; roomId: string; photos: Array<{ photoNumber: number; mergedImageUrl: string }> }
  | { type: 'photo-select'; roomId: string; userId: string; selectedIndices: number[] }
  | { type: 'photo-select-sync'; roomId: string; userId: string; role: 'host' | 'guest'; selectedIndices: number[] }
  | { type: 'chromakey-settings'; roomId: string; settings: ChromaKeySettings }
  | { type: 'error'; message: string };

export interface ChromaKeySettings {
  enabled: boolean;
  color: string;
  similarity: number;
  smoothness: number;
}

export interface SessionSettings {
  recordingDuration: number; // seconds (default: 10)
  captureInterval: number; // seconds between photos (default: 3)
}

export interface CapturedPhoto {
  photoNumber: number;
  hostImageUrl: string | null;
  guestImageUrl: string | null;
  mergedImageUrl: string | null;
  localImageData?: string; // base64 data for local preview
}

export interface RoomState {
  roomId: string | null;
  userId: string;
  role: 'host' | 'guest' | null;
  peerId: string | null;
  isConnected: boolean;
  capturedPhotos: CapturedPhoto[];
  selectedPhotos: number[];
  peerSelectedPhotos: number[];
}

export interface WebRTCConfig {
  iceServers: RTCIceServer[];
}
