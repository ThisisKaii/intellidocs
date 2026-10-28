-- Migration 034: which documents each user opened, and when
--
-- Powers the "Recent" view: a document is recent for 7 days after the user last
-- OPENED it (not edited it). Opening it again moves it to the top and restarts the
-- 7 days. One row per (user, document); written by the Express server with the
-- service key, so the user only needs the read policy.

create table if not exists public.document_opens (
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  last_opened_at timestamptz not null default now(),
  primary key (user_id, document_id)
);

create index if not exists idx_document_opens_user_recent
  on public.document_opens(user_id, last_opened_at desc);

alter table public.document_opens enable row level security;

create policy "Users can read their own document opens"
on public.document_opens for select
using (auth.uid() = user_id);
