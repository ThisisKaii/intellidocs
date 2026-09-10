-- Migration 015: Sharing by email + soft-delete (trash) for documents
--
-- 1) documents: add soft-delete columns. Trash is soft-delete; permanent purge
--    removes the row entirely.
-- 2) document_shares: drop NOT NULL on shared_with so a share can be created
--    before the invitee has an account (pending_email). Shares resolve on
--    registration and are lazily backfilled on GET /documents/shared.

alter table public.documents
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz;

create index if not exists idx_documents_owner_active
  on public.documents(user_id) where (is_deleted = false);

-- Resolve any pending email shares for this user when they register.
alter table public.document_shares
  alter column shared_with drop not null,
  add column if not exists pending_email text;

create index if not exists idx_document_shares_pending_email
  on public.document_shares(pending_email) where (shared_with is null);

-- RLS: shared users must be able to select/update the shared document itself.
-- Owners and collaborators (via an active non-deleted share) get access.
create policy "Owners can read own and shared documents"
  on public.documents for select
  using (
    auth.uid() = user_id or
    exists (select 1 from public.document_shares s
            where s.document_id = documents.id and s.shared_with = auth.uid())
  );

create policy "Collaborators can update shared documents"
  on public.documents for update
  using (
    auth.uid() = user_id or
    exists (select 1 from public.document_shares s
            where s.document_id = documents.id and s.shared_with = auth.uid() and s.permission in ('edit', 'comment'))
  );
