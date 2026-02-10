import { useEffect, useEffectEvent, useRef, useCallback, useState } from 'react';
import { WebRTCConnection, fetchIceServers } from '@/lib/webrtc';
import { useAppStore } from '@/lib/store';
import { SignalMessage } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface UseWebRTCProps {
  sendMessage: (message: SignalMessage) => void;
  on: (messageType: string, handler: (message: any) => void) => void;
}

export function useWebRTC({ sendMessage, on }: UseWebRTCProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [iceServers, setIceServers] = useState<RTCIceServer[] | null>(null);
  const webrtcRef = useRef<WebRTCConnection | null>(null);

  // Get store values directly
  const roomId = useAppStore(state => state.roomId);
  const peerId = useAppStore(state => state.peerId);
  const userId = useAppStore(state => state.userId);

  // Fetch ICE servers on mount
  useEffect(() => {
    fetchIceServers(API_URL).then(setIceServers);
  }, []);

  const initializeConnection = useCallback(() => {
    const connection = new WebRTCConnection(
      iceServers || undefined,
      (stream) => {
        console.log('[WebRTC] Remote stream received');
        setRemoteStream(stream);
      },
      (candidate) => {
        console.log('[WebRTC] ICE candidate');
        const currentState = useAppStore.getState();
        if (currentState.roomId && currentState.peerId) {
          sendMessage({
            type: 'ice',
            roomId: currentState.roomId,
            from: currentState.userId,
            to: currentState.peerId,
            candidate: candidate.toJSON(),
          });
        }
      }
    );

    webrtcRef.current = connection;
    return connection;
  }, [sendMessage, iceServers]);

  const startLocalStream = useCallback(
    async (getStreamFn: () => Promise<MediaStream>) => {
      try {
        const stream = await getStreamFn();
        setLocalStream(stream);

        if (!webrtcRef.current) {
          initializeConnection();
        }

        await webrtcRef.current!.setLocalStream(stream);
        console.log('[WebRTC] Local stream started');
        return stream;
      } catch (error) {
        console.error('[WebRTC] Error starting local stream:', error);
        throw error;
      }
    },
    [initializeConnection]
  );

  const createOffer = useCallback(async () => {
    if (!webrtcRef.current) {
      throw new Error('WebRTC connection not initialized');
    }

    const offer = await webrtcRef.current.createOffer();

    const currentState = useAppStore.getState();
    if (currentState.roomId && currentState.peerId) {
      sendMessage({
        type: 'offer',
        roomId: currentState.roomId,
        from: currentState.userId,
        to: currentState.peerId,
        sdp: offer.sdp!,
      });
    }

    return offer;
  }, [sendMessage]);

  const createAnswer = useCallback(async () => {
    if (!webrtcRef.current) {
      throw new Error('WebRTC connection not initialized');
    }

    const answer = await webrtcRef.current.createAnswer();

    const currentState = useAppStore.getState();
    if (currentState.roomId && currentState.peerId) {
      sendMessage({
        type: 'answer',
        roomId: currentState.roomId,
        from: currentState.userId,
        to: currentState.peerId,
        sdp: answer.sdp!,
      });
    }

    return answer;
  }, [sendMessage]);

  const handleOffer = useCallback(
    async (sdp: string) => {
      console.log('[WebRTC] handleOffer called');
      if (!webrtcRef.current) {
        console.log('[WebRTC] No connection, initializing');
        initializeConnection();
      }

      // Wait for local stream to be ready
      if (!localStream) {
        console.log('[WebRTC] Waiting for local stream...');
        // Retry after a short delay
        setTimeout(() => handleOffer(sdp), 500);
        return;
      }

      console.log('[WebRTC] Setting remote description');
      await webrtcRef.current!.setRemoteDescription({ type: 'offer', sdp });
      console.log('[WebRTC] Creating answer');
      await createAnswer();
    },
    [initializeConnection, createAnswer, localStream]
  );

  const handleAnswer = useCallback(async (sdp: string) => {
    if (!webrtcRef.current) {
      throw new Error('WebRTC connection not initialized');
    }

    await webrtcRef.current.setRemoteDescription({ type: 'answer', sdp });
  }, []);

  const handleIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    if (!webrtcRef.current) {
      throw new Error('WebRTC connection not initialized');
    }

    await webrtcRef.current.addIceCandidate(candidate);
  }, []);

  // Stable event handlers - always access latest closures without re-triggering useEffect
  const onOffer = useEffectEvent(async (message: any) => {
    console.log('[WebRTC] Received offer:', message);
    const currentUserId = useAppStore.getState().userId;
    if (message.to === currentUserId) {
      console.log('[WebRTC] Handling offer');
      await handleOffer(message.sdp);
    }
  });

  const onAnswer = useEffectEvent(async (message: any) => {
    console.log('[WebRTC] Received answer:', message);
    const currentUserId = useAppStore.getState().userId;
    if (message.to === currentUserId) {
      console.log('[WebRTC] Handling answer');
      await handleAnswer(message.sdp);
    }
  });

  const onIce = useEffectEvent(async (message: any) => {
    console.log('[WebRTC] Received ICE candidate');
    const currentUserId = useAppStore.getState().userId;
    if (message.to === currentUserId) {
      await handleIceCandidate(message.candidate);
    }
  });

  // Setup signaling handlers (once)
  useEffect(() => {
    console.log('[WebRTC] Setting up signaling handlers');
    on('offer', onOffer);
    on('answer', onAnswer);
    on('ice', onIce);
  }, [on]);

  // Cleanup only on unmount
  useEffect(() => {
    return () => {
      console.log('[WebRTC] Cleaning up on unmount');

      // Stop local stream
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }

      // Close WebRTC connection
      if (webrtcRef.current) {
        webrtcRef.current.close();
        webrtcRef.current = null;
      }
    };
  }, []); // 빈 배열 - 컴포넌트 unmount 시에만 실행

  const cleanup = useCallback(() => {
    console.log('[WebRTC] Manual cleanup');

    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }

    if (webrtcRef.current) {
      webrtcRef.current.close();
      webrtcRef.current = null;
    }

    setRemoteStream(null);
  }, [localStream]);

  /**
   * Reset for next guest - keeps local stream, closes WebRTC connection
   * Call this when host wants to accept a new guest
   */
  const resetForNextGuest = useCallback(async () => {
    console.log('[WebRTC] Resetting for next guest');

    // Close peer connection only - DON'T stop local stream tracks
    if (webrtcRef.current) {
      webrtcRef.current.closePeerConnection();
      webrtcRef.current = null;
    }

    // Clear remote stream
    setRemoteStream(null);

    // Re-initialize connection with existing local stream
    if (localStream) {
      const connection = initializeConnection();
      await connection.setLocalStream(localStream);
      console.log('[WebRTC] Ready for new guest');
    }
  }, [localStream, initializeConnection]);

  return {
    localStream,
    remoteStream,
    startLocalStream,
    createOffer,
    cleanup,
    resetForNextGuest,
  };
}
