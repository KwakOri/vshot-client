'use client';

import { useEffect, useState, useCallback } from 'react';
import { QRCodeDisplay } from '@/components/QRCodeDisplay';
import { getFilms, deleteFilm } from '@/lib/films';
import type { FilmResponse } from '@/types/films';

type Film = NonNullable<FilmResponse['film']>;

export default function AdminFesta() {
  const [films, setFilms] = useState<Film[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('active');
  const [expandedQR, setExpandedQR] = useState<string | null>(null);
  const limit = 20;

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
      console.error('[AdminFesta] Failed to fetch films:', err);
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
      console.error('[AdminFesta] Delete failed:', err);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      {/* Status Filter + Count */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {['active', 'expired', 'deleted'].map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(0); }}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition`}
              style={
                statusFilter === s
                  ? { background: '#FC712B', color: 'white' }
                  : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }
              }
            >
              {s}
            </button>
          ))}
        </div>
        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          총 {total}개
        </span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#FC712B' }} />
        </div>
      )}

      {/* Empty */}
      {!loading && films.length === 0 && (
        <div className="text-center py-12" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Film이 없습니다
        </div>
      )}

      {/* Film Grid */}
      {!loading && films.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {films.map((film) => (
            <div
              key={film.id}
              className="rounded-xl p-4 border"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}
            >
              {/* Photo Thumbnail */}
              <div
                className="aspect-[3/2] rounded-lg overflow-hidden mb-3"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              >
                {film.photoUrl ? (
                  <img src={film.photoUrl} alt="Film photo" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm" style={{ color: 'rgba(255,255,255,0.2)' }}>
                    사진 없음
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {film.id.slice(0, 8)}
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {new Date(film.createdAt).toLocaleString('ko-KR')}
                  </div>
                  <div className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
                    만료: {new Date(film.expiresAt).toLocaleDateString('ko-KR')}
                  </div>
                  <div className="flex gap-1 mt-1">
                    {film.photoUrl && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>사진</span>
                    )}
                    {film.videoUrl && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>영상</span>
                    )}
                  </div>
                </div>

                {/* QR Code */}
                <button
                  onClick={() => setExpandedQR(expandedQR === film.id ? null : film.id)}
                  className="flex-shrink-0 p-1 rounded-lg transition"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                  title="QR 코드 보기"
                >
                  <QRCodeDisplay filmId={film.id} size={60} />
                </button>
              </div>

              {/* Expanded QR */}
              {expandedQR === film.id && (
                <div className="mt-3 pt-3 flex flex-col items-center" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <QRCodeDisplay filmId={film.id} size={200} />
                  <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.3)' }}>인쇄/공유용</p>
                </div>
              )}

              {/* Delete */}
              {statusFilter === 'active' && (
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <button
                    onClick={() => handleDelete(film.id)}
                    className="text-xs font-semibold transition"
                    style={{ color: '#ef4444' }}
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
            className="px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-30 transition border"
            style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }}
          >
            이전
          </button>
          <span className="px-3 py-1.5 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-30 transition border"
            style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }}
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}
