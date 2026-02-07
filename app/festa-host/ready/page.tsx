'use client';

import { DeviceSelector } from '@/components';
import { FrameSelector } from '@/components/v3/FrameSelector';
import { getActiveLayouts } from '@/constants/frame-layouts';
import { useMediaDevices } from '@/hooks/useMediaDevices';
import { useAppStore } from '@/lib/store';
import { FrameLayout } from '@/types';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

export default function HostV3ReadyPage() {
  const router = useRouter();
  const store = useAppStore();
  const { audioDevices, audioOutputDevices, refreshDevices } = useMediaDevices();

  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  // Device selection
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string | null>(
    store.selectedAudioDeviceId
  );
  const [selectedAudioOutputDeviceId, setSelectedAudioOutputDeviceId] = useState<string | null>(
    store.selectedAudioOutputDeviceId
  );

  // Frame selection
  const activeLayouts = getActiveLayouts();
  const [selectedFrameLayoutId, setSelectedFrameLayoutId] = useState<string>(
    store.selectedFrameLayoutId
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
      refreshDevices();

      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.3;
      source.connect(analyserRef.current);

      const dataArray = new Uint8Array(analyserRef.current.fftSize);

      const updateLevel = () => {
        if (analyserRef.current) {
          analyserRef.current.getByteTimeDomainData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const normalized = (dataArray[i] - 128) / 128;
            sum += normalized * normalized;
          }
          const rms = Math.sqrt(sum / dataArray.length);
          const scaledLevel = Math.min(100, rms * 300);
          setAudioLevel(scaledLevel);
        }
        animationRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (error) {
      console.error('[Host V3 Ready] Mic error:', error);
      alert('마이크에 접근할 수 없습니다.');
    }
  };

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

  const handleFrameSelect = (layout: FrameLayout) => {
    setSelectedFrameLayoutId(layout.id);
  };

  const createRoom = () => {
    store.setSelectedAudioDeviceId(selectedAudioDeviceId);
    store.setSelectedAudioOutputDeviceId(selectedAudioOutputDeviceId);
    store.setSelectedFrameLayoutId(selectedFrameLayoutId);
    store.setRole('host');

    stopMicTest();
    router.push('/festa-host/room');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMicTest();
    };
  }, []);

  // Audio level bars for visualization
  const bars = 12;
  const barLevels = Array.from({ length: bars }, (_, i) => {
    const threshold = (i / bars) * 100;
    return audioLevel > threshold;
  });

  return (
    <div className="min-h-screen bg-light text-dark flex items-center justify-center p-3 sm:p-8 landscape:p-3 relative overflow-hidden booth-noise">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-[0.04] pointer-events-none"
        style={{ background: 'radial-gradient(circle, #FC712B, transparent 70%)' }} />
      <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-[0.03] pointer-events-none"
        style={{ background: 'radial-gradient(circle, #FD9319, transparent 70%)' }} />

      <div className="max-w-lg w-full relative z-10">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8 landscape:mb-4 animate-slide-up">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            PHOTO BOOTH HOST
          </div>
          <h1 className="font-display text-2xl sm:text-4xl landscape:text-2xl font-bold text-dark tracking-tight">
            촬영 준비
          </h1>
          <p className="text-dark/50 text-sm mt-1">장치 설정 후 포토부스를 시작하세요</p>
        </div>

        <div className="booth-card p-5 sm:p-7 landscape:p-4 max-h-[75vh] overflow-y-auto booth-scroll animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="space-y-5 sm:space-y-6 landscape:space-y-4">
            {/* Device Selection */}
            <div>
              <label className="font-display text-xs font-semibold text-dark/40 uppercase tracking-wider mb-3 block">
                오디오 장치
              </label>
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
            </div>

            {/* Mic Test Section */}
            <div className="bg-light/60 rounded-xl p-4 border border-neutral/50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full transition-colors ${isTestingMic ? 'bg-green-500' : 'bg-neutral'}`} />
                  <span className="text-sm font-semibold text-dark">마이크 테스트</span>
                </div>
                <button
                  onClick={isTestingMic ? stopMicTest : startMicTest}
                  className={`booth-btn px-4 py-1.5 rounded-full text-xs font-bold transition touch-manipulation ${
                    isTestingMic
                      ? 'bg-dark/80 hover:bg-dark text-white'
                      : 'bg-primary hover:bg-primary-dark text-white'
                  }`}
                >
                  {isTestingMic ? '중지' : '테스트'}
                </button>
              </div>

              {/* Audio Level Bars */}
              <div className="flex items-end gap-1 h-8">
                {barLevels.map((active, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm transition-all duration-75"
                    style={{
                      height: active ? `${Math.min(100, 40 + (i / bars) * 60)}%` : '20%',
                      backgroundColor: active
                        ? i < bars * 0.6
                          ? '#FC712B'
                          : i < bars * 0.8
                          ? '#FD9319'
                          : '#ef4444'
                        : '#E2D4C4',
                      opacity: active ? 1 : 0.4,
                    }}
                  />
                ))}
              </div>
              {isTestingMic && (
                <p className="text-xs text-dark/40 mt-2">마이크에 말해보세요</p>
              )}
            </div>

            {/* Frame Selection */}
            {activeLayouts.length > 1 && (
              <div>
                <label className="font-display text-xs font-semibold text-dark/40 uppercase tracking-wider mb-3 block">
                  프레임 선택
                </label>
                <FrameSelector
                  layouts={activeLayouts}
                  selectedLayoutId={selectedFrameLayoutId}
                  onSelect={handleFrameSelect}
                />
              </div>
            )}

            {/* V3 Mode Info */}
            <div className="flex items-start gap-3 p-3 rounded-xl bg-secondary/5 border border-secondary/15">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center mt-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FD9319" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-dark">게스트 로테이션 모드</p>
                <p className="text-xs text-dark/50 mt-0.5 leading-relaxed">
                  게스트가 교체되어도 설정이 유지됩니다. 방에 입장한 후 화면 공유를 시작해주세요.
                </p>
              </div>
            </div>

            {/* Create Room Button */}
            <button
              onClick={createRoom}
              className="booth-btn w-full bg-primary hover:bg-primary-dark text-white font-display font-bold py-4 sm:py-5 landscape:py-3 rounded-xl text-base sm:text-lg landscape:text-base shadow-lg shadow-primary/20 touch-manipulation"
            >
              포토부스 시작
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
