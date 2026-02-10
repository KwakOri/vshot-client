'use client';

import { DeviceSelector } from '@/components';
import { useMediaDevices } from '@/hooks/useMediaDevices';
import { useAppStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

export default function HostReadyPage() {
  const router = useRouter();
  const store = useAppStore();
  const { audioDevices, audioOutputDevices, refreshDevices } = useMediaDevices();

  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  // Local state synced with store
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string | null>(
    store.selectedAudioDeviceId
  );
  const [selectedAudioOutputDeviceId, setSelectedAudioOutputDeviceId] = useState<string | null>(
    store.selectedAudioOutputDeviceId
  );

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const initializedRef = useRef(false);

  // Initialize user ID
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (!store.userId) {
      const userId = uuidv4();
      store.setUserId(userId);
    }
  }, [store]);

  // Test microphone
  const startMicTest = async () => {
    try {
      const audioConstraints: boolean | MediaTrackConstraints = selectedAudioDeviceId
        ? { deviceId: { exact: selectedAudioDeviceId } }
        : true;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });

      setMicStream(stream);
      setIsTestingMic(true);

      // Refresh devices after permission granted
      refreshDevices();

      // Setup audio level monitoring
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.3; // 빠른 반응을 위해 낮은 값 설정
      source.connect(analyserRef.current);

      const dataArray = new Uint8Array(analyserRef.current.fftSize);

      const updateLevel = () => {
        if (analyserRef.current) {
          // 시간 도메인 데이터 사용 (파형 데이터)
          analyserRef.current.getByteTimeDomainData(dataArray);

          // RMS (Root Mean Square) 계산 - 실제 음량을 더 정확하게 반영
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const normalized = (dataArray[i] - 128) / 128; // -1 ~ 1 범위로 정규화
            sum += normalized * normalized;
          }
          const rms = Math.sqrt(sum / dataArray.length);

          // 0-100 범위로 스케일링 (민감도 조정)
          const scaledLevel = Math.min(100, rms * 300);
          setAudioLevel(scaledLevel);
        }
        animationRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      console.log('[Host Ready] Mic test started');
    } catch (error) {
      console.error('[Host Ready] Mic error:', error);
      alert('마이크에 접근할 수 없습니다.');
    }
  };

  // Stop mic test
  const stopMicTest = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (micStream) {
      micStream.getTracks().forEach((track) => track.stop());
      setMicStream(null);
    }
    setIsTestingMic(false);
    setAudioLevel(0);
  };

  // Create room and proceed
  const createRoom = () => {
    // Save device selections to store
    store.setSelectedAudioDeviceId(selectedAudioDeviceId);
    store.setSelectedAudioOutputDeviceId(selectedAudioOutputDeviceId);
    store.setRole('host');

    // Stop mic test if running
    stopMicTest();

    // Navigate to room
    router.push('/legacy-host/room');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMicTest();
    };
  }, []);

  return (
    <div className="min-h-screen bg-dark text-light flex items-center justify-center p-3 sm:p-8 landscape:p-3">
      <div className="max-w-md w-full bg-white border-2 border-neutral rounded-2xl shadow-lg p-4 sm:p-8 landscape:p-4">
        <h1 className="text-xl sm:text-3xl landscape:text-xl font-bold mb-3 sm:mb-6 landscape:mb-3 text-center text-dark">
          Host 설정
        </h1>

        <div className="space-y-4 sm:space-y-6 landscape:space-y-4">
          {/* Device Selection (Microphone + Speaker only) */}
          <DeviceSelector
            videoDevices={[]}
            audioDevices={audioDevices}
            audioOutputDevices={audioOutputDevices}
            selectedVideoDeviceId={null}
            selectedAudioDeviceId={selectedAudioDeviceId}
            selectedAudioOutputDeviceId={selectedAudioOutputDeviceId}
            onVideoDeviceChange={() => {}}
            onAudioDeviceChange={setSelectedAudioDeviceId}
            onAudioOutputDeviceChange={setSelectedAudioOutputDeviceId}
            showCamera={false}
            showMicrophone={true}
            showSpeaker={true}
            disabled={isTestingMic}
          />

          {/* Mic Test Section */}
          <div className="bg-neutral/20 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-dark">마이크 테스트</span>
              <button
                onClick={isTestingMic ? stopMicTest : startMicTest}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
                  isTestingMic
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-primary hover:bg-primary-dark text-white'
                }`}
              >
                {isTestingMic ? '테스트 중지' : '테스트 시작'}
              </button>
            </div>

            {/* Audio Level Meter */}
            <div className="h-3 bg-neutral rounded-full overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${audioLevel}%` }}
              />
            </div>
            {isTestingMic && (
              <p className="text-xs text-dark/60 mt-1">마이크에 말해보세요...</p>
            )}
          </div>

          {/* Info */}
          <div className="bg-secondary/10 rounded-lg p-3 border border-secondary/30">
            <p className="text-sm text-dark/80">
              Host는 <strong>화면 공유</strong>를 사용합니다.<br />
              방에 입장한 후 화면 공유를 시작해주세요.
            </p>
          </div>

          <button
            onClick={createRoom}
            className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3 sm:py-5 landscape:py-3 rounded-lg text-base sm:text-lg landscape:text-base transition shadow-md active:scale-95 touch-manipulation"
          >
            방 만들기
          </button>
        </div>
      </div>
    </div>
  );
}
