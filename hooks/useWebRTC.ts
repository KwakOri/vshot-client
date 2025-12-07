import { useEffect, useRef, useCallback, useState } from 'react';
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

  // Setup signaling handlers
  useEffect(() => {
    console.log('[WebRTC] Setting up signaling handlers');

    on('offer', async (message: any) => {
      console.log('[WebRTC] Received offer:', message);
      const currentUserId = useAppStore.getState().userId;
      console.log('[WebRTC] Current userId:', currentUserId, 'Message to:', message.to);
      if (message.to === currentUserId) {
        console.log('[WebRTC] Handling offer');
        await handleOffer(message.sdp);
      } else {
        console.log('[WebRTC] Ignoring offer (not for me)');
      }
    });

    on('answer', async (message: any) => {
      console.log('[WebRTC] Received answer:', message);
      const currentUserId = useAppStore.getState().userId;
      if (message.to === currentUserId) {
        console.log('[WebRTC] Handling answer');
        await handleAnswer(message.sdp);
      }
    });

    on('ice', async (message: any) => {
      console.log('[WebRTC] Received ICE candidate');
      const currentUserId = useAppStore.getState().userId;
      if (message.to === currentUserId) {
        await handleIceCandidate(message.candidate);
      }
    });
  }, [on, handleOffer, handleAnswer, handleIceCandidate]);

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

  return {
    localStream,
    remoteStream,
    startLocalStream,
    createOffer,
    cleanup,
  };
}
