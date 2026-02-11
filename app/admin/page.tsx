'use client';

import { useState } from 'react';
import { logout } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import AdminDashboard from './AdminDashboard';
import AdminFesta from './AdminFesta';
import AdminUsers from './AdminUsers';
import AdminFrames from './AdminFrames';
import AdminGroups from './AdminGroups';

type Tab = 'dashboard' | 'festa' | 'users' | 'frames' | 'groups';

const tabs: { key: Tab; label: string }[] = [
  { key: 'dashboard', label: '대시보드' },
  { key: 'festa', label: '페스타' },
  { key: 'frames', label: '프레임' },
  { key: 'groups', label: '그룹' },
  { key: 'users', label: '유저' },
];

export default function AdminPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <div className="min-h-screen" style={{ background: '#1B1612' }}>
      {/* Sticky Header */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{
          background: 'rgba(27,22,18,0.85)',
          borderColor: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold" style={{ color: '#FC712B' }}>
            VShot Admin
          </h1>

          <nav className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition"
                style={
                  activeTab === tab.key
                    ? { background: 'rgba(252,113,43,0.15)', color: '#FC712B' }
                    : { color: 'rgba(255,255,255,0.4)' }
                }
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <button
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-lg text-xs font-bold transition border"
            style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-6">
        {activeTab === 'dashboard' && <AdminDashboard />}
        {activeTab === 'festa' && <AdminFesta />}
        {activeTab === 'frames' && <AdminFrames />}
        {activeTab === 'groups' && <AdminGroups />}
        {activeTab === 'users' && <AdminUsers />}
      </main>
    </div>
  );
}
