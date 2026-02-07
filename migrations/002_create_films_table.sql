CREATE TABLE films (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id TEXT NOT NULL,
  session_id TEXT,
  photo_file_id UUID REFERENCES files(id) ON DELETE SET NULL,
  video_file_id UUID REFERENCES files(id) ON DELETE SET NULL,
  qr_code_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  status TEXT NOT NULL DEFAULT 'active'
);
CREATE INDEX idx_films_expires_at ON films(expires_at);
CREATE INDEX idx_films_status ON films(status);
CREATE INDEX idx_films_room_id ON films(room_id);
