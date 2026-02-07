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

  const isReady = roomIdInput.trim().length > 0 && isCameraActive;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-dark relative">
      {/* Camera preview - full background */}
      <div className="flex-1 min-h-0 relative">
        {/* Checkerboard pattern behind video */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(45deg, #222 25%, transparent 25%),
              linear-gradient(-45deg, #222 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #222 75%),
              linear-gradient(-45deg, transparent 75%, #222 75%)
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
          style={{ transform: store.guestFlipHorizontal ? 'scaleX(-1)' : 'none' }}
        />

        {/* Loading overlay */}
        {isCameraLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark/70 z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-white/80 text-sm font-medium">카메라 준비 중...</span>
            </div>
          </div>
        )}

        {/* Camera error overlay */}
        {!isCameraLoading && !isCameraActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark/80 z-10">
            <div className="flex flex-col items-center gap-4 text-center px-6">
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/60">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              </div>
              <div>
                <p className="text-white font-semibold text-sm">카메라에 접근할 수 없습니다</p>
                <p className="text-white/40 text-xs mt-1">카메라 권한을 확인해주세요</p>
              </div>
              <button
                onClick={() => startPreview()}
                className="booth-btn px-6 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-full text-sm font-bold transition"
              >
                다시 시도
              </button>
            </div>
          </div>
        )}

        {/* Top gradient overlay */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-dark/60 to-transparent z-10 pointer-events-none" />
        {/* Bottom gradient overlay */}
        <div className="absolute bottom-0 inset-x-0 h-48 bg-gradient-to-t from-dark/80 to-transparent z-10 pointer-events-none" />

        {/* Top bar - overlaid on video */}
        <div className="absolute top-0 inset-x-0 z-20 p-3">
          <div className="flex items-center gap-2">
            {/* Settings button */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full backdrop-blur-md transition ${
                showSettings ? 'bg-primary text-white' : 'bg-white/15 hover:bg-white/25 text-white'
              }`}
              title="장치 설정"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>

            <div className="flex-1" />

            {/* Flip toggle */}
            <button
              onClick={() => store.setGuestFlipHorizontal(!store.guestFlipHorizontal)}
              className={`flex-shrink-0 h-10 px-4 flex items-center justify-center rounded-full backdrop-blur-md text-xs font-bold transition ${
                store.guestFlipHorizontal
                  ? 'bg-primary text-white'
                  : 'bg-white/15 hover:bg-white/25 text-white'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
                <polyline points="7 23 7 1" />
                <polyline points="17 1 17 23" />
                <polyline points="11 5 7 1 3 5" />
                <polyline points="21 19 17 23 13 19" />
              </svg>
              반전
            </button>
          </div>
        </div>

        {/* Settings panel - floating overlay */}
        {showSettings && (
          <div className="absolute top-16 left-3 right-3 z-30 animate-slide-up">
            <div className="booth-card p-4 backdrop-blur-md">
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
          </div>
        )}
      </div>

      {/* Bottom entry panel - overlaid */}
      <div className="absolute bottom-0 inset-x-0 z-20 p-4 pb-6">
        <div className="animate-slide-up">
          {/* Room ID input row */}
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
                placeholder="ROOM ID"
                maxLength={6}
                className="w-full px-4 py-3.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white text-center text-lg font-display font-bold tracking-[0.3em] placeholder:text-white/30 placeholder:tracking-[0.3em] focus:outline-none focus:border-primary focus:bg-white/15 transition"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') joinRoom();
                }}
              />
            </div>
          </div>

          {/* Join button */}
          <button
            onClick={joinRoom}
            disabled={!isReady}
            className="booth-btn w-full py-4 rounded-xl font-display font-bold text-base shadow-lg touch-manipulation transition-all disabled:opacity-30 disabled:pointer-events-none"
            style={{
              background: isReady
                ? 'linear-gradient(135deg, #FC712B 0%, #FD9319 100%)'
                : 'rgba(255,255,255,0.1)',
              color: 'white',
              boxShadow: isReady ? '0 8px 24px rgba(252, 113, 43, 0.3)' : 'none',
            }}
          >
            포토부스 입장
          </button>

          <p className="text-center text-white/30 text-xs mt-3">
            Room ID를 입력하고 입장하세요
          </p>
        </div>
      </div>
    </div>
  );
}
