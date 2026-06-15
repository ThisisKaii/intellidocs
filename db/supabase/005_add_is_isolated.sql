-- Add is_isolated column to documents table.
-- When true, behavioral events for this document are excluded
-- from the Redis/DuckDB learning pipeline.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS is_isolated BOOLEAN DEFAULT FALSE;
