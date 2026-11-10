-- Migration 042: each user's own pinned documents
--
-- Powers the "Pinned" view in the sidebar. A pin belongs to the user who made
-- it, so anyone can pin a document they can open (their own, or one shared with
-- them) without changing it for anybody else. One row per (user, document);
-- written by the Express server with the service key, so the user only needs
-- the read policy. Replaces the per-document documents.is_pinned flag (041).

create table if not exists public.document_pins (
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (user_id, document_id)
);

create index if not exists idx_document_pins_user_recent
  on public.document_pins(user_id, pinned_at desc);

alter table public.document_pins enable row level security;

drop policy if exists "Users can read their own document pins" on public.document_pins;
create policy "Users can read their own document pins"
on public.document_pins for select
using (auth.uid() = user_id);

-- Keep the pins made with the earlier per-document flag (migration 041), if it was applied.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'documents' and column_name = 'is_pinned'
  ) then
    insert into public.document_pins (user_id, document_id)
    select user_id, id from public.documents where is_pinned
    on conflict do nothing;
  end if;
end $$;
