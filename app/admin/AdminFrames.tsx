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

// ============================================================
// Styled Components
// ============================================================

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: '#E2D4C4', opacity: 0.5 }}>
      {children}
    </label>
  );
}

function StyledInput({
  type = 'text',
  value,
  onChange,
  placeholder,
  required,
  className = '',
}: {
  type?: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      className={`w-full px-3 py-2 rounded-lg text-[13px] outline-none transition-colors
        focus:ring-1 focus:ring-[#FC712B]/40 ${className}`}
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)',
        color: '#F3E9E7',
      }}
    />
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2.5 group"
    >
      <div
        className="relative w-9 h-5 rounded-full transition-colors duration-200"
        style={{ background: checked ? '#FC712B' : 'rgba(255,255,255,0.1)' }}
      >
        <div
          className="absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200 shadow-sm"
          style={{
            left: checked ? '18px' : '2px',
            background: checked ? '#fff' : 'rgba(255,255,255,0.4)',
          }}
        />
      </div>
      <span className="text-xs font-medium" style={{ color: checked ? '#FC712B' : '#E2D4C4', opacity: checked ? 1 : 0.5 }}>
        {label}
      </span>
    </button>
  );
}

function FileDropzone({
  label,
  accept,
  file,
  onChange,
  preview,
}: {
  label: string;
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
  preview?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onChange(f);
  };

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className="relative rounded-lg cursor-pointer transition-all duration-150 flex items-center gap-3 px-3 py-2.5"
        style={{
          background: dragOver ? 'rgba(252,113,43,0.08)' : 'rgba(255,255,255,0.03)',
          border: `1px dashed ${dragOver ? '#FC712B' : 'rgba(255,255,255,0.12)'}`,
        }}
      >
        {/* Icon */}
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
          style={{ background: 'rgba(252,113,43,0.1)' }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1v12M1 7h12" stroke="#FC712B" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          {file ? (
            <span className="text-xs truncate block" style={{ color: '#F3E9E7' }}>
              {file.name}
            </span>
          ) : preview ? (
            <span className="text-xs truncate block" style={{ color: '#FD9319' }}>
              이미지 등록됨
            </span>
          ) : (
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
              클릭 또는 드래그
            </span>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={(e) => onChange(e.target.files?.[0] || null)}
          className="hidden"
        />
      </div>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

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
  const [slots, setSlots] = useState<SlotInput[]>([{ ...EMPTY_SLOT }]);
  const [isPublic, setIsPublic] = useState(false);
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [sortOrder, setSortOrder] = useState(0);
  const [frameImage, setFrameImage] = useState<File | null>(null);
  const [thumbnailImage, setThumbnailImage] = useState<File | null>(null);
  const [frameImagePreview, setFrameImagePreview] = useState<string | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

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

  // 미리보기 그리기 - 컨테이너에 맞춰 크게 렌더링
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    const container = previewContainerRef.current;
    if (!canvas || !container || !showForm) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 컨테이너 크기에 맞춰 스케일 계산 (2:3 비율 유지)
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const scale = Math.min(
      containerWidth / canvasWidth,
      containerHeight / canvasHeight
    );
    const w = canvasWidth * scale;
    const h = canvasHeight * scale;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    // 배경
    ctx.fillStyle = '#222019';
    ctx.fillRect(0, 0, w, h);

    // 체커보드 패턴 (투명도 느낌)
    const tileSize = 12;
    for (let ty = 0; ty < h; ty += tileSize) {
      for (let tx = 0; tx < w; tx += tileSize) {
        const isEven = ((tx / tileSize) + (ty / tileSize)) % 2 === 0;
        ctx.fillStyle = isEven ? '#2a2620' : '#252119';
        ctx.fillRect(tx, ty, tileSize, tileSize);
      }
    }

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
      const colors = ['#FC712B', '#FD9319', '#4CAF50', '#2196F3', '#E040FB', '#FF5252', '#00BCD4', '#8BC34A'];
      ratios.forEach((r, i) => {
        const sx = r.x * cw;
        const sy = r.y * ch;
        const sw = r.width * cw;
        const sh = r.height * ch;

        // Fill
        c.fillStyle = colors[i % colors.length] + '18';
        c.fillRect(sx, sy, sw, sh);

        // Border
        c.strokeStyle = colors[i % colors.length];
        c.lineWidth = 2;
        c.setLineDash([6, 3]);
        c.strokeRect(sx, sy, sw, sh);
        c.setLineDash([]);

        // Label
        const labelH = 18;
        c.fillStyle = colors[i % colors.length];
        c.fillRect(sx, sy, Math.min(sw, 36), labelH);
        c.fillStyle = '#fff';
        c.font = 'bold 10px system-ui, sans-serif';
        c.textBaseline = 'middle';
        c.fillText(`#${i + 1}`, sx + 6, sy + labelH / 2);
      });
    }
  }, [showForm, canvasWidth, canvasHeight, slots, frameImagePreview, slotsToRatios]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setCanvasWidth(1600);
    setCanvasHeight(2400);
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

  const addSlot = () => {
    if (slots.length >= 8) return;
    setSlots([...slots, { ...EMPTY_SLOT }]);
  };

  const removeSlot = (index: number) => {
    if (slots.length <= 1) return;
    setSlots(slots.filter((_, i) => i !== index));
  };

  const updateSlot = (index: number, field: keyof SlotInput, value: number) => {
    const newSlots = [...slots];
    newSlots[index] = { ...newSlots[index], [field]: value };
    setSlots(newSlots);
  };

  const handleFrameImageChange = (file: File | null) => {
    setFrameImage(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setFrameImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setFrameImagePreview(null);
    }
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
      formData.append('slotCount', String(slots.length));
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
            if (showForm) { resetForm(); setShowForm(false); }
            else { resetForm(); setShowForm(true); }
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-bold transition"
          style={{ background: '#FC712B', color: 'white' }}
        >
          {showForm ? '취소' : '프레임 추가'}
        </button>
      </div>

      {/* ============================================================ */}
      {/* Form - Split Layout: Preview (left) + Settings (right) */}
      {/* ============================================================ */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <div className="flex" style={{ minHeight: '680px' }}>
            {/* ====== LEFT: Preview ====== */}
            <div
              className="flex-shrink-0 flex flex-col items-center justify-center p-6"
              style={{
                width: '340px',
                background: 'rgba(0,0,0,0.2)',
                borderRight: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div className="text-[10px] uppercase tracking-widest mb-3 font-semibold" style={{ color: '#FC712B', opacity: 0.7 }}>
                Preview
              </div>
              <div
                ref={previewContainerRef}
                className="flex items-center justify-center flex-1 w-full"
                style={{ maxHeight: '580px' }}
              >
                <canvas
                  ref={previewCanvasRef}
                  className="rounded-lg shadow-2xl"
                  style={{ maxWidth: '100%', maxHeight: '100%' }}
                />
              </div>
              <div className="mt-3 text-center">
                <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  {canvasWidth} x {canvasHeight}px
                </span>
              </div>
            </div>

            {/* ====== RIGHT: Settings ====== */}
            <div className="flex-1 p-5 overflow-y-auto space-y-5" style={{ maxHeight: '680px' }}>
              {/* Title */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold" style={{ color: '#FC712B' }}>
                  {editingFrame ? '프레임 수정' : '새 프레임'}
                </h3>
                <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  {slots.length}개 슬롯
                </span>
              </div>

              {/* 기본 정보 */}
              <div className="space-y-3">
                <div>
                  <FieldLabel>이름</FieldLabel>
                  <StyledInput value={name} onChange={(e) => setName(e.target.value)} placeholder="프레임 이름" required />
                </div>
                <div>
                  <FieldLabel>설명</FieldLabel>
                  <StyledInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder="선택 사항" />
                </div>
              </div>

              {/* 캔버스 크기 */}
              <div>
                <FieldLabel>프레임 크기 (px)</FieldLabel>
                <div className="grid grid-cols-2 gap-2">
                  <StyledInput type="number" value={canvasWidth} onChange={(e) => setCanvasWidth(Number(e.target.value))} placeholder="Width" />
                  <StyledInput type="number" value={canvasHeight} onChange={(e) => setCanvasHeight(Number(e.target.value))} placeholder="Height" />
                </div>
              </div>

              {/* 슬롯 설정 */}
              <div>
                <FieldLabel>슬롯 위치</FieldLabel>
                <div className="space-y-2">
                  {slots.map((slot, i) => {
                    const ratio = slotsToRatios()[i];
                    const colors = ['#FC712B', '#FD9319', '#4CAF50', '#2196F3', '#E040FB', '#FF5252', '#00BCD4', '#8BC34A'];
                    const color = colors[i % colors.length];
                    return (
                      <div
                        key={i}
                        className="rounded-lg p-3 space-y-2"
                        style={{
                          background: 'rgba(255,255,255,0.03)',
                          borderLeft: `3px solid ${color}`,
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold" style={{ color }}>#{i + 1}</span>
                          <div className="flex items-center gap-2">
                            {ratio && (
                              <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>
                                {ratio.x.toFixed(3)}, {ratio.y.toFixed(3)}, {ratio.width.toFixed(3)}, {ratio.height.toFixed(3)}
                              </span>
                            )}
                            {slots.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeSlot(i)}
                                className="w-5 h-5 rounded flex items-center justify-center transition-colors hover:bg-red-500/20"
                                style={{ color: 'rgba(255,255,255,0.2)' }}
                              >
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                  <path d="M2 5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {(['x', 'y', 'width', 'height'] as const).map((field) => (
                            <div key={field}>
                              <div className="text-[9px] uppercase mb-0.5" style={{ color: 'rgba(255,255,255,0.2)' }}>{field}</div>
                              <input
                                type="number"
                                value={slot[field]}
                                onChange={(e) => updateSlot(i, field, Number(e.target.value))}
                                className="w-full px-2 py-1.5 rounded text-xs outline-none transition-colors focus:ring-1 focus:ring-[#FC712B]/40"
                                style={{
                                  background: 'rgba(255,255,255,0.05)',
                                  border: '1px solid rgba(255,255,255,0.06)',
                                  color: '#F3E9E7',
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {/* Add Slot Button */}
                  {slots.length < 8 && (
                    <button
                      type="button"
                      onClick={addSlot}
                      className="w-full py-2 rounded-lg text-xs font-medium transition-all duration-150
                        hover:border-[#FC712B]/40 flex items-center justify-center gap-1.5"
                      style={{
                        border: '1px dashed rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.3)',
                        background: 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(252,113,43,0.4)';
                        e.currentTarget.style.color = '#FC712B';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                        e.currentTarget.style.color = 'rgba(255,255,255,0.3)';
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                      슬롯 추가
                    </button>
                  )}
                </div>
              </div>

              {/* 이미지 업로드 */}
              <div className="grid grid-cols-2 gap-3">
                <FileDropzone
                  label="프레임 이미지"
                  accept="image/png"
                  file={frameImage}
                  onChange={handleFrameImageChange}
                  preview={frameImagePreview}
                />
                <FileDropzone
                  label="썸네일"
                  accept="image/*"
                  file={thumbnailImage}
                  onChange={(f) => setThumbnailImage(f)}
                />
              </div>

              {/* 메타데이터 */}
              <div className="space-y-3">
                <ToggleSwitch checked={isPublic} onChange={setIsPublic} label="공용 프레임" />

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <FieldLabel>카테고리</FieldLabel>
                    <StyledInput value={category} onChange={(e) => setCategory(e.target.value)} placeholder="single" />
                  </div>
                  <div>
                    <FieldLabel>태그</FieldLabel>
                    <StyledInput value={tags} onChange={(e) => setTags(e.target.value)} placeholder="쉼표 구분" />
                  </div>
                  <div>
                    <FieldLabel>정렬</FieldLabel>
                    <StyledInput type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} placeholder="0" />
                  </div>
                </div>
              </div>

              {/* Error + Submit */}
              {error && (
                <div className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 rounded-lg text-xs font-bold text-white transition-all duration-150
                  disabled:opacity-50 hover:brightness-110 active:scale-[0.99]"
                style={{ background: 'linear-gradient(135deg, #FC712B, #FD9319)' }}
              >
                {saving ? '저장 중...' : editingFrame ? '프레임 수정' : '프레임 생성'}
              </button>
            </div>
          </div>
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
              className="flex-1 px-3 py-2 rounded-lg text-sm outline-none border appearance-none"
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
