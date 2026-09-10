-- Migration 016: Google-Drive-style copyable share links
--
-- A document owner can mint a share token that grants read-only access via a
-- link. The token is stored on the documents row so recipient access checks
-- stay in one table. Access control is enforced server-side in the model layer
-- (Supabase is accessed with the service key, which bypasses RLS).

alter table public.documents
  add column if not exists share_token text,
  add column if not exists share_permission text not null default 'view';

create unique index if not exists idx_documents_share_token
  on public.documents(share_token) where (share_token is not null);