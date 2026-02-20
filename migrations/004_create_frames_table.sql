-- 프레임 관리 테이블
CREATE TABLE frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Frame image (R2 storage)
  frame_file_id UUID REFERENCES files(id) ON DELETE SET NULL,
  thumbnail_file_id UUID REFERENCES files(id) ON DELETE SET NULL,

  -- Frame dimensions (기준 픽셀 크기)
  canvas_width INT NOT NULL DEFAULT 1600,
  canvas_height INT NOT NULL DEFAULT 2400,

  -- Slot positions (ratio-based JSON array)
  -- [{ x, y, width, height, zIndex }] (0-1 ratios)
  slot_positions JSONB NOT NULL DEFAULT '[]',
  slot_count INT NOT NULL DEFAULT 1,

  -- Access control
  is_public BOOLEAN NOT NULL DEFAULT false,

  -- Metadata
  category VARCHAR(50),
  tags TEXT[] DEFAULT '{}',
  sort_order INT DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_frames_is_public ON frames(is_public);
CREATE INDEX idx_frames_is_active ON frames(is_active);
CREATE INDEX idx_frames_category ON frames(category);
CREATE INDEX idx_frames_sort_order ON frames(sort_order);
