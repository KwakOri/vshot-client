'use client';

import { useEffect, useState, useCallback } from 'react';
import { QRCodeDisplay } from '@/components/QRCodeDisplay';
import { getFilms, deleteFilm } from '@/lib/films';
import { logout } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import type { FilmResponse } from '@/types/films';

type Film = NonNullable<FilmResponse['film']>;

export default function AdminPage() {
  const router = useRouter();
  const [films, setFilms] = useState<Film[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('active');
  const [expandedQR, setExpandedQR] = useState<string | null>(null);
  const limit = 20;

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const fetchFilms = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFilms({
        status: statusFilter,
        limit,
        offset: page * limit,
      });
      if (data.success) {
        setFilms(data.films.filter((f): f is Film => f !== undefined));
        setTotal(data.total);
      }
    } catch (err) {
      console.error('[Admin] Failed to fetch films:', err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchFilms();
  }, [fetchFilms]);

  const handleDelete = async (filmId: string) => {
    if (!confirm('이 Film을 삭제하시겠습니까?')) return;
    try {
      await deleteFilm(filmId);
      fetchFilms();
    } catch (err) {
      console.error('[Admin] Delete failed:', err);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="min-h-screen p-6" style={{ background: '#1B1612' }}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#1B1612' }}>Film Admin</h1>
            <p className="text-sm mt-1" style={{ color: 'rgba(27,22,18,0.5)' }}>
              총 {total}개의 Film
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-neutral/20 transition"
            style={{ color: '#1B1612' }}
          >
            로그아웃
          </button>

          {/* Status Filter */}
          <div className="flex gap-2">
            {['active', 'expired', 'deleted'].map((s) => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setPage(0); }}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition ${
                  statusFilter === s
                    ? 'text-white'
                    : 'text-dark/50 bg-white/50 hover:bg-white'
                }`}
                style={statusFilter === s ? { background: '#FC712B' } : undefined}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#FC712B' }} />
          </div>
        )}

        {/* Film Grid */}
        {!loading && films.length === 0 && (
          <div className="text-center py-12" style={{ color: 'rgba(27,22,18,0.4)' }}>
            Film이 없습니다
          </div>
        )}

        {!loading && films.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {films.map((film) => (
              <div key={film.id} className="bg-white rounded-xl p-4 shadow-sm border border-neutral/20">
                {/* Photo Thumbnail */}
                <div className="aspect-[3/2] rounded-lg overflow-hidden mb-3"
                  style={{ background: 'rgba(27,22,18,0.05)' }}>
                  {film.photoUrl ? (
                    <img
                      src={film.photoUrl}
                      alt="Film photo"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm"
                      style={{ color: 'rgba(27,22,18,0.3)' }}>
                      사진 없음
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-mono truncate" style={{ color: 'rgba(27,22,18,0.4)' }}>
                      {film.id.slice(0, 8)}
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'rgba(27,22,18,0.5)' }}>
                      {new Date(film.createdAt).toLocaleString('ko-KR')}
                    </div>
                    <div className="text-xs" style={{ color: 'rgba(27,22,18,0.35)' }}>
                      만료: {new Date(film.expiresAt).toLocaleDateString('ko-KR')}
                    </div>
                    <div className="flex gap-1 mt-1">
                      {film.photoUrl && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">사진</span>
                      )}
                      {film.videoUrl && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">영상</span>
                      )}
                    </div>
                  </div>

                  {/* QR Code (small) */}
                  <button
                    onClick={() => setExpandedQR(expandedQR === film.id ? null : film.id)}
                    className="flex-shrink-0 p-1 rounded-lg hover:bg-neutral/20 transition"
                    title="QR 코드 보기"
                  >
                    <QRCodeDisplay filmId={film.id} size={60} />
                  </button>
                </div>

                {/* Expanded QR */}
                {expandedQR === film.id && (
                  <div className="mt-3 pt-3 border-t border-neutral/20 flex flex-col items-center">
                    <QRCodeDisplay filmId={film.id} size={200} />
                    <p className="text-xs mt-2" style={{ color: 'rgba(27,22,18,0.4)' }}>
                      인쇄/공유용
                    </p>
                  </div>
                )}

                {/* Actions */}
                {statusFilter === 'active' && (
                  <div className="mt-3 pt-3 border-t border-neutral/20">
                    <button
                      onClick={() => handleDelete(film.id)}
                      className="text-xs text-red-500 hover:text-red-700 font-semibold transition"
                    >
                      삭제
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-6">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white disabled:opacity-40 hover:bg-neutral/20 transition"
            >
              이전
            </button>
            <span className="px-3 py-1.5 text-sm" style={{ color: 'rgba(27,22,18,0.5)' }}>
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white disabled:opacity-40 hover:bg-neutral/20 transition"
            >
              다음
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
