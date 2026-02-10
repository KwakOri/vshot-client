'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { login, register } from '@/lib/auth';
import { Suspense } from 'react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password);
      }
      router.push(redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6" style={{ background: '#1B1612' }}>
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-center mb-8" style={{ color: '#1B1612' }}>
          VShot
        </h1>

        {/* Tab switcher */}
        <div className="flex mb-6 rounded-xl overflow-hidden" style={{ background: '#E2D4C4' }}>
          <button
            onClick={() => { setMode('login'); setError(''); }}
            className="flex-1 py-2.5 text-sm font-bold transition-colors"
            style={mode === 'login'
              ? { background: '#FC712B', color: 'white' }
              : { color: '#1B1612' }
            }
          >
            로그인
          </button>
          <button
            onClick={() => { setMode('register'); setError(''); }}
            className="flex-1 py-2.5 text-sm font-bold transition-colors"
            style={mode === 'register'
              ? { background: '#FC712B', color: 'white' }
              : { color: '#1B1612' }
            }
          >
            회원가입
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: '#1B1612' }}>
              이메일
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border-2 text-sm outline-none transition-colors"
              style={{ borderColor: '#E2D4C4', color: '#1B1612' }}
              onFocus={(e) => (e.target.style.borderColor = '#FC712B')}
              onBlur={(e) => (e.target.style.borderColor = '#E2D4C4')}
              placeholder="email@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: '#1B1612' }}>
              비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-3 rounded-xl border-2 text-sm outline-none transition-colors"
              style={{ borderColor: '#E2D4C4', color: '#1B1612' }}
              onFocus={(e) => (e.target.style.borderColor = '#FC712B')}
              onBlur={(e) => (e.target.style.borderColor = '#E2D4C4')}
              placeholder={mode === 'register' ? '6자 이상' : ''}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 font-medium">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl text-white font-bold text-sm transition-opacity disabled:opacity-50"
            style={{ background: '#FC712B' }}
          >
            {loading
              ? '처리 중...'
              : mode === 'login'
                ? '로그인'
                : '회원가입'
            }
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
