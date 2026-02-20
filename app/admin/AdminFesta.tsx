'use client';

import { QRCodeDisplay } from '@/components/QRCodeDisplay';
import { deleteFilm, getFilms } from '@/lib/films';
import type { FilmResponse } from '@/types/films';
import { useCallback, useEffect, useState } from 'react';

type Film = NonNullable<FilmResponse['film']>;

const DOWNLOAD_HISTORY_KEY = 'vshot_admin_downloaded_films';

export default function AdminFesta() {
  const [films, setFilms] = useState<Film[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('active');
  const [expandedQR, setExpandedQR] = useState<string | null>(null);
  const [downloadedFilms, setDownloadedFilms] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem(DOWNLOAD_HISTORY_KEY);
      return stored ? new Set<string>(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });
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

  const handleDownload = (photoUrl: string, filmId: string) => {
    const filename = `vshot-${filmId.slice(0, 8)}.png`;
    const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(
      photoUrl
    )}&filename=${encodeURIComponent(filename)}`;
    const a = document.createElement('a');
    a.href = proxyUrl;
    a.download = filename;
    a.click();

    setDownloadedFilms((prev) => {
      const next = new Set(prev);
      next.add(filmId);
      try {
        localStorage.setItem(DOWNLOAD_HISTORY_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
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
              onClick={() => {
                setStatusFilter(s);
                setPage(0);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition`}
              style={
                statusFilter === s
                  ? { background: '#FC712B', color: 'white' }
                  : {
                      background: 'rgba(255,255,255,0.06)',
                      color: 'rgba(255,255,255,0.5)',
                    }
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
          <div
            className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: '#FC712B' }}
          />
        </div>
      )}

      {/* Empty */}
      {!loading && films.length === 0 && (
        <div
          className="text-center py-12"
          style={{ color: 'rgba(255,255,255,0.3)' }}
        >
          Film이 없습니다
        </div>
      )}

      {/* Film Grid */}
      {!loading && films.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {films.map((film) => (
            <div
              key={film.id}
              className="rounded-xl border overflow-hidden"
              style={{
                background: 'rgba(255,255,255,0.04)',
                borderColor: 'rgba(255,255,255,0.08)',
              }}
            >
              {/* 썸네일 */}
              <div className="mt-3 relative overflow-hidden aspect-[3/4]">
                {/* 이미지 레이어 */}
                {film.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={film.photoUrl}
                    alt="Film photo"
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                ) : (
                  <span
                    className="absolute inset-0 flex items-center justify-center text-xs"
                    style={{ color: 'rgba(255,255,255,0.2)' }}
                  >
                    사진 없음
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="p-2.5 space-y-2">
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className="text-xs font-mono truncate"
                      style={{ color: 'rgba(255,255,255,0.5)' }}
                    >
                      {film.id.slice(0, 8)}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {film.photoUrl && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                          style={{
                            background: 'rgba(34,197,94,0.2)',
                            color: '#22c55e',
                          }}
                        >
                          사진
                        </span>
                      )}
                      {film.videoUrl && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                          style={{
                            background: 'rgba(59,130,246,0.2)',
                            color: '#3b82f6',
                          }}
                        >
                          영상
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedQR(expandedQR === film.id ? null : film.id)
                        }
                        className="text-[9px] px-1.5 py-0.5 rounded font-medium transition"
                        style={{
                          background:
                            expandedQR === film.id
                              ? 'rgba(252,113,43,0.15)'
                              : 'rgba(255,255,255,0.07)',
                          color:
                            expandedQR === film.id
                              ? '#FC712B'
                              : 'rgba(255,255,255,0.4)',
                        }}
                      >
                        QR
                      </button>
                    </div>
                  </div>
                  <span
                    className="text-[9px]"
                    style={{ color: 'rgba(255,255,255,0.3)' }}
                  >
                    {new Date(film.createdAt).toLocaleDateString('ko-KR')}
                  </span>
                </div>

                {/* QR 확장 */}
                {expandedQR === film.id && (
                  <div
                    className="flex flex-col items-center py-2 rounded-lg"
                    style={{ background: 'rgba(255,255,255,0.03)' }}
                  >
                    <QRCodeDisplay filmId={film.id} size={100} />
                  </div>
                )}

                {/* 액션 버튼 */}
                <div className="space-y-1.5">
                  {film.photoUrl && (
                    <button
                      type="button"
                      onClick={() => handleDownload(film.photoUrl!, film.id)}
                      className="w-full py-2 rounded-lg text-xs font-bold transition active:scale-95"
                      style={
                        downloadedFilms.has(film.id)
                          ? {
                              background: 'rgba(74,222,128,0.1)',
                              color: '#86efac',
                              border: '1px solid rgba(74,222,128,0.2)',
                            }
                          : {
                              background:
                                'linear-gradient(135deg, #FC712B 0%, #FD9319 100%)',
                              color: 'white',
                              boxShadow: '0 2px 8px rgba(252,113,43,0.25)',
                            }
                      }
                    >
                      {downloadedFilms.has(film.id)
                        ? '다시 다운로드'
                        : '사진 다운로드'}
                    </button>
                  )}
                  {statusFilter === 'active' && (
                    <button
                      type="button"
                      onClick={() => handleDelete(film.id)}
                      className="w-full py-2 rounded-lg text-xs font-bold transition active:scale-95"
                      style={{
                        background: 'rgba(239,68,68,0.1)',
                        color: '#ef4444',
                        border: '1px solid rgba(239,68,68,0.22)',
                      }}
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>
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
            style={{
              background: 'rgba(255,255,255,0.06)',
              borderColor: 'rgba(255,255,255,0.1)',
              color: 'white',
            }}
          >
            이전
          </button>
          <span
            className="px-3 py-1.5 text-sm"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-30 transition border"
            style={{
              background: 'rgba(255,255,255,0.06)',
              borderColor: 'rgba(255,255,255,0.1)',
              color: 'white',
            }}
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}
