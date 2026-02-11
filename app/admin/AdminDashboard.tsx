'use client';

import { useEffect, useState } from 'react';
import { getAdminStats } from '@/lib/auth';

interface Stats {
  active: number;
  expired: number;
  deleted: number;
  today: number;
  recentFilms: {
    id: string;
    status: string;
    photoUrl: string | null;
    videoUrl: string | null;
    createdAt: string;
    expiresAt: string;
  }[];
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAdminStats()
      .then(setStats)
      .catch((err) => console.error('[AdminDashboard]', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#FC712B' }} />
      </div>
    );
  }

  if (!stats) {
    return <div className="text-center py-12" style={{ color: 'rgba(255,255,255,0.4)' }}>통계를 불러올 수 없습니다</div>;
  }

  const totalFilms = stats.active + stats.expired + stats.deleted;

  const statCards = [
    { label: '총 Film', value: totalFilms, color: '#FC712B' },
    { label: '활성', value: stats.active, color: '#22c55e' },
    { label: '만료', value: stats.expired, color: '#FD9319' },
    { label: '오늘 촬영', value: stats.today, color: '#3b82f6' },
  ];

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl p-4 border"
            style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}
          >
            <div className="text-xs font-medium mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {card.label}
            </div>
            <div className="text-2xl font-bold" style={{ color: card.color }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Recent Films */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <h3 className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>최근 촬영</h3>
        </div>

        {stats.recentFilms.length === 0 ? (
          <div className="text-center py-8 text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
            촬영 내역이 없습니다
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: 'rgba(255,255,255,0.4)' }}>
                <th className="text-left px-4 py-2 font-medium">ID</th>
                <th className="text-left px-4 py-2 font-medium">상태</th>
                <th className="text-left px-4 py-2 font-medium">미디어</th>
                <th className="text-left px-4 py-2 font-medium">생성일</th>
                <th className="text-left px-4 py-2 font-medium">만료일</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentFilms.map((film) => (
                <tr key={film.id} className="border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <td className="px-4 py-2 font-mono" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {film.id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        background: film.status === 'active' ? 'rgba(34,197,94,0.15)' : 'rgba(253,147,25,0.15)',
                        color: film.status === 'active' ? '#22c55e' : '#FD9319',
                      }}
                    >
                      {film.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      {film.photoUrl && (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>사진</span>
                      )}
                      {film.videoUrl && (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>영상</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {new Date(film.createdAt).toLocaleString('ko-KR')}
                  </td>
                  <td className="px-4 py-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {new Date(film.expiresAt).toLocaleDateString('ko-KR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
