-- 프레임 접근 권한 테이블 (비공용 프레임에 대한 유저/그룹 단위 권한)
CREATE TABLE frame_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  frame_id UUID NOT NULL REFERENCES frames(id) ON DELETE CASCADE,
  -- 유저 OR 그룹 중 하나만 설정
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT frame_access_target CHECK (
    (user_id IS NOT NULL AND group_id IS NULL) OR
    (user_id IS NULL AND group_id IS NOT NULL)
  ),
  CONSTRAINT frame_access_unique_user UNIQUE (frame_id, user_id),
  CONSTRAINT frame_access_unique_group UNIQUE (frame_id, group_id)
);

CREATE INDEX idx_frame_access_frame_id ON frame_access(frame_id);
CREATE INDEX idx_frame_access_user_id ON frame_access(user_id);
CREATE INDEX idx_frame_access_group_id ON frame_access(group_id);
