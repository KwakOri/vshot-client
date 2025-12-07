import { useEffect, useRef, useCallback, useState } from 'react';
import { SignalingClient } from '@/lib/websocket';
import { SignalMessage } from '@/types';
import { useAppStore } from '@/lib/store';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/signaling';

export function useSignaling() {
  const signalingRef = useRef<SignalingClient | null>(null);
  const [isConnected, setIsConnectedState] = useState(false);
  const handlerQueueRef = useRef<Array<{ messageType: string; handler: (message: any) => void }>>([]);

  // Get store methods directly (they are stable in Zustand)
  const setRoomId = useAppStore(state => state.setRoomId);
  const setRole = useAppStore(state => state.setRole);
  const setIsConnected = useAppStore(state => state.setIsConnected);
  const setPeerId = useAppStore(state => state.setPeerId);
  const updatePhotoData = useAppStore(state => state.updatePhotoData);
  const setPeerSelectedPhotos = useAppStore(state => state.setPeerSelectedPhotos);
  const userId = useAppStore(state => state.userId);

  const connect = useCallback(async () => {
    if (signalingRef.current?.isConnected()) {
      console.log('[Signaling] Already connected');
      return signalingRef.current;
    }

    let client: SignalingClient;

    try {
      console.log('[Signaling] Attempting to connect...');
      client = new SignalingClient(WS_URL);
      await client.connect();
      signalingRef.current = client;
      setIsConnectedState(true);
      console.log('[Signaling] Connection successful');
    } catch (error) {
      console.error('[Signaling] Connection failed:', error);
      setIsConnectedState(false);
      throw error;
    }

    // Setup message handlers
    client.on('joined', (message: any) => {
      console.log('[Signaling] Joined room:', message);
      setRoomId(message.roomId);
      setRole(message.role);
      setIsConnected(true);

      if (message.hostId) {
        setPeerId(message.hostId);
      }
    });

    client.on('peer-joined', (message: any) => {
      console.log('[Signaling] Peer joined:', message);
      setPeerId(message.userId);
    });

    client.on('peer-left', (message: any) => {
      console.log('[Signaling] Peer left:', message);
      setPeerId(null);
    });

    client.on('capture-uploaded', (message: any) => {
      console.log('[Signaling] Capture uploaded:', message);
      const { photoNumber, role, url } = message;

      updatePhotoData(photoNumber, {
        [role === 'host' ? 'hostImageUrl' : 'guestImageUrl']: url,
      });
    });

    client.on('photo-select-sync', (message: any) => {
      console.log('[Signaling] Photo selection synced:', message);
      const currentUserId = useAppStore.getState().userId;
      if (message.userId !== currentUserId) {
        setPeerSelectedPhotos(message.selectedIndices);
      }
    });

    client.on('error', (message: any) => {
      console.error('[Signaling] Error:', message.message);
      alert(`Error: ${message.message}`);
    });

    // Register all queued handlers
    console.log('[Signaling] Registering queued handlers:', handlerQueueRef.current.length);
    handlerQueueRef.current.forEach(({ messageType, handler }) => {
      client.on(messageType, handler);
      console.log('[Signaling] Registered handler for:', messageType);
    });

    return client;
  }, [setRoomId, setRole, setIsConnected, setPeerId, updatePhotoData, setPeerSelectedPhotos]);

  const disconnect = useCallback(() => {
    if (signalingRef.current) {
      signalingRef.current.disconnect();
      signalingRef.current = null;
    }
    setIsConnectedState(false);
    setIsConnected(false);
  }, [setIsConnected]);

  const sendMessage = useCallback((message: SignalMessage) => {
    if (signalingRef.current?.isConnected()) {
      signalingRef.current.send(message);
    } else {
      console.error('[Signaling] Cannot send message, not connected');
    }
  }, []);

  const on = useCallback((messageType: string, handler: (message: any) => void) => {
    if (signalingRef.current?.isConnected()) {
      // Already connected, register immediately
      signalingRef.current.on(messageType, handler);
      console.log('[Signaling] Registered handler immediately for:', messageType);
    } else {
      // Not connected yet, queue for later
      handlerQueueRef.current.push({ messageType, handler });
      console.log('[Signaling] Queued handler for:', messageType);
    }
  }, []);

  const off = useCallback((messageType: string) => {
    if (signalingRef.current) {
      signalingRef.current.off(messageType);
      console.log('[Signaling] Removed handler for:', messageType);
    }
  }, []);

  useEffect(() => {
    return () => {
      console.log('[Signaling] Cleanup on unmount');
      if (signalingRef.current) {
        signalingRef.current.disconnect();
        signalingRef.current = null;
      }
      setIsConnectedState(false);
    };
  }, []); // Empty array - only cleanup on unmount

  return {
    connect,
    disconnect,
    sendMessage,
    on,
    off,
    isConnected,
  };
}
