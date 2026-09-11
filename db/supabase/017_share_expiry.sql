-- Migration 017: share-link expiry
--
-- Owners can set an expiry on a copyable share link. Expired links are treated
-- as revoked server-side in the model layer (read and write paths both check
-- share_expires_at against the current time before granting access).

alter table public.documents
  add column if not exists share_expires_at timestamptz;