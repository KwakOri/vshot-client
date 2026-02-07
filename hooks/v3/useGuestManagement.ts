'use client';

import { useState, useCallback, useRef } from 'react';
import { SignalMessage, V3Session, HostSettings } from '@/types';

// Default host settings
const DEFAULT_HOST_SETTINGS: HostSettings = {
  chromaKey: {
    enabled: true,
    color: '#00ff00',
    similarity: 0.4,
    smoothness: 0.1,
  },
  selectedFrameLayoutId: '2x2-grid',
  recordingDuration: 10,
  captureInterval: 3,
};

interface UseGuestManagementOptions {
  roomId: string;
  userId: string;
  role: 'host' | 'guest';
  initialHostSettings?: Partial<HostSettings>;
  sendSignal?: (message: SignalMessage) => void;
  onSignalMessage?: (message: SignalMessage) => void;
  resetWebRTCConnection?: () => void;
  createWebRTCOffer?: () => void;
}

/**
 * Hook for managing guest rotation in V3
 *
 * CRITICAL: Preserves Host state across guest changes
 * - Host: Maintains local stream, settings, and configuration
 * - Guest: Gets notified of host settings on join
 */
export function useGuestManagement({
  roomId,
  userId,
  role,
  initialHostSettings,
  sendSignal,
  onSignalMessage,
  resetWebRTCConnection,
  createWebRTCOffer,
}: UseGuestManagementOptions) {
  const [currentGuestId, setCurrentGuestId] = useState<string | null>(null);
  const [waitingForGuest, setWaitingForGuest] = useState(role === 'host');
  // Initialize hostSettings with defaults for Host, null for Guest (will receive from server)
  const [hostSettings, setHostSettings] = useState<HostSettings | null>(
    role === 'host' ? { ...DEFAULT_HOST_SETTINGS, ...initialHostSettings } : null
  );
  const [completedSessions, setCompletedSessions] = useState<V3Session[]>([]);

  // Track if Host state should be preserved
  const preserveHostStateRef = useRef(false);

  /**
   * Handle guest joined
   */
  const handleGuestJoined = useCallback(
    (message: Extract<SignalMessage, { type: 'guest-joined-v3' }>) => {
      if (role === 'host') {
        // Host: Guest has joined
        console.log(`[GuestManagement] Guest joined: ${message.guestId}`);
        setCurrentGuestId(message.guestId);
        setWaitingForGuest(false);

        // Create WebRTC offer for new guest
        createWebRTCOffer?.();

        // Mark to preserve Host state
        preserveHostStateRef.current = true;
      } else if (role === 'guest' && message.guestId === userId) {
        // Guest: Joined successfully, receive Host settings
        console.log('[GuestManagement] Joined as guest, received host settings');
        setHostSettings(message.hostSettings);
        setWaitingForGuest(false);
      }

      onSignalMessage?.(message);
    },
    [role, userId, createWebRTCOffer, onSignalMessage]
  );

  /**
   * Handle guest left
   */
  const handleGuestLeft = useCallback(
    (message: Extract<SignalMessage, { type: 'guest-left-v3' }>) => {
      if (role === 'host') {
        // CRITICAL: Guest left, but preserve Host state!
        console.log(`[GuestManagement] Guest left: ${message.guestId}. Preserving Host state.`);

        // Reset WebRTC connection ONLY (not local stream or settings)
        resetWebRTCConnection?.();

        // Clear current guest
        setCurrentGuestId(null);
        setWaitingForGuest(true);

        // Host state preserved:
        // - localStream ✓
        // - chromaKey settings ✓
        // - frame selection ✓
        // - device settings ✓

        console.log('[GuestManagement] Ready for next guest. Host configuration preserved.');
      }

      onSignalMessage?.(message);
    },
    [role, resetWebRTCConnection, onSignalMessage]
  );

  /**
   * Handle waiting for guest
   */
  const handleWaitingForGuest = useCallback(
    (message: Extract<SignalMessage, { type: 'waiting-for-guest-v3' }>) => {
      if (role === 'host') {
        console.log('[GuestManagement] Waiting for next guest');
        setWaitingForGuest(true);
      }

      onSignalMessage?.(message);
    },
    [role, onSignalMessage]
  );

  /**
   * Handle host settings sync
   */
  const handleHostSettingsSync = useCallback(
    (message: Extract<SignalMessage, { type: 'host-settings-sync-v3' }>) => {
      if (role === 'guest') {
        console.log('[GuestManagement] Host settings updated');
        setHostSettings(message.settings);
      }

      onSignalMessage?.(message);
    },
    [role, onSignalMessage]
  );

  /**
   * Handle session complete
   */
  const handleSessionComplete = useCallback(
    (message: Extract<SignalMessage, { type: 'session-complete-v3' }>) => {
      console.log(`[GuestManagement] Session completed: ${message.sessionId}`);

      // Add to completed sessions
      setCompletedSessions((prev) => [
        ...prev,
        {
          sessionId: message.sessionId,
          guestId: currentGuestId || '',
          hostPhotoUrl: null,
          guestPhotoUrl: null,
          mergedPhotoUrl: null,
          frameResultUrl: message.frameResultUrl,
          status: 'completed',
          createdAt: new Date(),
          completedAt: new Date(),
        },
      ]);

      onSignalMessage?.(message);
    },
    [currentGuestId, onSignalMessage]
  );

  /**
   * Register signal handlers (to be called from parent component)
   */
  const registerSignalHandlers = useCallback(
    (message: SignalMessage) => {
      switch (message.type) {
        case 'guest-joined-v3':
          handleGuestJoined(message);
          break;
        case 'guest-left-v3':
          handleGuestLeft(message);
          break;
        case 'waiting-for-guest-v3':
          handleWaitingForGuest(message);
          break;
        case 'host-settings-sync-v3':
          handleHostSettingsSync(message);
          break;
        case 'session-complete-v3':
          handleSessionComplete(message);
          break;
      }
    },
    [
      handleGuestJoined,
      handleGuestLeft,
      handleWaitingForGuest,
      handleHostSettingsSync,
      handleSessionComplete,
    ]
  );

  /**
   * Update host settings (Host only)
   * Optionally syncs to server/guest
   */
  const updateHostSettings = useCallback(
    (settings: Partial<HostSettings>, syncToServer: boolean = false) => {
      if (role !== 'host') {
        console.warn('[GuestManagement] Only Host can update settings');
        return;
      }

      const newSettings = {
        ...(hostSettings || DEFAULT_HOST_SETTINGS),
        ...settings,
      };

      setHostSettings(newSettings);

      // Sync to server if requested (will broadcast to guest)
      if (syncToServer && sendSignal) {
        sendSignal({
          type: 'host-settings-sync-v3',
          roomId,
          settings: newSettings,
        });
      }
    },
    [role, hostSettings, roomId, sendSignal]
  );

  return {
    // State
    currentGuestId,
    waitingForGuest,
    hostSettings,
    completedSessions,
    shouldPreserveHostState: preserveHostStateRef.current,

    // Methods
    registerSignalHandlers,
    updateHostSettings,

    // For debugging
    sessionCount: completedSessions.length,
  };
}
