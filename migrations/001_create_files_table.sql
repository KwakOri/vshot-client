-- ============================================
-- Migration: 001_create_files_table
-- Description: Create files table for R2 storage management
-- Date: 2024
-- ============================================

-- Create files table
CREATE TABLE IF NOT EXISTS files (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Storage location
  bucket VARCHAR(255) NOT NULL,
  object_key TEXT NOT NULL,

  -- File metadata
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size BIGINT NOT NULL,

  -- Ownership
  owner_id UUID NULL,

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'pending',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_at TIMESTAMPTZ NULL,
  deleted_at TIMESTAMPTZ NULL,

  -- Constraints
  CONSTRAINT files_object_key_unique UNIQUE (object_key),
  CONSTRAINT files_status_check CHECK (status IN ('pending', 'uploaded', 'deleted')),
  CONSTRAINT files_size_positive CHECK (size >= 0)
);

-- ============================================
-- Indexes
-- ============================================

-- Index for querying by status (common operation)
CREATE INDEX IF NOT EXISTS idx_files_status ON files (status);

-- Index for querying by owner
CREATE INDEX IF NOT EXISTS idx_files_owner_id ON files (owner_id) WHERE owner_id IS NOT NULL;

-- Index for cleanup job (finding old pending files)
CREATE INDEX IF NOT EXISTS idx_files_pending_created ON files (created_at) WHERE status = 'pending';

-- Index for querying uploaded files by creation time
CREATE INDEX IF NOT EXISTS idx_files_uploaded_created ON files (created_at DESC) WHERE status = 'uploaded';

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE files IS 'File storage records for Cloudflare R2 objects';
COMMENT ON COLUMN files.id IS 'Unique file identifier (UUID)';
COMMENT ON COLUMN files.bucket IS 'R2 bucket name';
COMMENT ON COLUMN files.object_key IS 'R2 object key (unique path within bucket)';
COMMENT ON COLUMN files.original_filename IS 'Original filename provided by user';
COMMENT ON COLUMN files.content_type IS 'MIME type of the file';
COMMENT ON COLUMN files.size IS 'File size in bytes';
COMMENT ON COLUMN files.owner_id IS 'Optional owner user ID';
COMMENT ON COLUMN files.status IS 'File status: pending (upload in progress), uploaded (complete), deleted (soft delete)';
COMMENT ON COLUMN files.created_at IS 'Timestamp when DB record was created';
COMMENT ON COLUMN files.uploaded_at IS 'Timestamp when R2 upload completed';
COMMENT ON COLUMN files.deleted_at IS 'Timestamp when file was deleted';

-- ============================================
-- Row Level Security (Optional - Enable if using Supabase Auth)
-- ============================================

-- Uncomment the following if you want to enable RLS:

-- ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- -- Policy: Users can only view their own uploaded files
-- CREATE POLICY "Users can view own files"
--   ON files
--   FOR SELECT
--   USING (
--     status = 'uploaded' AND (
--       owner_id IS NULL OR
--       owner_id = auth.uid()
--     )
--   );

-- -- Policy: Users can only delete their own files
-- CREATE POLICY "Users can delete own files"
--   ON files
--   FOR UPDATE
--   USING (owner_id = auth.uid())
--   WITH CHECK (status = 'deleted');

-- -- Policy: Service role can do anything (for API routes)
-- CREATE POLICY "Service role full access"
--   ON files
--   FOR ALL
--   USING (auth.role() = 'service_role');
