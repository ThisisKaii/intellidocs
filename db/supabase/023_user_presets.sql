-- IntelliDocs: Migration 023 — user-forked presets (blueprint V2 versioning)
--
-- A standard blueprint (APA 7th, IEEE, UCLM Capstone) must never be edited in
-- place: every document that references it would silently change. So when a
-- user customises a blueprint's core rules (heading sizes, margins, fonts),
-- the system forks it into a row here named "<Base name> (Custom vN)" and
-- points that one document at the fork. Standard blueprints stay pristine.
--
-- `documents.formatting_preset` is a plain text column (migration 010) with no
-- foreign key, so a document can reference a user preset key unchanged.
--
-- Re-runnable: guarded DDL + drop-first policies.

create table if not exists public.user_presets (
  preset_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  -- Key of the standard blueprint this was forked from.
  base_key text not null,
  name text not null,
  description text default '',
  rules jsonb not null default '[]'::jsonb,
  -- 2 for the first fork, 3 for the next, and so on.
  version integer not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);

create index if not exists idx_user_presets_user_id
  on public.user_presets(user_id);

create index if not exists idx_user_presets_base_key
  on public.user_presets(user_id, base_key);

alter table public.user_presets enable row level security;

drop policy if exists "Users can read their own user presets" on public.user_presets;
create policy "Users can read their own user presets"
on public.user_presets for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own user presets" on public.user_presets;
create policy "Users can create their own user presets"
on public.user_presets for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own user presets" on public.user_presets;
create policy "Users can update their own user presets"
on public.user_presets for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own user presets" on public.user_presets;
create policy "Users can delete their own user presets"
on public.user_presets for delete
  using (auth.uid() = user_id);

-- Keep updated_at honest on edits.
drop trigger if exists trg_user_presets_updated_at on public.user_presets;
create trigger trg_user_presets_updated_at
  before update on public.user_presets
  for each row execute function public.set_updated_at();
