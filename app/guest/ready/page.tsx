'use client';

import { DeviceSelector } from '@/components';
import { useMediaDevices } from '@/hooks/useMediaDevices';
import { useAppStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

export default function GuestReadyPage() {
  const router = useRouter();
  const store = useAppStore();
  const { videoDevices, audioDevices, audioOutputDevices, refreshDevices } = useMediaDevices();

  const [roomIdInput, setRoomIdInput] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  // Local state synced with store
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string | null>(
    store.selectedVideoDeviceId
  );
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string | null>(
    store.selectedAudioDeviceId
  );
  const [selectedAudioOutputDeviceId, setSelectedAudioOutputDeviceId] = useState<string | null>(
    store.selectedAudioOutputDeviceId
  );

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const initializedRef = useRef(false);

  // Initialize user ID
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (!store.userId) {
      const userId = uuidv4();
      store.setUserId(userId);
    }

    // Check if we have an existing room (after refresh)
    const existingRoomId = store.roomId;
    const existingRole = store.role;

    if (existingRoomId && existingRole === 'guest') {
      setRoomIdInput(existingRoomId);
    }
  }, [store]);

  // Start camera preview
  const startPreview = async () => {
    try {
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      };
      if (selectedVideoDeviceId) {
        videoConstraints.deviceId = { exact: selectedVideoDeviceId };
      }

      const audioConstraints: MediaTrackConstraints | boolean = selectedAudioDeviceId
        ? { deviceId: { exact: selectedAudioDeviceId } }
        : true;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: audioConstraints,
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      setLocalStream(stream);
      setIsCameraActive(true);

      // Refresh devices after permission granted to get labels
      refreshDevices();

      console.log('[Guest Ready] Camera preview started');
    } catch (error) {
      console.error('[Guest Ready] Camera error:', error);
      alert('카메라에 접근할 수 없습니다.');
    }
  };

  // Stop camera preview
  const stopPreview = () => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
      setIsCameraActive(false);
    }
  };

  // Join room
  const joinRoom = () => {
    if (!roomIdInput.trim()) {
      alert('Room ID를 입력해주세요.');
      return;
    }

    if (!isCameraActive) {
      alert('먼저 카메라를 시작해주세요.');
      return;
    }

    // Save device selections to store
    store.setSelectedVideoDeviceId(selectedVideoDeviceId);
    store.setSelectedAudioDeviceId(selectedAudioDeviceId);
    store.setSelectedAudioOutputDeviceId(selectedAudioOutputDeviceId);

    // Save room info
    store.setRoomId(roomIdInput.trim().toUpperCase());
    store.setRole('guest');

    // Stop preview stream (will be restarted in room page)
    stopPreview();

    // Navigate to room
    router.push('/guest/room');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [localStream]);

  // Step 1: Device selection (camera not started yet)
  if (!isCameraActive) {
    return (
      <div className="min-h-screen bg-light text-dark flex items-center justify-center p-3 sm:p-8 landscape:p-3">
        <div className="max-w-md w-full bg-white border-2 border-neutral rounded-2xl shadow-lg p-4 sm:p-8 landscape:p-4">
          <h1 className="text-xl sm:text-3xl landscape:text-xl font-bold mb-3 sm:mb-6 landscape:mb-3 text-center text-dark">
            Guest 입장
          </h1>

          <div className="space-y-4 sm:space-y-6 landscape:space-y-4">
            {/* Device Selection */}
            <DeviceSelector
              videoDevices={videoDevices}
              audioDevices={audioDevices}
              audioOutputDevices={audioOutputDevices}
              selectedVideoDeviceId={selectedVideoDeviceId}
              selectedAudioDeviceId={selectedAudioDeviceId}
              selectedAudioOutputDeviceId={selectedAudioOutputDeviceId}
              onVideoDeviceChange={setSelectedVideoDeviceId}
              onAudioDeviceChange={setSelectedAudioDeviceId}
              onAudioOutputDeviceChange={setSelectedAudioOutputDeviceId}
              showSpeaker={true}
              disabled={false}
            />

            <button
              onClick={startPreview}
              className="w-full bg-secondary hover:bg-secondary-dark text-white font-bold py-3 sm:py-5 landscape:py-3 rounded-lg text-base sm:text-lg landscape:text-base transition shadow-md active:scale-95 touch-manipulation"
            >
              카메라 시작
            </button>

            <div className="text-[10px] sm:text-xs landscape:text-[10px] text-dark/70 text-center font-medium">
              카메라를 시작하고 Room ID를 입력해주세요
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Camera preview + Room ID input
  return (
    <div className="flex flex-col h-full p-3 gap-3 overflow-hidden">
      {/* Room join form - fixed height at top */}
      <div className="flex-shrink-0 bg-white border-2 border-neutral rounded-lg p-2 shadow-md">
        <div className="flex items-center gap-2">
          {/* Back button */}
          <button
            onClick={stopPreview}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-neutral/40 hover:bg-neutral rounded-lg transition"
            title="뒤로가기"
          >
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
          </button>

          {/* Room ID input */}
          <input
            type="text"
            value={roomIdInput}
            onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
            placeholder="Room ID"
            maxLength={6}
            className="flex-1 min-w-0 px-3 py-2 bg-neutral/40 border-2 border-neutral rounded-lg text-dark text-center text-lg font-bold tracking-widest focus:outline-none focus:border-primary"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                joinRoom();
              }
            }}
          />

          {/* Join button */}
          <button
            onClick={joinRoom}
            disabled={!roomIdInput.trim()}
            className="flex-shrink-0 px-4 py-2 bg-secondary hover:bg-secondary-dark text-white font-bold rounded-lg disabled:opacity-50 transition shadow-md"
          >
            입장
          </button>
        </div>
      </div>

      {/* Video preview - flexible height */}
      <div className="flex-1 min-h-0 bg-gray-800 rounded-lg p-2 flex items-center justify-center">
        <div
          className="relative bg-black rounded-lg overflow-hidden h-full"
          style={{ aspectRatio: '2/3' }}
        >
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `
                linear-gradient(45deg, #333 25%, transparent 25%),
                linear-gradient(-45deg, #333 25%, transparent 25%),
                linear-gradient(45deg, transparent 75%, #333 75%),
                linear-gradient(-45deg, transparent 75%, #333 75%)
              `,
              backgroundSize: '20px 20px',
              backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
            }}
          />
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>
      </div>
    </div>
  );
}
