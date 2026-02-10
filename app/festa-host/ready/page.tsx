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
  const bars = 16;
  const barLevels = Array.from({ length: bars }, (_, i) => {
    const threshold = (i / bars) * 100;
    return audioLevel > threshold;
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-3 sm:p-8 landscape:p-3 relative overflow-hidden" style={{ background: '#1B1612' }}>
      {/* Ambient gradient orbs */}
      <div
        className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(252,113,43,0.08) 0%, transparent 70%)' }}
      />
      <div
        className="absolute bottom-[-15%] left-[-10%] w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(253,147,25,0.06) 0%, transparent 70%)' }}
      />
      <div
        className="absolute top-[40%] left-[50%] w-[300px] h-[300px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(252,113,43,0.04) 0%, transparent 70%)' }}
      />

      {/* Noise texture */}
      <div className="absolute inset-0 booth-noise pointer-events-none" />

      <div className="max-w-lg w-full relative z-10">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8 landscape:mb-4 animate-slide-up">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold tracking-wider mb-4"
            style={{ background: 'rgba(252,113,43,0.12)', color: '#FC712B' }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#FC712B' }} />
            PHOTO BOOTH HOST
          </div>
          <h1 className="font-display text-3xl sm:text-4xl landscape:text-2xl font-bold text-white tracking-tight">
            촬영 준비
          </h1>
          <p className="text-white/40 text-sm mt-2">장치 설정 후 포토부스를 시작하세요</p>
        </div>

        {/* Main card - glassmorphism */}
        <div
          className="rounded-2xl p-5 sm:p-7 landscape:p-4 max-h-[75vh] overflow-y-auto booth-scroll backdrop-blur-xl animate-slide-up"
          style={{
            animationDelay: '0.1s',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          <div className="space-y-5 sm:space-y-6 landscape:space-y-4">
            {/* Device Selection */}
            <div>
              <label className="font-display text-[11px] font-bold text-white/30 uppercase tracking-wider mb-3 block">
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
                variant="dark"
              />
            </div>

            {/* Mic Test Section */}
            <div
              className="rounded-xl p-4"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`w-2.5 h-2.5 rounded-full transition-colors ${isTestingMic ? 'bg-green-400 animate-pulse' : 'bg-white/15'}`} />
                  <span className="text-sm font-semibold text-white">마이크 테스트</span>
                </div>
                <button
                  onClick={isTestingMic ? stopMicTest : startMicTest}
                  className="booth-btn px-5 py-1.5 rounded-full text-xs font-bold text-white transition touch-manipulation"
                  style={{
                    background: isTestingMic
                      ? 'rgba(255,255,255,0.1)'
                      : 'linear-gradient(135deg, #FC712B, #FD9319)',
                    boxShadow: isTestingMic ? 'none' : '0 2px 12px rgba(252,113,43,0.3)',
                  }}
                >
                  {isTestingMic ? '중지' : '테스트'}
                </button>
              </div>

              {/* Audio Level Bars */}
              <div className="flex items-end gap-[3px] h-10">
                {barLevels.map((active, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-[2px] transition-all duration-75"
                    style={{
                      height: active ? `${Math.min(100, 30 + (i / bars) * 70)}%` : '15%',
                      background: active
                        ? i < bars * 0.5
                          ? '#FC712B'
                          : i < bars * 0.75
                          ? '#FD9319'
                          : '#ef4444'
                        : 'rgba(255,255,255,0.06)',
                      boxShadow: active ? `0 0 8px ${i < bars * 0.75 ? 'rgba(252,113,43,0.3)' : 'rgba(239,68,68,0.3)'}` : 'none',
                    }}
                  />
                ))}
              </div>
              {isTestingMic && (
                <p className="text-xs text-white/30 mt-2.5">마이크에 말해보세요</p>
              )}
            </div>

            {/* Frame Selection */}
            {activeLayouts.length > 1 && (
              <div>
                <label className="font-display text-[11px] font-bold text-white/30 uppercase tracking-wider mb-3 block">
                  프레임 선택
                </label>
                <FrameSelector
                  layouts={activeLayouts}
                  selectedLayoutId={selectedFrameLayoutId}
                  onSelect={handleFrameSelect}
                  variant="dark"
                />
              </div>
            )}

            {/* V3 Mode Info */}
            <div
              className="flex items-start gap-3 p-4 rounded-xl"
              style={{
                background: 'rgba(253,147,25,0.06)',
                border: '1px solid rgba(253,147,25,0.12)',
              }}
            >
              <div
                className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center mt-0.5"
                style={{ background: 'rgba(253,147,25,0.1)' }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FD9319" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">게스트 로테이션 모드</p>
                <p className="text-xs text-white/40 mt-0.5 leading-relaxed">
                  게스트가 교체되어도 설정이 유지됩니다. 방에 입장한 후 화면 공유를 시작해주세요.
                </p>
              </div>
            </div>

            {/* Create Room Button */}
            <button
              onClick={createRoom}
              className="booth-btn w-full text-white font-display font-bold py-4 sm:py-5 landscape:py-3 rounded-xl text-base sm:text-lg landscape:text-base touch-manipulation transition-all hover:scale-[1.01] active:scale-[0.98]"
              style={{
                background: 'linear-gradient(135deg, #FC712B, #FD9319)',
                boxShadow: '0 4px 24px rgba(252,113,43,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
              }}
            >
              포토부스 시작
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
