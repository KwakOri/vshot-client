'use client';

import { useEffect, useRef, useState } from 'react';
import { getActiveLayouts } from '@/constants/frame-layouts';
import { FrameLayout } from '@/types';
import { renderFramePreview } from '@/lib/frame-generator';

export default function FramesPreviewPage() {
  const layouts = getActiveLayouts();

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">프레임 레이아웃 미리보기</h1>
        <p className="text-gray-400 mb-8">6가지 커스텀 프레임 레이아웃을 확인하세요</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {layouts.map((layout) => (
            <FramePreviewCard key={layout.id} layout={layout} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FramePreviewCard({ layout }: { layout: FrameLayout }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Use the real rendering logic from frame-generator
    renderFramePreview(canvas, layout).then(() => {
      setIsLoading(false);
    }).catch((error) => {
      console.error('Failed to render frame preview:', error);
      setIsLoading(false);
    });
  }, [layout]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `frame-${layout.id}.png`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
      <div className="mb-4">
        <div className="flex items-start justify-between mb-2">
          <h2 className="text-2xl font-bold">{layout.label}</h2>
          <button
            onClick={handleDownload}
            disabled={isLoading}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
          >
            다운로드
          </button>
        </div>
        {layout.description && (
          <p className="text-gray-400 text-sm mb-2">{layout.description}</p>
        )}
        <div className="flex gap-2 flex-wrap">
          {layout.category && (
            <span className="px-2 py-1 bg-blue-600 text-xs rounded">
              {layout.category}
            </span>
          )}
          <span className="px-2 py-1 bg-purple-600 text-xs rounded">
            {layout.slotCount}칸
          </span>
          {layout.tags?.map((tag) => (
            <span
              key={tag}
              className="px-2 py-1 bg-gray-700 text-xs rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="relative bg-gray-950 rounded overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-gray-500">로딩 중...</div>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="w-full h-auto"
          style={{ display: 'block' }}
        />
      </div>
    </div>
  );
}
