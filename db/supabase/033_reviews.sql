-- Migration 033: Tester reviews (bug reports) with optional screenshots
-- Rows are written by the Express server with the service key; read them in
-- the Supabase table editor. Images live in the public `review-images` bucket
-- under {userId}/{uuid}.{ext} (unguessable paths).

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  page_path text,
  image_urls text[] not null default '{}',
  user_agent text,
  created_at timestamptz default now()
);

create index if not exists idx_reviews_created_at on public.reviews(created_at desc);

alter table public.reviews enable row level security;

create policy "Users can read their own reviews"
on public.reviews for select
using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'review-images',
  'review-images',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
on conflict (id) do nothing;
