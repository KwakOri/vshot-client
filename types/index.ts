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
  | { type: 'video-frame-request'; roomId: string; userId: string; selectedPhotos: number[] }
  | { type: 'video-frame-ready'; roomId: string; videoUrl: string }
  | { type: 'host-display-options'; roomId: string; options: { flipHorizontal: boolean } }
  | { type: 'guest-display-options'; roomId: string; options: { flipHorizontal: boolean } }
  | { type: 'aspect-ratio-settings'; roomId: string; settings: AspectRatioSettings }
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

export type AspectRatio = '16:9' | '4:3' | '3:4' | '9:16' | '1:1';

export interface AspectRatioSettings {
  ratio: AspectRatio;
  width: number;
  height: number;
}

export const ASPECT_RATIOS: Record<AspectRatio, { width: number; height: number; label: string }> = {
  '16:9': { width: 1920, height: 1080, label: '16:9 (가로)' },
  '4:3': { width: 1440, height: 1080, label: '4:3 (표준)' },
  '3:4': { width: 1080, height: 1440, label: '3:4 (세로)' },
  '9:16': { width: 1080, height: 1920, label: '9:16 (세로)' },
  '1:1': { width: 1080, height: 1080, label: '1:1 (정사각형)' },
};

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

/**
 * Frame Layout System - for custom photo/video frame compositions
 * Designed for future DB integration
 */

/**
 * Individual frame slot position and styling
 */
export interface FrameSlot {
  x: number;          // X position in pixels
  y: number;          // Y position in pixels
  width: number;      // Width in pixels
  height: number;     // Height in pixels
  zIndex?: number;    // Stacking order (higher = on top)
  rotation?: number;  // Rotation in degrees (for future use)
  borderRadius?: number; // Corner radius in pixels (for future use)
}

/**
 * Complete frame layout configuration
 * This structure is designed to be stored in a database
 */
export interface FrameLayout {
  id: string;                    // Unique identifier (UUID)
  label: string;                 // Display name for users
  slotCount: number;             // Number of slots (e.g., 4 for 2x2 grid)
  positions: FrameSlot[];        // Position data for each slot
  thumbnailSrc: string;          // Path to preview image (e.g., "/frames/2x2-grid.png")

  // Optional metadata for DB
  description?: string;          // Description of the layout
  category?: string;             // Category (e.g., "grid", "spotlight", "custom")
  createdAt?: string;            // ISO date string
  updatedAt?: string;            // ISO date string
  isActive?: boolean;            // Whether this layout is available
  sortOrder?: number;            // Display order in UI
  tags?: string[];               // Search tags
}

/**
 * Layout selection response (for future API)
 */
export interface LayoutSelectionResult {
  layout: FrameLayout;
  appliedAt: string;
}
