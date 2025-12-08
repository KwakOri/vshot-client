"use client";

import { useState, useRef } from 'react';
import { splitVideo, type VideoSegment } from '@/lib/video-splitter';
import { composeTwoVideos, downloadComposedVideo } from '@/lib/video-composer';

export default function TestVideoPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState<{ blob: Blob; url: string } | null>(null);
  const [splitSegments, setSplitSegments] = useState<VideoSegment[]>([]);
  const [composedVideo, setComposedVideo] = useState<{ blob: Blob; url: string } | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [progress, setProgress] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Track actual capture timestamps
  const [captureTimestamps, setCaptureTimestamps] = useState<Array<{ photoNumber: number; start: number; end: number }>>([]);
  const recordingStartTimeRef = useRef<number>(0);

  // Start camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      streamRef.current = stream;
      setStatusMessage('카메라 시작됨');
    } catch (error) {
      console.error('Camera error:', error);
      alert('카메라에 접근할 수 없습니다.');
    }
  };

  // Record video with timestamp tracking
  const recordVideo = async () => {
    if (!streamRef.current) {
      alert('먼저 카메라를 시작해주세요.');
      return;
    }

    setIsRecording(true);
    setStatusMessage('녹화 시작...');
    setRecordedVideo(null);
    setSplitSegments([]);
    setComposedVideo(null);
    setCaptureTimestamps([]);

    const chunks: BlobPart[] = [];

    try {
      // Use canvas to capture video stream
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d')!;

      // Capture canvas stream
      const canvasStream = canvas.captureStream(30); // 30 FPS

      // Draw video to canvas continuously
      const drawInterval = setInterval(() => {
        if (videoRef.current) {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        }
      }, 1000 / 30);

      const mediaRecorder = new MediaRecorder(canvasStream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 2500000, // 2.5 Mbps
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        clearInterval(drawInterval);
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        setRecordedVideo({ blob, url });
        setIsRecording(false);
        const duration = ((Date.now() - recordingStartTimeRef.current) / 1000).toFixed(2);
        setStatusMessage(`녹화 완료! (${duration}초, ${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      recordingStartTimeRef.current = Date.now();

      // Simulate 2 captures at different times
      // Capture 1: 0s - 2s
      const capture1Start = (Date.now() - recordingStartTimeRef.current) / 1000;
      setStatusMessage('캡처 1/2 녹화 중... (2초)');

      setTimeout(() => {
        const capture1End = (Date.now() - recordingStartTimeRef.current) / 1000;
        setCaptureTimestamps(prev => [...prev, { photoNumber: 1, start: capture1Start, end: capture1End }]);
        console.log(`Capture 1: ${capture1Start.toFixed(3)}s - ${capture1End.toFixed(3)}s`);

        // Capture 2: 2s - 4s
        setStatusMessage('캡처 2/2 녹화 중... (2초)');
        const capture2Start = (Date.now() - recordingStartTimeRef.current) / 1000;

        setTimeout(() => {
          const capture2End = (Date.now() - recordingStartTimeRef.current) / 1000;
          setCaptureTimestamps(prev => [...prev, { photoNumber: 2, start: capture2Start, end: capture2End }]);
          console.log(`Capture 2: ${capture2Start.toFixed(3)}s - ${capture2End.toFixed(3)}s`);

          setStatusMessage('녹화 종료 중...');

          // Stop recording after both captures
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
        }, 2000); // 2 seconds for capture 2
      }, 2000); // 2 seconds for capture 1

    } catch (error) {
      console.error('Recording error:', error);
      setIsRecording(false);
      setStatusMessage('녹화 실패');
      alert('녹화에 실패했습니다.');
    }
  };

  // Split video into 2 segments using actual timestamps
  const handleSplit = async () => {
    if (!recordedVideo) {
      alert('먼저 영상을 녹화해주세요.');
      return;
    }

    if (captureTimestamps.length === 0) {
      alert('캡처 타임스탬프가 없습니다.');
      return;
    }

    setStatusMessage('영상 분할 중...');
    setProgress('');

    try {
      console.log('Splitting with timestamps:', captureTimestamps);

      const segments = await splitVideo(
        recordedVideo.blob,
        captureTimestamps, // Use actual timestamps
        (prog, current, total) => {
          setProgress(`분할 진행: ${current}/${total} (${prog.toFixed(0)}%)`);
        }
      );

      setSplitSegments(segments);
      setStatusMessage(`분할 완료! ${segments.length}개 구간`);
      setProgress('');
      console.log('Split segments:', segments);
    } catch (error) {
      console.error('Split error:', error);
      setStatusMessage('분할 실패');
      alert('영상 분할에 실패했습니다: ' + (error instanceof Error ? error.message : ''));
    }
  };

  // Compose 2 videos side-by-side
  const handleCompose = async () => {
    if (splitSegments.length !== 2) {
      alert('먼저 영상을 분할해주세요.');
      return;
    }

    setStatusMessage('영상 합성 중...');
    setProgress('');

    try {
      const composedBlob = await composeTwoVideos(
        splitSegments,
        {
          width: 1280,
          height: 720,
          frameRate: 30,
        },
        (msg) => {
          setProgress(msg);
        }
      );

      const url = URL.createObjectURL(composedBlob);
      setComposedVideo({ blob: composedBlob, url });
      setStatusMessage(`합성 완료! (${(composedBlob.size / 1024 / 1024).toFixed(2)} MB)`);
      setProgress('');
    } catch (error) {
      console.error('Compose error:', error);
      setStatusMessage('합성 실패');
      setProgress('');
      alert('영상 합성에 실패했습니다: ' + (error instanceof Error ? error.message : ''));
    }
  };

  // Download composed video
  const handleDownload = () => {
    if (!composedVideo) {
      alert('먼저 영상을 합성해주세요.');
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    downloadComposedVideo(composedVideo.blob, `test-video-${timestamp}.mp4`);
    setStatusMessage('다운로드 완료!');
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-center">영상 처리 테스트</h1>

        {/* Status */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <div className="text-lg font-semibold">{statusMessage || '준비'}</div>
          {progress && <div className="text-sm text-gray-400 mt-1">{progress}</div>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column - Camera and controls */}
          <div className="space-y-6">
            {/* Camera preview */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h2 className="text-xl font-semibold mb-4">카메라</h2>
              <div className="relative bg-black rounded-lg overflow-hidden aspect-video mb-4">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              </div>
              <button
                onClick={startCamera}
                className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition"
              >
                카메라 시작
              </button>
            </div>

            {/* Controls */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h2 className="text-xl font-semibold mb-4">제어</h2>
              <div className="space-y-3">
                <button
                  onClick={recordVideo}
                  disabled={isRecording}
                  className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition disabled:opacity-50"
                >
                  {isRecording ? '녹화 중... (4초)' : '4초 녹화 시작'}
                </button>

                <button
                  onClick={handleSplit}
                  disabled={!recordedVideo}
                  className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition disabled:opacity-50"
                >
                  2개로 분할 (각 2초)
                </button>

                <button
                  onClick={handleCompose}
                  disabled={splitSegments.length !== 2}
                  className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition disabled:opacity-50"
                >
                  Side-by-Side 합성
                </button>

                <button
                  onClick={handleDownload}
                  disabled={!composedVideo}
                  className="w-full px-4 py-3 bg-pink-600 hover:bg-pink-700 rounded-lg font-semibold transition disabled:opacity-50"
                >
                  MP4 다운로드
                </button>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h2 className="text-xl font-semibold mb-2">사용 방법</h2>
              <ol className="text-sm space-y-2 list-decimal list-inside text-gray-300">
                <li>카메라 시작 버튼을 클릭합니다</li>
                <li>4초 녹화 시작 버튼을 클릭합니다 (4초간 녹화)</li>
                <li>2개로 분할 버튼을 클릭합니다 (각 2초씩 분할)</li>
                <li>Side-by-Side 합성 버튼을 클릭합니다</li>
                <li>MP4 다운로드 버튼을 클릭합니다</li>
              </ol>
            </div>
          </div>

          {/* Right column - Results */}
          <div className="space-y-6">
            {/* Recorded video */}
            {recordedVideo && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h2 className="text-xl font-semibold mb-4">녹화된 영상 (4초)</h2>
                <video
                  src={recordedVideo.url}
                  controls
                  className="w-full rounded-lg bg-black"
                />
                <div className="mt-2 text-sm text-gray-400">
                  크기: {(recordedVideo.blob.size / 1024 / 1024).toFixed(2)} MB
                </div>
              </div>
            )}

            {/* Split segments */}
            {splitSegments.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h2 className="text-xl font-semibold mb-4">분할된 영상 (각 2초)</h2>
                <div className="grid grid-cols-2 gap-4">
                  {splitSegments.map((segment) => (
                    <div key={segment.photoNumber} className="bg-gray-700 rounded-lg overflow-hidden">
                      <video
                        src={segment.url}
                        controls
                        className="w-full aspect-video bg-black"
                      />
                      <div className="p-2">
                        <div className="text-sm font-medium">영상 #{segment.photoNumber}</div>
                        <div className="text-xs text-gray-400">
                          {(segment.blob.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Composed video */}
            {composedVideo && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h2 className="text-xl font-semibold mb-4">합성된 영상 (MP4)</h2>
                <video
                  src={composedVideo.url}
                  controls
                  className="w-full rounded-lg bg-black"
                />
                <div className="mt-2 space-y-1">
                  <div className="text-sm text-green-400 font-semibold">✓ MP4 형식으로 변환 완료</div>
                  <div className="text-sm text-gray-400">
                    크기: {(composedVideo.blob.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
