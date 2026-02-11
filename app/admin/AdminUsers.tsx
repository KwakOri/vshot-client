'use client';

import { useEffect, useState } from 'react';
import { getUsers, createUser, deleteUser, getUserId } from '@/lib/auth';

interface User {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('host');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const currentUserId = getUserId();

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await getUsers();
      setUsers(data.users);
    } catch (err) {
      console.error('[AdminUsers]', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      await createUser(email, password, role);
      setEmail('');
      setPassword('');
      setRole('host');
      setShowForm(false);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('이 유저를 삭제하시겠습니까?')) return;
    try {
      await deleteUser(userId);
      fetchUsers();
    } catch (err) {
      console.error('[AdminUsers] Delete failed:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#FC712B' }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
          총 {users.length}명
        </span>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 rounded-lg text-xs font-bold transition"
          style={{ background: '#FC712B', color: 'white' }}
        >
          {showForm ? '취소' : '유저 추가'}
        </button>
      </div>

      {/* Add User Form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl p-4 border space-y-3"
          style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="이메일"
              className="px-3 py-2 rounded-lg text-sm outline-none border"
              style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="비밀번호 (6자 이상)"
              className="px-3 py-2 rounded-lg text-sm outline-none border"
              style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }}
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm outline-none border"
              style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }}
            >
              <option value="host">Host</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 rounded-lg text-xs font-bold text-white transition disabled:opacity-50"
            style={{ background: '#FC712B' }}
          >
            {creating ? '생성 중...' : '생성'}
          </button>
        </form>
      )}

      {/* Users Table */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}
      >
        {users.length === 0 ? (
          <div className="text-center py-8 text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
            유저가 없습니다
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: 'rgba(255,255,255,0.4)' }}>
                <th className="text-left px-4 py-2 font-medium">이메일</th>
                <th className="text-left px-4 py-2 font-medium">역할</th>
                <th className="text-left px-4 py-2 font-medium">가입일</th>
                <th className="text-right px-4 py-2 font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <td className="px-4 py-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    {user.email}
                    {user.id === currentUserId && (
                      <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(252,113,43,0.15)', color: '#FC712B' }}>나</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        background: user.role === 'admin' ? 'rgba(252,113,43,0.15)' : 'rgba(255,255,255,0.08)',
                        color: user.role === 'admin' ? '#FC712B' : 'rgba(255,255,255,0.5)',
                      }}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {new Date(user.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => handleDelete(user.id)}
                      disabled={user.id === currentUserId}
                      className="text-xs font-semibold transition disabled:opacity-20 disabled:cursor-not-allowed"
                      style={{ color: '#ef4444' }}
                    >
                      삭제
                    </button>
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
