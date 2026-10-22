-- Migration 025: Create public Supabase Storage bucket for imported document images
-- Run in Supabase SQL Editor or via: supabase db push
--
-- Purpose: Imported DOCX/PDF files contain embedded images (base64).
-- Rather than storing base64 blobs inline in the document content column
-- (which balloons row size and breaks Supabase limits), images are uploaded
-- here and referenced by public URL in the saved HTML.
--
-- Bucket layout: document-images/{userId}/{documentId}/{imageKey}.{ext}

-- ── 1. Create the bucket ─────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'document-images',
  'document-images',
  true,
  52428800,  -- 50 MB per individual image file
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- ── 2. RLS policies ──────────────────────────────────────────────────────────

-- Allow anyone to read public images (they are embedded in shared documents)
CREATE POLICY "Public image read"
ON storage.objects FOR SELECT
USING (bucket_id = 'document-images');

-- Allow authenticated users to upload images
CREATE POLICY "Auth upload images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'document-images'
  AND auth.role() = 'authenticated'
);

-- Allow the uploader (first folder segment = userId) to delete their own images
CREATE POLICY "Owner delete images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'document-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
