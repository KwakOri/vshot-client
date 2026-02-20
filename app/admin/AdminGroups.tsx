'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  getGroupMembers,
  addGroupMember,
  removeGroupMember,
} from '@/lib/frames-api';
import { getUsers } from '@/lib/auth';
import type { Group, GroupMember } from '@/types/frames';

export default function AdminGroups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 멤버 관리 모달
  const [memberGroup, setMemberGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getGroups();
      setGroups(data);
    } catch (err) {
      console.error('[AdminGroups]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setEditingGroup(null);
    setError('');
  };

  const openEditForm = (group: Group) => {
    setEditingGroup(group);
    setName(group.name);
    setDescription(group.description || '');
    setShowForm(true);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (editingGroup) {
        await updateGroup(editingGroup.id, name, description);
      } else {
        await createGroup(name, description);
      }
      resetForm();
      setShowForm(false);
      fetchGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save group');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 그룹을 삭제하시겠습니까?')) return;
    try {
      await deleteGroup(id);
      fetchGroups();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete group');
    }
  };

  const openMemberModal = async (group: Group) => {
    setMemberGroup(group);
    setMembersLoading(true);
    try {
      const data = await getGroupMembers(group.id);
      setMembers(data);
    } catch (err) {
      console.error('[AdminGroups] Members error:', err);
    } finally {
      setMembersLoading(false);
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
          총 {groups.length}개
        </span>
        <button
          onClick={() => {
            if (showForm) { resetForm(); setShowForm(false); }
            else { resetForm(); setShowForm(true); }
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-bold transition"
          style={{ background: '#FC712B', color: 'white' }}
        >
          {showForm ? '취소' : '그룹 추가'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl p-4 border space-y-3"
          style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="그룹 이름"
              className="px-3 py-2 rounded-lg text-sm outline-none border"
              style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }}
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="설명 (선택)"
              className="px-3 py-2 rounded-lg text-sm outline-none border"
              style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }}
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg text-xs font-bold text-white transition disabled:opacity-50"
            style={{ background: '#FC712B' }}
          >
            {saving ? '저장 중...' : editingGroup ? '수정' : '생성'}
          </button>
        </form>
      )}

      {/* Groups Table */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}
      >
        {groups.length === 0 ? (
          <div className="text-center py-8 text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
            그룹이 없습니다
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: 'rgba(255,255,255,0.4)' }}>
                <th className="text-left px-4 py-2 font-medium">이름</th>
                <th className="text-left px-4 py-2 font-medium">설명</th>
                <th className="text-left px-4 py-2 font-medium">생성일</th>
                <th className="text-right px-4 py-2 font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.id} className="border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <td className="px-4 py-2 font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    {group.name}
                  </td>
                  <td className="px-4 py-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {group.description || '-'}
                  </td>
                  <td className="px-4 py-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {new Date(group.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-4 py-2 text-right space-x-2">
                    <button
                      onClick={() => openMemberModal(group)}
                      className="text-xs font-semibold transition"
                      style={{ color: '#4CAF50' }}
                    >
                      멤버
                    </button>
                    <button
                      onClick={() => openEditForm(group)}
                      className="text-xs font-semibold transition"
                      style={{ color: '#FD9319' }}
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDelete(group.id)}
                      className="text-xs font-semibold transition"
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

      {/* Member Modal */}
      {memberGroup && (
        <MemberModal
          group={memberGroup}
          members={members}
          loading={membersLoading}
          onClose={() => setMemberGroup(null)}
          onRefresh={async () => {
            const data = await getGroupMembers(memberGroup.id);
            setMembers(data);
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Member Modal
// ============================================================

function MemberModal({
  group,
  members,
  loading,
  onClose,
  onRefresh,
}: {
  group: Group;
  members: GroupMember[];
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [users, setUsers] = useState<{ id: string; email: string; role: string }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await getUsers();
        setUsers(data.users);
      } catch (err) {
        console.error('[MemberModal]', err);
      }
    })();
  }, []);

  const handleAdd = async () => {
    if (!selectedUserId) return;
    setAdding(true);
    try {
      await addGroupMember(group.id, selectedUserId);
      setSelectedUserId('');
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await removeGroupMember(group.id, userId);
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  // 이미 멤버인 유저 제외
  const memberIds = new Set(members.map((m) => m.userId));
  const availableUsers = users.filter((u) => !memberIds.has(u.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="rounded-xl p-5 border w-full max-w-md mx-4 space-y-4"
        style={{ background: '#1B1612', borderColor: 'rgba(255,255,255,0.1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold" style={{ color: '#FC712B' }}>
            멤버 관리 - {group.name}
          </h3>
          <button onClick={onClose} className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>닫기</button>
        </div>

        {/* 추가 */}
        <div className="flex gap-2">
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none border"
            style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }}
          >
            <option value="">유저 선택...</option>
            {availableUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.email} ({u.role})</option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={!selectedUserId || adding}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-50"
            style={{ background: '#FC712B' }}
          >
            추가
          </button>
        </div>

        {/* 멤버 목록 */}
        <div
          className="rounded-lg border max-h-60 overflow-y-auto"
          style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}
        >
          {loading ? (
            <div className="text-center py-4 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>로딩...</div>
          ) : members.length === 0 ? (
            <div className="text-center py-4 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>멤버 없음</div>
          ) : (
            members.map((m) => (
              <div key={m.userId} className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                <div>
                  <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>{m.email}</span>
                  <span
                    className="text-[10px] ml-1.5 px-1 rounded"
                    style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}
                  >
                    {m.role}
                  </span>
                </div>
                <button onClick={() => handleRemove(m.userId)} className="text-xs" style={{ color: '#ef4444' }}>
                  제거
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
