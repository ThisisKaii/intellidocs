-- IntelliDocs: documents table + RLS policies
-- Apply in Supabase SQL editor or DBeaver

-- 1) Documents table
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text default '',
  formatting_history jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2) Index for faster lookup by user
create index if not exists idx_documents_user_id
on public.documents(user_id);

-- 3) Enable Row Level Security
alter table public.documents enable row level security;

-- 4) RLS Policies
create policy "Users can read their own documents"
on public.documents
for select
using (auth.uid() = user_id);

create policy "Users can insert their own documents"
on public.documents
for insert
with check (auth.uid() = user_id);

create policy "Users can update their own documents"
on public.documents
for update
using (auth.uid() = user_id);

create policy "Users can delete their own documents"
on public.documents
for delete
using (auth.uid() = user_id);