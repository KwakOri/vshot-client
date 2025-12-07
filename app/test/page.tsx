'use client';

import { useEffect, useRef, useState } from 'react';

export default function TestPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [chromaKeyEnabled, setChromaKeyEnabled] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const animationFrameRef = useRef<number>();

  // 크로마키 설정값
  const [sensitivity, setSensitivity] = useState(50);
  const [smoothness, setSmoothness] = useState(10);

  // 카메라 시작
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      setStream(mediaStream);
      setIsCameraActive(true);
    } catch (error) {
      console.error('카메라 접근 실패:', error);
      alert('카메라에 접근할 수 없습니다.');
    }
  };

  // 카메라 중지
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setIsCameraActive(false);
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  // 크로마키 처리 함수
  const processChromaKey = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // 캔버스 크기를 비디오 크기에 맞춤
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const draw = () => {
      if (!video || !canvas || !ctx) return;

      // 비디오를 캔버스에 그리기
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      if (chromaKeyEnabled) {
        // 이미지 데이터 가져오기
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        const threshold = sensitivity / 100;
        const smoothing = smoothness / 100;

        // 각 픽셀 처리
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          // 녹색 강도 계산 (green > red && green > blue)
          const greenStrength = g - Math.max(r, b);

          // 크로마키 적용: 녹색이 강하면 투명하게
          if (greenStrength > threshold * 255) {
            const alpha = Math.max(0, 1 - (greenStrength / (threshold * 255)) * (1 + smoothing));
            data[i + 3] = alpha * 255;
          }
        }

        // 처리된 이미지 데이터를 캔버스에 적용
        ctx.putImageData(imageData, 0, 0);
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();
  };

  // 크로마키 토글 및 카메라 활성화 시 처리 시작
  useEffect(() => {
    if (isCameraActive) {
      // 비디오가 준비될 때까지 대기
      const video = videoRef.current;
      if (video) {
        const handleLoadedMetadata = () => {
          processChromaKey();
        };

        if (video.readyState >= 2) {
          processChromaKey();
        } else {
          video.addEventListener('loadedmetadata', handleLoadedMetadata);
          return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        }
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isCameraActive, chromaKeyEnabled, sensitivity, smoothness]);

  // 컴포넌트 언마운트 시 카메라 정리
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">카메라 + 크로마키 테스트</h1>

        {/* 컨트롤 패널 */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            {!isCameraActive ? (
              <button
                onClick={startCamera}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition"
              >
                카메라 시작
              </button>
            ) : (
              <button
                onClick={stopCamera}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition"
              >
                카메라 중지
              </button>
            )}

            {isCameraActive && (
              <button
                onClick={() => setChromaKeyEnabled(!chromaKeyEnabled)}
                className={`px-6 py-3 rounded-lg font-semibold transition ${
                  chromaKeyEnabled
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-gray-600 hover:bg-gray-700'
                }`}
              >
                크로마키: {chromaKeyEnabled ? 'ON' : 'OFF'}
              </button>
            )}
          </div>

          {/* 크로마키 설정 */}
          {isCameraActive && chromaKeyEnabled && (
            <div className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  민감도 (Sensitivity): {sensitivity}
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sensitivity}
                  onChange={(e) => setSensitivity(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  부드러움 (Smoothness): {smoothness}
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={smoothness}
                  onChange={(e) => setSmoothness(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          )}
        </div>

        {/* 비디오 표시 영역 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 원본 비디오 */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-xl font-semibold mb-4">원본 영상</h2>
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain"
              />
              {!isCameraActive && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                  카메라를 시작해주세요
                </div>
              )}
            </div>
          </div>

          {/* 크로마키 적용 캔버스 */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-xl font-semibold mb-4">
              {chromaKeyEnabled ? '크로마키 적용' : '처리된 영상'}
            </h2>
            <div className="relative rounded-lg overflow-hidden aspect-video">
              {/* 체크무늬 배경 (투명도 확인용) */}
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
                  backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
                }}
              />
              <canvas
                ref={canvasRef}
                className="relative w-full h-full object-contain"
              />
              {!isCameraActive && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500 bg-black">
                  카메라를 시작해주세요
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 사용 방법 */}
        <div className="mt-8 bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">사용 방법</h2>
          <ul className="list-disc list-inside space-y-2 text-gray-300">
            <li>카메라 시작 버튼을 클릭하여 카메라를 활성화합니다</li>
            <li>크로마키 버튼을 클릭하여 녹색 배경 제거를 활성화/비활성화합니다</li>
            <li>민감도 슬라이더로 녹색 감지 정도를 조절합니다 (값이 클수록 더 많은 녹색이 제거됩니다)</li>
            <li>부드러움 슬라이더로 가장자리 처리를 조절합니다</li>
            <li>오른쪽 패널의 체크무늬 배경으로 투명도를 확인할 수 있습니다</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
