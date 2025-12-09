// Import chroma key functionality from canvas-chromakey module
import { applyChromaKeyToCanvas, type ChromaKeySettings } from './canvas-chromakey';
import { getApiHeaders } from './api';

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// Fetch ICE servers from server (including TURN if configured)
export async function fetchIceServers(apiUrl: string): Promise<RTCIceServer[]> {
  try {
    const response = await fetch(`${apiUrl}/api/ice-servers`, {
      headers: getApiHeaders()
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ICE servers: ${response.status}`);
    }

    const data = await response.json();
    console.log('[WebRTC] Fetched ICE servers:', data.iceServers);
    return data.iceServers || DEFAULT_ICE_SERVERS;
  } catch (error) {
    console.error('[WebRTC] Failed to fetch ICE servers, using defaults:', error);
    return DEFAULT_ICE_SERVERS;
  }
}

export class WebRTCConnection {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;

  private onRemoteStreamCallback?: (stream: MediaStream) => void;
  private onIceCandidateCallback?: (candidate: RTCIceCandidate) => void;

  constructor(
    iceServers: RTCIceServer[] = DEFAULT_ICE_SERVERS,
    onRemoteStream?: (stream: MediaStream) => void,
    onIceCandidate?: (candidate: RTCIceCandidate) => void
  ) {
    this.onRemoteStreamCallback = onRemoteStream;
    this.onIceCandidateCallback = onIceCandidate;
    this.initializePeerConnection(iceServers);
  }

  private initializePeerConnection(iceServers: RTCIceServer[]): void {
    this.pc = new RTCPeerConnection({ iceServers });

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.onIceCandidateCallback) {
        this.onIceCandidateCallback(event.candidate);
      }
    };

    this.pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        if (this.onRemoteStreamCallback) {
          this.onRemoteStreamCallback(this.remoteStream);
        }
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE connection state:', this.pc?.iceConnectionState);
    };

    this.pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', this.pc?.connectionState);
    };
  }

  async setLocalStream(stream: MediaStream): Promise<void> {
    this.localStream = stream;

    if (!this.pc) {
      throw new Error('PeerConnection not initialized');
    }

    stream.getTracks().forEach((track) => {
      this.pc!.addTrack(track, stream);
    });

    console.log('[WebRTC] Local stream set');
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) {
      throw new Error('PeerConnection not initialized');
    }

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    console.log('[WebRTC] Offer created');
    return offer;
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) {
      throw new Error('PeerConnection not initialized');
    }

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    console.log('[WebRTC] Answer created');
    return answer;
  }

  async setRemoteDescription(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) {
      throw new Error('PeerConnection not initialized');
    }

    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    console.log('[WebRTC] Remote description set');
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) {
      throw new Error('PeerConnection not initialized');
    }

    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    console.log('[WebRTC] ICE candidate added');
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  close(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    this.remoteStream = null;
    console.log('[WebRTC] Connection closed');
  }
}

// Media capture utilities
export async function getCameraStream(constraints?: MediaStreamConstraints): Promise<MediaStream> {
  const defaultConstraints: MediaStreamConstraints = {
    video: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      facingMode: 'user'
    },
    audio: false
  };

  return await navigator.mediaDevices.getUserMedia(constraints || defaultConstraints);
}

export async function getDisplayStream(): Promise<MediaStream> {
  return await navigator.mediaDevices.getDisplayMedia({
    video: {
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    },
    audio: false
  });
}

// Canvas capture for high-resolution photos
// Re-export ChromaKeySettings type for backward compatibility
export type { ChromaKeySettings };

export async function captureStreamFrame(
  stream: MediaStream,
  chromaKey?: ChromaKeySettings
): Promise<string | null> {
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) {
    console.error('[Capture] No video track found');
    return null;
  }

  return new Promise((resolve) => {
    // Create a video element to capture frame
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;

    video.onloadedmetadata = () => {
      video.play().then(() => {
        // Wait a bit for the video to render
        setTimeout(() => {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            console.error('[Capture] Failed to get canvas context');
            resolve(null);
            return;
          }

          ctx.drawImage(video, 0, 0);

          // Apply chroma key if enabled
          if (chromaKey && chromaKey.enabled) {
            const processedCanvas = applyChromaKeyToCanvas(canvas, chromaKey);
            console.log(`[Capture] Applied chroma key: ${chromaKey.color}`);

            // Use the processed canvas for the final image
            const dataUrl = processedCanvas.toDataURL('image/png');

            video.pause();
            video.srcObject = null;

            resolve(dataUrl);
            return;
          }

          const dataUrl = canvas.toDataURL('image/png');

          console.log(`[Capture] Captured frame: ${canvas.width}x${canvas.height}`);

          video.pause();
          video.srcObject = null;

          resolve(dataUrl);
        }, 100); // Wait 100ms for video to render
      }).catch((error) => {
        console.error('[Capture] Failed to play video:', error);
        resolve(null);
      });
    };

    video.onerror = (error) => {
      console.error('[Capture] Video error:', error);
      resolve(null);
    };
  });
}
