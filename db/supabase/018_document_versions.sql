-- Migration 018: document version history (undo-lock safety net)
--
-- Every saved document state is snapshotted here (throttled in the model layer,
-- one snapshot per couple of seconds). Version rows are immutable: restoring a
-- version copies it onto the documents row; the original snapshot is never
-- overwritten, so the full history stays intact.

create table if not exists public.document_versions (
  version_id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  title text not null,
  page_size text,
  margins jsonb,
  orientation text,
  editor_prefs jsonb,
  reason text not null default 'autosave',
  created_at timestamptz default now()
);

create index if not exists idx_document_versions_document_id
on public.document_versions(document_id, created_at desc);

create index if not exists idx_document_versions_user_id
on public.document_versions(user_id);

alter table public.document_versions enable row level security;

create policy "Users can read their own document versions"
on public.document_versions for select
using (auth.uid() = user_id);

create policy "Users can insert their own document versions"
on public.document_versions for insert
with check (auth.uid() = user_id);

create policy "Users can delete their own document versions"
on public.document_versions for delete
using (auth.uid() = user_id);