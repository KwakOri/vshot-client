-- films 테이블에 frame_id 추가 (촬영 시 사용된 프레임 추적)
ALTER TABLE films ADD COLUMN frame_id UUID REFERENCES frames(id) ON DELETE SET NULL;

CREATE INDEX idx_films_frame_id ON films(frame_id);
