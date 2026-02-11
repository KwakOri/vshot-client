'use client';

import { getToken, getUserRole, logout } from '@/lib/auth';
import { useAppStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const UnicornScene = dynamic(() => import('unicornstudio-react'), { ssr: false });

export default function Home() {
  const store = useAppStore();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    setIsLoggedIn(!!getToken());
    setRole(getUserRole());
  }, []);

  const handleStartCapture = useCallback(() => {
    store.reset();
    if (role === 'host') {
      router.push('/festa-host');
    } else {
      router.push('/festa-guest');
    }
  }, [store, router, role]);

  const handleMenuNav = useCallback(
    (path: string) => {
      setMenuOpen(false);
      router.push(path);
    },
    [router]
  );

  const handleLogout = useCallback(() => {
    logout();
    setIsLoggedIn(false);
    setRole(null);
    setMenuOpen(false);
    router.refresh();
  }, [router]);

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-dark">
      {/* UnicornScene fullscreen background */}
      <div className="absolute inset-0 z-0">
        <UnicornScene
          projectId="qn7XQR2tCNSwUNALTVFe"
          width="100%"
          height="100%"
          scale={1}
          dpi={1.5}
          lazyLoad
        />
        {/* Overlay gradient for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-b from-dark/40 via-transparent to-dark/70" />
      </div>

      {/* Top bar */}
      <header className="relative z-20 flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="font-display text-2xl font-extrabold tracking-tight text-white drop-shadow-lg">
          VShot
        </div>
        <button
          onClick={() => setMenuOpen(true)}
          className="group flex h-10 w-10 flex-col items-center justify-center gap-[5px] rounded-xl bg-white/10 backdrop-blur-sm transition-all hover:bg-white/20 active:scale-95"
          aria-label="메뉴 열기"
        >
          <span className="block h-[2px] w-5 rounded-full bg-white transition-all group-hover:w-4" />
          <span className="block h-[2px] w-5 rounded-full bg-white" />
          <span className="block h-[2px] w-5 rounded-full bg-white transition-all group-hover:w-3" />
        </button>
      </header>

      {/* Hero content */}
      <div className="relative z-10 flex min-h-[calc(100dvh-80px)] flex-col items-center justify-center px-6">
        <div className="flex flex-col items-center text-center">
          {/* Badge */}
          <div
            className="animate-fade-in mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5"
            style={{
              background:
                'linear-gradient(135deg, rgba(252,113,43,0.25), rgba(253,147,25,0.15))',
              border: '1px solid rgba(252,113,43,0.3)',
              backdropFilter: 'blur(8px)',
              animationDelay: '0.2s',
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-semibold tracking-wider text-white/90 uppercase">
              Live Photobooth
            </span>
          </div>

          {/* Headline */}
          <h1
            className="animate-slide-up font-display text-[clamp(1.6rem,5vw,3.2rem)] font-extrabold leading-[1.25] tracking-tight text-white"
            style={{ animationDelay: '0.35s' }}
          >
            가상과 현실이
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  'linear-gradient(135deg, #FC712B, #FD9319, #FEA741)',
              }}
            >
              한 장의 사진
            </span>
            이 되는 순간.
          </h1>

          {/* Subtitle */}
          <p
            className="animate-slide-up mt-5 max-w-md text-[clamp(0.875rem,2.5vw,1.125rem)] leading-relaxed text-white/50"
            style={{ animationDelay: '0.5s' }}
          >
            지연 없이 만나고, 선명하게 남기다.
          </p>

          {/* CTA */}
          <button
            onClick={handleStartCapture}
            className="animate-slide-up group relative mt-10 overflow-hidden rounded-2xl px-10 py-4 text-lg font-bold text-white shadow-xl transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl active:scale-[0.97]"
            style={{
              background: 'linear-gradient(135deg, #FC712B, #FD9319)',
              animationDelay: '0.65s',
            }}
          >
            {/* Glow ring */}
            <span
              className="absolute -inset-1 -z-10 rounded-2xl opacity-50 blur-xl transition-opacity duration-300 group-hover:opacity-80"
              style={{
                background: 'linear-gradient(135deg, #FC712B, #FD9319)',
              }}
            />
            {/* Shine */}
            <span className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <span className="relative flex items-center gap-3">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
              {role === 'host' ? '부스 시작하기' : '촬영 시작하기'}
            </span>
          </button>
        </div>
      </div>

      {/* Slide-in menu overlay */}
      {menuOpen && (
        <div className="fixed inset-0 z-50" onClick={() => setMenuOpen(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" />

          {/* Panel */}
          <div
            className="absolute right-0 top-0 h-full w-72 bg-dark-50 shadow-2xl animate-slide-in-right"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <div className="flex items-center justify-between px-6 py-5">
              <span className="font-display text-sm font-bold uppercase tracking-widest text-white/50">
                Menu
              </span>
              <button
                onClick={() => setMenuOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
                aria-label="메뉴 닫기"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>

            <div className="px-4">
              <div className="h-px bg-white/10" />
            </div>

            {/* Menu items */}
            <nav className="mt-4 flex flex-col gap-1 px-4">
              {!isLoggedIn ? (
                <button
                  onClick={() => handleMenuNav('/login')}
                  className="group flex items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all hover:bg-white/10"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary transition-colors group-hover:bg-primary/25">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                      <polyline points="10 17 15 12 10 7" />
                      <line x1="15" y1="12" x2="3" y2="12" />
                    </svg>
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-white">로그인</div>
                    <div className="text-xs text-white/40">호스트 / 관리자</div>
                  </div>
                </button>
              ) : (
                <>
                  {role === 'host' && (
                    <button
                      onClick={() => handleMenuNav('/festa-host')}
                      className="group flex items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all hover:bg-white/10"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary transition-colors group-hover:bg-primary/25">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="3" width="20" height="14" rx="2" />
                          <path d="M8 21h8M12 17v4" />
                        </svg>
                      </span>
                      <div>
                        <div className="text-sm font-semibold text-white">부스 만들기</div>
                        <div className="text-xs text-white/40">Festa Host 모드</div>
                      </div>
                    </button>
                  )}

                  {role === 'admin' && (
                    <button
                      onClick={() => handleMenuNav('/admin')}
                      className="group flex items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all hover:bg-white/10"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary/15 text-secondary transition-colors group-hover:bg-secondary/25">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </span>
                      <div>
                        <div className="text-sm font-semibold text-white">Admin</div>
                        <div className="text-xs text-white/40">관리자 대시보드</div>
                      </div>
                    </button>
                  )}

                  <div className="mx-4 my-2 h-px bg-white/10" />

                  <button
                    onClick={handleLogout}
                    className="group flex items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all hover:bg-white/10"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-white/50 transition-colors group-hover:bg-white/10">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                    </span>
                    <div className="text-sm text-white/50">로그아웃</div>
                  </button>
                </>
              )}
            </nav>
          </div>
        </div>
      )}
    </main>
  );
}
