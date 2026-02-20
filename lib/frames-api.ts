import { getToken } from './auth';
import type { Frame, FrameAccess, Group, GroupMember } from '@/types/frames';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function getHeaders(): HeadersInit {
  const headers: HeadersInit = {};
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

function getJsonHeaders(): HeadersInit {
  return {
    ...getHeaders(),
    'Content-Type': 'application/json',
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return res.json();
}

// ============================================================
// Frames API
// ============================================================

/** 호스트용: 접근 가능한 프레임 목록 */
export async function getAvailableFrames(): Promise<Frame[]> {
  const res = await fetch(`${API_URL}/api/frames`, { headers: getHeaders() });
  const data = await handleResponse<{ frames: Frame[] }>(res);
  return data.frames;
}

/** 관리자용: 모든 프레임 목록 */
export async function getAllFrames(): Promise<Frame[]> {
  const res = await fetch(`${API_URL}/api/frames/admin/all`, { headers: getHeaders() });
  const data = await handleResponse<{ frames: Frame[] }>(res);
  return data.frames;
}

/** 단일 프레임 조회 */
export async function getFrame(id: string): Promise<Frame> {
  const res = await fetch(`${API_URL}/api/frames/${id}`, { headers: getHeaders() });
  const data = await handleResponse<{ frame: Frame }>(res);
  return data.frame;
}

/** 프레임 생성 */
export async function createFrame(formData: FormData): Promise<Frame> {
  const headers: HeadersInit = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // Content-Type은 FormData가 자동 설정 (multipart boundary 포함)

  const res = await fetch(`${API_URL}/api/frames`, {
    method: 'POST',
    headers,
    body: formData,
  });
  const data = await handleResponse<{ frame: Frame }>(res);
  return data.frame;
}

/** 프레임 수정 */
export async function updateFrame(id: string, formData: FormData): Promise<Frame> {
  const headers: HeadersInit = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}/api/frames/${id}`, {
    method: 'PUT',
    headers,
    body: formData,
  });
  const data = await handleResponse<{ frame: Frame }>(res);
  return data.frame;
}

/** 프레임 삭제 */
export async function deleteFrame(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/frames/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  await handleResponse(res);
}

// ============================================================
// Frame Access API
// ============================================================

/** 프레임의 접근 권한 목록 */
export async function getFrameAccess(frameId: string): Promise<FrameAccess[]> {
  const res = await fetch(`${API_URL}/api/frame-access/${frameId}`, { headers: getHeaders() });
  const data = await handleResponse<{ access: FrameAccess[] }>(res);
  return data.access;
}

/** 접근 권한 추가 */
export async function addFrameAccess(
  frameId: string,
  target: { userId?: string; groupId?: string }
): Promise<void> {
  const res = await fetch(`${API_URL}/api/frame-access`, {
    method: 'POST',
    headers: getJsonHeaders(),
    body: JSON.stringify({ frameId, ...target }),
  });
  await handleResponse(res);
}

/** 접근 권한 제거 */
export async function removeFrameAccess(accessId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/frame-access/${accessId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  await handleResponse(res);
}

// ============================================================
// Groups API
// ============================================================

/** 그룹 목록 */
export async function getGroups(): Promise<Group[]> {
  const res = await fetch(`${API_URL}/api/groups`, { headers: getHeaders() });
  const data = await handleResponse<{ groups: Group[] }>(res);
  return data.groups;
}

/** 그룹 생성 */
export async function createGroup(name: string, description?: string): Promise<Group> {
  const res = await fetch(`${API_URL}/api/groups`, {
    method: 'POST',
    headers: getJsonHeaders(),
    body: JSON.stringify({ name, description }),
  });
  const data = await handleResponse<{ group: Group }>(res);
  return data.group;
}

/** 그룹 수정 */
export async function updateGroup(id: string, name: string, description?: string): Promise<Group> {
  const res = await fetch(`${API_URL}/api/groups/${id}`, {
    method: 'PUT',
    headers: getJsonHeaders(),
    body: JSON.stringify({ name, description }),
  });
  const data = await handleResponse<{ group: Group }>(res);
  return data.group;
}

/** 그룹 삭제 */
export async function deleteGroup(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/groups/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  await handleResponse(res);
}

/** 그룹 멤버 목록 */
export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  const res = await fetch(`${API_URL}/api/groups/${groupId}/members`, { headers: getHeaders() });
  const data = await handleResponse<{ members: GroupMember[] }>(res);
  return data.members;
}

/** 그룹 멤버 추가 */
export async function addGroupMember(groupId: string, userId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/groups/${groupId}/members`, {
    method: 'POST',
    headers: getJsonHeaders(),
    body: JSON.stringify({ userId }),
  });
  await handleResponse(res);
}

/** 그룹 멤버 제거 */
export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/groups/${groupId}/members/${userId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  await handleResponse(res);
}
