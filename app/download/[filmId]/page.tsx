'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { FilmResponse } from '@/types/films';

type Film = NonNullable<FilmResponse['film']>;

export default function DownloadPage() {
  const params = useParams();
  const filmId = params.filmId as string;
  const [film, setFilm] = useState<Film | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filmId) return;

    fetch(`/api/films/${filmId}`)
      .then((res) => res.json())
      .then((data: FilmResponse) => {
        if (data.success && data.film) {
          setFilm(data.film);
        } else {
          setError(data.error || 'Film not found');
        }
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false));
  }, [filmId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#1B1612' }}>
        <div className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#FC712B' }} />
      </div>
    );
  }

  if (error || !film) {
    const isExpired = film?.status === 'expired';
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#1B1612' }}>
        <div className="max-w-sm w-full text-center">
          <div className="text-5xl mb-4">{isExpired ? '⏳' : '🔍'}</div>
          <h1 className="text-xl font-bold mb-2" style={{ color: '#1B1612' }}>
            {isExpired ? '만료된 사진입니다' : '사진을 찾을 수 없습니다'}
          </h1>
          <p className="text-sm" style={{ color: 'rgba(27,22,18,0.5)' }}>
            {isExpired
              ? '이 사진의 다운로드 기간이 만료되었습니다.'
              : '링크가 올바르지 않거나 삭제된 사진입니다.'}
          </p>
        </div>
      </div>
    );
  }

  const handleDownload = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#1B1612' }}>
      {/* Header */}
      <div className="flex-shrink-0 p-4 text-center">
        <h1 className="text-lg font-bold" style={{ color: '#1B1612' }}>VShot</h1>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(27,22,18,0.4)' }}>포토부스 다운로드</p>
      </div>

      {/* Photo Preview */}
      <div className="flex-1 flex items-center justify-center px-6 pb-4">
        {film.photoUrl ? (
          <img
            src={film.photoUrl}
            alt="VShot Photo"
            className="max-w-full max-h-[60vh] rounded-2xl shadow-xl object-contain"
          />
        ) : (
          <div className="w-full max-w-sm aspect-[2/3] rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(27,22,18,0.05)' }}>
            <span style={{ color: 'rgba(27,22,18,0.3)' }}>사진 없음</span>
          </div>
        )}
      </div>

      {/* Download Buttons */}
      <div className="flex-shrink-0 p-4 pb-8 space-y-3 max-w-sm mx-auto w-full">
        {film.photoUrl && (
          <button
            onClick={() => handleDownload(film.photoUrl!, `vshot-${filmId.slice(0, 8)}.png`)}
            className="w-full py-4 rounded-xl font-bold text-base text-white shadow-lg touch-manipulation transition-transform active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #FC712B 0%, #FD9319 100%)',
              boxShadow: '0 8px 24px rgba(252, 113, 43, 0.3)',
            }}
          >
            사진 다운로드
          </button>
        )}

        {film.videoUrl && (
          <button
            onClick={() => handleDownload(film.videoUrl!, `vshot-${filmId.slice(0, 8)}.mp4`)}
            className="w-full py-4 rounded-xl font-bold text-base text-white shadow-lg touch-manipulation transition-transform active:scale-95"
            style={{ background: '#1B1612' }}
          >
            영상 다운로드
          </button>
        )}

        {/* Expiry info */}
        <p className="text-center text-xs" style={{ color: 'rgba(27,22,18,0.35)' }}>
          다운로드 가능 기간: {new Date(film.expiresAt).toLocaleDateString('ko-KR')}까지
        </p>
      </div>
    </div>
  );
}
