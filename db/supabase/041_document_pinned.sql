-- Pinned documents: the owner can keep important documents (an active thesis)
-- at the top of the dashboard. Only the owner can change it (documentModel).
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;
