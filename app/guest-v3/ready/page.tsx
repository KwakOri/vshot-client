'use client';

import { DeviceSelector } from '@/components';
import { useMediaDevices } from '@/hooks/useMediaDevices';
import { useAppStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

export default function GuestV3ReadyPage() {
  const router = useRouter();
  const store = useAppStore();
  const { videoDevices, audioDevices, audioOutputDevices, refreshDevices } = useMediaDevices();

  const [roomIdInput, setRoomIdInput] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraLoading, setIsCameraLoading] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [showSettings, setShowSettings] = useState(false);

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

  const startPreview = async (videoDeviceId?: string | null, audioDeviceId?: string | null) => {
    try {
      setIsCameraLoading(true);

      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }

      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      };
      const deviceId = videoDeviceId ?? selectedVideoDeviceId;
      if (deviceId) {
        videoConstraints.deviceId = { exact: deviceId };
      }

      const audioDevice = audioDeviceId ?? selectedAudioDeviceId;
      const audioConstraints: MediaTrackConstraints | boolean = audioDevice
        ? { deviceId: { exact: audioDevice } }
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
      refreshDevices();
    } catch (error) {
      console.error('[Guest V3 Ready] Camera error:', error);
      setIsCameraActive(false);
    } finally {
      setIsCameraLoading(false);
    }
  };

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (!store.userId) {
      const userId = uuidv4();
      store.setUserId(userId);
    }

    startPreview();
  }, []);

  const handleVideoDeviceChange = (deviceId: string | null) => {
    setSelectedVideoDeviceId(deviceId);
    startPreview(deviceId, selectedAudioDeviceId);
  };

  const handleAudioDeviceChange = (deviceId: string | null) => {
    setSelectedAudioDeviceId(deviceId);
    startPreview(selectedVideoDeviceId, deviceId);
  };

  const joinRoom = () => {
    if (!roomIdInput.trim()) {
      alert('Room ID를 입력해주세요.');
      return;
    }

    if (!isCameraActive) {
      alert('카메라가 활성화되지 않았습니다. 카메라 권한을 확인해주세요.');
      return;
    }

    store.setSelectedVideoDeviceId(selectedVideoDeviceId);
    store.setSelectedAudioDeviceId(selectedAudioDeviceId);
    store.setSelectedAudioOutputDeviceId(selectedAudioOutputDeviceId);
    store.setRoomId(roomIdInput.trim().toUpperCase());
    store.setRole('guest');

    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }

    router.push('/guest-v3/room');
  };

  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [localStream]);

  return (
    <div className="flex flex-col h-full p-3 gap-3 overflow-hidden bg-light">
      {/* Top bar - Room ID input */}
      <div className="flex-shrink-0 bg-white border-2 border-neutral rounded-lg p-2 shadow-md">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg transition ${
              showSettings ? 'bg-primary text-white' : 'bg-neutral/40 hover:bg-neutral'
            }`}
            title="장치 설정"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          <input
            type="text"
            value={roomIdInput}
            onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
            placeholder="Room ID 입력"
            maxLength={6}
            className="flex-1 min-w-0 px-3 py-2 bg-neutral/40 border-2 border-neutral rounded-lg text-dark text-center text-lg font-bold tracking-widest focus:outline-none focus:border-primary"
            onKeyDown={(e) => {
              if (e.key === 'Enter') joinRoom();
            }}
          />

          <button
            onClick={joinRoom}
            disabled={!roomIdInput.trim() || !isCameraActive}
            className="flex-shrink-0 px-4 py-2 bg-secondary hover:bg-secondary-dark text-white font-bold rounded-lg disabled:opacity-50 transition shadow-md"
          >
            입장
          </button>
        </div>

        {/* V3 badge */}
        <div className="flex justify-center mt-1">
          <span className="text-xs text-primary font-semibold">v3</span>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="flex-shrink-0 bg-white border-2 border-neutral rounded-lg p-3 shadow-md">
          <DeviceSelector
            videoDevices={videoDevices}
            audioDevices={audioDevices}
            audioOutputDevices={audioOutputDevices}
            selectedVideoDeviceId={selectedVideoDeviceId}
            selectedAudioDeviceId={selectedAudioDeviceId}
            selectedAudioOutputDeviceId={selectedAudioOutputDeviceId}
            onVideoDeviceChange={handleVideoDeviceChange}
            onAudioDeviceChange={handleAudioDeviceChange}
            onAudioOutputDeviceChange={setSelectedAudioOutputDeviceId}
            showSpeaker={true}
            disabled={false}
          />
        </div>
      )}

      {/* Video preview */}
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

          {isCameraLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
                <span className="text-white text-sm">카메라 로딩 중...</span>
              </div>
            </div>
          )}

          {!isCameraLoading && !isCameraActive && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10">
              <div className="flex flex-col items-center gap-3 text-center px-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
                <span className="text-white text-sm">카메라에 접근할 수 없습니다</span>
                <button
                  onClick={() => startPreview()}
                  className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg text-sm font-semibold transition"
                >
                  다시 시도
                </button>
              </div>
            </div>
          )}

          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>
      </div>

      <div className="flex-shrink-0 text-center">
        <p className="text-xs text-dark/60">
          Room ID를 입력하고 입장 버튼을 눌러주세요
        </p>
      </div>
    </div>
  );
}
