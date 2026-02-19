'use client';

import { useState } from 'react';
import { logout } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import AdminDashboard from './AdminDashboard';
import AdminFesta from './AdminFesta';
import AdminUsers from './AdminUsers';

type Tab = 'dashboard' | 'festa' | 'users';

const tabs: { key: Tab; label: string }[] = [
  { key: 'dashboard', label: '대시보드' },
  { key: 'festa', label: '페스타' },
  { key: 'users', label: '유저' },
];

function VshotIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M63.3087 118C26.7503 118 13.4705 87.1706 13.0018 53.8372C12.8456 34.7449 22.6882 18 42.0611 18C61.4339 18 69.2455 31.1455 69.2455 47.8905C69.2455 61.662 67.0583 77.3114 53.7785 87.4836C51.2788 89.3615 54.2472 92.9609 56.5907 91.2394C71.1203 80.2848 74.245 64.4789 73.9325 43.3521C73.7763 29.1111 77.9946 18 93.9303 18C108.304 18 114.084 28.9546 112.834 56.1847C111.272 88.1095 93.1491 118 63.3087 118Z"
        fill="url(#vshot-grad)"
      />
      <defs>
        <linearGradient id="vshot-grad" x1="22.7701" y1="22.5872" x2="80.1009" y2="111.032" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FAA357" />
          <stop offset="1" stopColor="#FF7431" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect y="3" width="20" height="2" rx="1" fill="rgba(255,255,255,0.7)" />
      <rect y="9" width="20" height="2" rx="1" fill="rgba(255,255,255,0.7)" />
      <rect y="15" width="20" height="2" rx="1" fill="rgba(255,255,255,0.7)" />
    </svg>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const activeLabel = tabs.find((t) => t.key === activeTab)?.label ?? '';

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
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3">
          {/* Desktop */}
          <div className="hidden md:flex items-center justify-between">
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

          {/* Mobile */}
          <div className="flex md:hidden items-center justify-between relative">
            {/* 왼쪽: 아이콘 */}
            <VshotIcon size={28} />

            {/* 가운데: 현재 탭 이름 */}
            <span
              className="absolute left-1/2 -translate-x-1/2 text-sm font-bold"
              style={{ color: '#FC712B' }}
            >
              {activeLabel}
            </span>

            {/* 오른쪽: 햄버거 */}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="p-1.5 rounded-lg"
              style={{ background: menuOpen ? 'rgba(252,113,43,0.12)' : 'transparent' }}
              aria-label="메뉴 열기"
            >
              <HamburgerIcon />
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {menuOpen && (
          <div
            className="md:hidden border-t"
            style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(27,22,18,0.97)' }}
          >
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setMenuOpen(false); }}
                className="w-full text-left px-6 py-3.5 text-sm font-semibold transition"
                style={
                  activeTab === tab.key
                    ? { color: '#FC712B', background: 'rgba(252,113,43,0.08)' }
                    : { color: 'rgba(255,255,255,0.55)' }
                }
              >
                {tab.label}
              </button>
            ))}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button
                onClick={handleLogout}
                className="w-full text-left px-6 py-3.5 text-sm font-semibold transition"
                style={{ color: '#ef4444' }}
              >
                로그아웃
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 md:px-6 py-6">
        {activeTab === 'dashboard' && <AdminDashboard />}
        {activeTab === 'festa' && <AdminFesta />}
        {activeTab === 'users' && <AdminUsers />}
      </main>
    </div>
  );
}
