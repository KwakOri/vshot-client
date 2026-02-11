'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  getAllFrames,
  createFrame,
  updateFrame,
  deleteFrame,
  getFrameAccess,
  addFrameAccess,
  removeFrameAccess,
} from '@/lib/frames-api';
import { getUsers } from '@/lib/auth';
import { getGroups } from '@/lib/frames-api';
import type { Frame, FrameAccess, Group } from '@/types/frames';
import type { FrameSlotRatio } from '@/types/index';

interface SlotInput {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

const EMPTY_SLOT: SlotInput = { x: 0, y: 0, width: 0, height: 0, zIndex: 0 };

export default function AdminFrames() {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingFrame, setEditingFrame] = useState<Frame | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'public' | 'private'>('all');

  // 접근 권한 모달
  const [accessFrame, setAccessFrame] = useState<Frame | null>(null);
  const [accessList, setAccessList] = useState<FrameAccess[]>([]);
  const [accessLoading, setAccessLoading] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [canvasWidth, setCanvasWidth] = useState(1600);
  const [canvasHeight, setCanvasHeight] = useState(2400);
  const [slotCount, setSlotCount] = useState(1);
  const [slots, setSlots] = useState<SlotInput[]>([{ ...EMPTY_SLOT }]);
  const [isPublic, setIsPublic] = useState(false);
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [sortOrder, setSortOrder] = useState(0);
  const [frameImage, setFrameImage] = useState<File | null>(null);
  const [thumbnailImage, setThumbnailImage] = useState<File | null>(null);
  const [frameImagePreview, setFrameImagePreview] = useState<string | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const fetchFrames = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllFrames();
      setFrames(data);
    } catch (err) {
      console.error('[AdminFrames]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFrames();
  }, [fetchFrames]);

  // 슬롯 비율 계산
  const slotsToRatios = useCallback((): FrameSlotRatio[] => {
    return slots.map((s) => ({
      x: canvasWidth > 0 ? s.x / canvasWidth : 0,
      y: canvasHeight > 0 ? s.y / canvasHeight : 0,
      width: canvasWidth > 0 ? s.width / canvasWidth : 0,
      height: canvasHeight > 0 ? s.height / canvasHeight : 0,
      zIndex: s.zIndex,
    }));
  }, [slots, canvasWidth, canvasHeight]);

  // 미리보기 그리기
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !showForm) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scale = 200 / Math.max(canvasWidth, canvasHeight);
    const w = canvasWidth * scale;
    const h = canvasHeight * scale;
    canvas.width = w;
    canvas.height = h;

    // 배경
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, w, h);

    // 프레임 이미지
    if (frameImagePreview) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h);
        drawSlots(ctx, w, h);
      };
      img.src = frameImagePreview;
    } else {
      drawSlots(ctx, w, h);
    }

    function drawSlots(c: CanvasRenderingContext2D, cw: number, ch: number) {
      const ratios = slotsToRatios();
      const colors = ['#FC712B', '#FD9319', '#4CAF50', '#2196F3'];
      ratios.forEach((r, i) => {
        const sx = r.x * cw;
        const sy = r.y * ch;
        const sw = r.width * cw;
        const sh = r.height * ch;

        c.strokeStyle = colors[i % colors.length];
        c.lineWidth = 2;
        c.strokeRect(sx, sy, sw, sh);

        c.fillStyle = colors[i % colors.length] + '33';
        c.fillRect(sx, sy, sw, sh);

        c.fillStyle = '#fff';
        c.font = 'bold 12px sans-serif';
        c.fillText(`#${i + 1}`, sx + 4, sy + 14);
      });
    }
  }, [showForm, canvasWidth, canvasHeight, slots, frameImagePreview, slotsToRatios]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setCanvasWidth(1600);
    setCanvasHeight(2400);
    setSlotCount(1);
    setSlots([{ ...EMPTY_SLOT }]);
    setIsPublic(false);
    setCategory('');
    setTags('');
    setSortOrder(0);
    setFrameImage(null);
    setThumbnailImage(null);
    setFrameImagePreview(null);
    setEditingFrame(null);
    setError('');
  };

  const openEditForm = (frame: Frame) => {
    setEditingFrame(frame);
    setName(frame.name);
    setDescription(frame.description || '');
    setCanvasWidth(frame.canvasWidth);
    setCanvasHeight(frame.canvasHeight);
    setSlotCount(frame.slotCount);
    setSlots(
      frame.slotPositions.map((r) => ({
        x: Math.round(r.x * frame.canvasWidth),
        y: Math.round(r.y * frame.canvasHeight),
        width: Math.round(r.width * frame.canvasWidth),
        height: Math.round(r.height * frame.canvasHeight),
        zIndex: r.zIndex || 0,
      }))
    );
    setIsPublic(frame.isPublic);
    setCategory(frame.category || '');
    setTags(frame.tags?.join(', ') || '');
    setSortOrder(frame.sortOrder);
    setFrameImage(null);
    setThumbnailImage(null);
    setFrameImagePreview(frame.frameImageUrl || null);
    setShowForm(true);
    setError('');
  };

  const handleSlotCountChange = (count: number) => {
    setSlotCount(count);
    const newSlots = [...slots];
    while (newSlots.length < count) newSlots.push({ ...EMPTY_SLOT });
    setSlots(newSlots.slice(0, count));
  };

  const updateSlot = (index: number, field: keyof SlotInput, value: number) => {
    const newSlots = [...slots];
    newSlots[index] = { ...newSlots[index], [field]: value };
    setSlots(newSlots);
  };

  const handleFrameImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFrameImage(file);
    const reader = new FileReader();
    reader.onload = () => setFrameImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('description', description);
      formData.append('canvasWidth', String(canvasWidth));
      formData.append('canvasHeight', String(canvasHeight));
      formData.append('slotCount', String(slotCount));
      formData.append('slotPositions', JSON.stringify(slotsToRatios()));
      formData.append('isPublic', String(isPublic));
      formData.append('category', category);
      formData.append('tags', JSON.stringify(tags.split(',').map((t) => t.trim()).filter(Boolean)));
      formData.append('sortOrder', String(sortOrder));

      if (frameImage) formData.append('frameImage', frameImage);
      if (thumbnailImage) formData.append('thumbnailImage', thumbnailImage);

      if (editingFrame) {
        await updateFrame(editingFrame.id, formData);
      } else {
        await createFrame(formData);
      }

      resetForm();
      setShowForm(false);
      fetchFrames();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save frame');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 프레임을 삭제하시겠습니까?')) return;
    try {
      await deleteFrame(id);
      fetchFrames();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete frame');
    }
  };

  // 접근 권한 모달
  const openAccessModal = async (frame: Frame) => {
    setAccessFrame(frame);
    setAccessLoading(true);
    try {
      const list = await getFrameAccess(frame.id);
      setAccessList(list);
    } catch (err) {
      console.error('[AdminFrames] Access list error:', err);
    } finally {
      setAccessLoading(false);
    }
  };

  const handleRemoveAccess = async (accessId: string) => {
    try {
      await removeFrameAccess(accessId);
      if (accessFrame) {
        const list = await getFrameAccess(accessFrame.id);
        setAccessList(list);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove access');
    }
  };

  const filteredFrames = frames.filter((f) => {
    if (filter === 'public') return f.isPublic;
    if (filter === 'private') return !f.isPublic;
    return true;
  });

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div
          className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: '#FC712B' }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            총 {frames.length}개
          </span>
          <div className="flex gap-1 ml-2">
            {(['all', 'public', 'private'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-2 py-0.5 rounded text-xs transition"
                style={
                  filter === f
                    ? { background: 'rgba(252,113,43,0.15)', color: '#FC712B' }
                    : { color: 'rgba(255,255,255,0.3)' }
                }
              >
                {f === 'all' ? '전체' : f === 'public' ? '공용' : '비공용'}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => {
            if (showForm) {
              resetForm();
              setShowForm(false);
            } else {
              resetForm();
              setShowForm(true);
            }
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-bold transition"
          style={{ background: '#FC712B', color: 'white' }}
        >
          {showForm ? '취소' : '프레임 추가'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl p-4 border space-y-4"
          style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <h3 className="text-sm font-bold" style={{ color: '#FC712B' }}>
            {editingFrame ? '프레임 수정' : '프레임 추가'}
          </h3>

          {/* 기본 정보 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="프레임 이름"
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

          {/* 캔버스 크기 */}
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>
              기준 프레임 크기 (px)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                value={canvasWidth}
                onChange={(e) => setCanvasWidth(Number(e.target.value))}
                placeholder="Width"
                className="px-3 py-2 rounded-lg text-sm outline-none border"
                style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }}
              />
              <input
                type="number"
                value={canvasHeight}
                onChange={(e) => setCanvasHeight(Number(e.target.value))}
                placeholder="Height"
                className="px-3 py-2 rounded-lg text-sm outline-none border"
                style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }}
              />
            </div>
          </div>

          {/* 슬롯 설정 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>
                슬롯 수
              </label>
              <input
                type="number"
                min={1}
                max={8}
                value={slotCount}
                onChange={(e) => handleSlotCountChange(Number(e.target.value))}
                className="w-16 px-2 py-1 rounded text-sm outline-none border text-center"
                style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }}
              />
            </div>

            <div className="space-y-2">
              {slots.map((slot, i) => {
                const ratio = slotsToRatios()[i];
                return (
                  <div key={i} className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs w-8 shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }}>#{i + 1}</span>
                    {(['x', 'y', 'width', 'height'] as const).map((field) => (
                      <div key={field} className="flex flex-col">
                        <label className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{field}(px)</label>
                        <input
                          type="number"
                          value={slot[field]}
                          onChange={(e) => updateSlot(i, field, Number(e.target.value))}
                          className="w-20 px-2 py-1 rounded text-xs outline-none border"
                          style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }}
                        />
                      </div>
                    ))}
                    {ratio && (
                      <span className="text-[10px] ml-2" style={{ color: 'rgba(255,255,255,0.25)' }}>
                        ratio: ({ratio.x.toFixed(3)}, {ratio.y.toFixed(3)}, {ratio.width.toFixed(3)}, {ratio.height.toFixed(3)})
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 미리보기 + 이미지 업로드 */}
          <div className="flex gap-4 flex-wrap">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>
                미리보기
              </label>
              <canvas
                ref={previewCanvasRef}
                className="rounded border"
                style={{ borderColor: 'rgba(255,255,255,0.1)', maxWidth: 200 }}
              />
            </div>
            <div className="space-y-3 flex-1">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  프레임 이미지 (PNG)
                </label>
                <input
                  type="file"
                  accept="image/png"
                  onChange={handleFrameImageChange}
                  className="text-xs"
                  style={{ color: 'rgba(255,255,255,0.5)' }}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  썸네일 이미지
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setThumbnailImage(e.target.files?.[0] || null)}
                  className="text-xs"
                  style={{ color: 'rgba(255,255,255,0.5)' }}
                />
              </div>
            </div>
          </div>

          {/* 메타데이터 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>공용</label>
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="accent-orange-500"
              />
            </div>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="카테고리"
              className="px-3 py-2 rounded-lg text-sm outline-none border"
              style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }}
            />
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="태그 (쉼표 구분)"
              className="px-3 py-2 rounded-lg text-sm outline-none border"
              style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }}
            />
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
              placeholder="정렬 순서"
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
            {saving ? '저장 중...' : editingFrame ? '수정' : '생성'}
          </button>
        </form>
      )}

      {/* Frames Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredFrames.map((frame) => (
          <div
            key={frame.id}
            className="rounded-xl border overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}
          >
            {/* 썸네일 */}
            <div className="aspect-[2/3] bg-black/30 relative flex items-center justify-center">
              {frame.thumbnailUrl || frame.frameImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={frame.thumbnailUrl || frame.frameImageUrl || ''}
                  alt={frame.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>No Image</span>
              )}
              {/* 배지 */}
              <div className="absolute top-2 left-2 flex gap-1">
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                  style={{
                    background: frame.isPublic ? 'rgba(76,175,80,0.2)' : 'rgba(252,113,43,0.2)',
                    color: frame.isPublic ? '#4CAF50' : '#FC712B',
                  }}
                >
                  {frame.isPublic ? '공용' : '비공용'}
                </span>
                {!frame.isActive && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: 'rgba(239,68,68,0.2)', color: '#ef4444' }}>
                    비활성
                  </span>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold truncate" style={{ color: 'rgba(255,255,255,0.8)' }}>
                  {frame.name}
                </h4>
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {frame.canvasWidth}x{frame.canvasHeight} / {frame.slotCount}칸
                </span>
              </div>

              {frame.description && (
                <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>{frame.description}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => openEditForm(frame)}
                  className="text-xs font-semibold transition"
                  style={{ color: '#FD9319' }}
                >
                  수정
                </button>
                {!frame.isPublic && (
                  <button
                    onClick={() => openAccessModal(frame)}
                    className="text-xs font-semibold transition"
                    style={{ color: '#4CAF50' }}
                  >
                    권한
                  </button>
                )}
                <button
                  onClick={() => handleDelete(frame.id)}
                  className="text-xs font-semibold transition ml-auto"
                  style={{ color: '#ef4444' }}
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredFrames.length === 0 && (
        <div className="text-center py-8 text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
          프레임이 없습니다
        </div>
      )}

      {/* Access Modal */}
      {accessFrame && (
        <AccessModal
          frame={accessFrame}
          accessList={accessList}
          loading={accessLoading}
          onClose={() => setAccessFrame(null)}
          onRemove={handleRemoveAccess}
          onRefresh={async () => {
            const list = await getFrameAccess(accessFrame.id);
            setAccessList(list);
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Access Modal
// ============================================================

function AccessModal({
  frame,
  accessList,
  loading,
  onClose,
  onRemove,
  onRefresh,
}: {
  frame: Frame;
  accessList: FrameAccess[];
  loading: boolean;
  onClose: () => void;
  onRemove: (id: string) => void;
  onRefresh: () => void;
}) {
  const [addType, setAddType] = useState<'user' | 'group'>('user');
  const [users, setUsers] = useState<{ id: string; email: string; role: string }[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [usersData, groupsData] = await Promise.all([getUsers(), getGroups()]);
        setUsers(usersData.users);
        setGroups(groupsData);
      } catch (err) {
        console.error('[AccessModal]', err);
      }
    })();
  }, []);

  const handleAdd = async () => {
    if (!selectedId) return;
    setAdding(true);
    try {
      await addFrameAccess(
        frame.id,
        addType === 'user' ? { userId: selectedId } : { groupId: selectedId }
      );
      setSelectedId('');
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add access');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="rounded-xl p-5 border w-full max-w-md mx-4 space-y-4"
        style={{ background: '#1B1612', borderColor: 'rgba(255,255,255,0.1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold" style={{ color: '#FC712B' }}>
            접근 권한 - {frame.name}
          </h3>
          <button onClick={onClose} className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>닫기</button>
        </div>

        {/* 추가 */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => { setAddType('user'); setSelectedId(''); }}
              className="px-2 py-0.5 rounded text-xs"
              style={addType === 'user' ? { background: 'rgba(252,113,43,0.15)', color: '#FC712B' } : { color: 'rgba(255,255,255,0.3)' }}
            >
              유저
            </button>
            <button
              onClick={() => { setAddType('group'); setSelectedId(''); }}
              className="px-2 py-0.5 rounded text-xs"
              style={addType === 'group' ? { background: 'rgba(252,113,43,0.15)', color: '#FC712B' } : { color: 'rgba(255,255,255,0.3)' }}
            >
              그룹
            </button>
          </div>
          <div className="flex gap-2">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg text-sm outline-none border"
              style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }}
            >
              <option value="">선택...</option>
              {addType === 'user'
                ? users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)
                : groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)
              }
            </select>
            <button
              onClick={handleAdd}
              disabled={!selectedId || adding}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-50"
              style={{ background: '#FC712B' }}
            >
              추가
            </button>
          </div>
        </div>

        {/* 목록 */}
        <div
          className="rounded-lg border max-h-60 overflow-y-auto"
          style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}
        >
          {loading ? (
            <div className="text-center py-4 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>로딩...</div>
          ) : accessList.length === 0 ? (
            <div className="text-center py-4 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>접근 권한 없음</div>
          ) : (
            accessList.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                <div>
                  <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    {a.type === 'user' ? a.userEmail : a.groupName}
                  </span>
                  <span className="text-[10px] ml-1.5 px-1 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}>
                    {a.type}
                  </span>
                </div>
                <button
                  onClick={() => onRemove(a.id)}
                  className="text-xs"
                  style={{ color: '#ef4444' }}
                >
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
