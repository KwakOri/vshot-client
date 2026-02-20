import type { FrameSlotRatio } from './index';

/**
 * DB 기반 프레임 (서버 응답)
 */
export interface Frame {
  id: string;
  name: string;
  description: string | null;
  frameFileId: string | null;
  thumbnailFileId: string | null;
  frameImageUrl: string | null;
  thumbnailUrl: string | null;
  canvasWidth: number;
  canvasHeight: number;
  slotPositions: FrameSlotRatio[];
  slotCount: number;
  isPublic: boolean;
  category: string | null;
  tags: string[];
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 프레임 접근 권한
 */
export interface FrameAccess {
  id: string;
  frameId: string;
  type: 'user' | 'group';
  userId: string | null;
  userEmail: string | null;
  userRole: string | null;
  groupId: string | null;
  groupName: string | null;
  createdAt: string;
}

/**
 * 그룹
 */
export interface Group {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

/**
 * 그룹 멤버
 */
export interface GroupMember {
  userId: string;
  email: string;
  role: string;
  addedAt: string;
}
