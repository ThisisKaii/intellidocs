-- Migration 020: Personalization settings for .idocprofile export/import
-- Per-user grammar/spelling personalization: custom dictionary and ignored
-- patterns. Formatting personalization already lives in format_bindings.

create table if not exists public.personalization_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key in ('custom_dictionary', 'ignored_patterns')),
  value jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (user_id, key)
);

alter table public.personalization_settings enable row level security;

create policy "Users can read their own personalization settings"
on public.personalization_settings for select
using (auth.uid() = user_id);

create policy "Users can insert their own personalization settings"
on public.personalization_settings for insert
with check (auth.uid() = user_id);

create policy "Users can update their own personalization settings"
on public.personalization_settings for update
using (auth.uid() = user_id);

create policy "Users can delete their own personalization settings"
on public.personalization_settings for delete
using (auth.uid() = user_id);
