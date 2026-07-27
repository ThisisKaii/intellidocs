-- IntelliDocs: Migration 007 — Enhanced Schema
-- Roles, Profiles, Collaboration Shares, Professor Reviews/Comments, Notifications, and Reports

create extension if not exists "pgcrypto";

-- 1) ROLES & PROFILES
create table if not exists public.roles (
  role_id serial primary key,
  role_name varchar(50) unique not null
);

insert into public.roles (role_name) values ('student'), ('professor'), ('admin')
on conflict (role_name) do nothing;

create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  role_id integer not null default 1 references public.roles(role_id),
  display_name varchar(100),
  phone varchar(20),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.roles enable row level security;
alter table public.user_profiles enable row level security;

create policy "Anyone can read roles" on public.roles for select using (true);

create policy "Users can read user_profiles" on public.user_profiles for select using (true);
create policy "Users can insert own profile" on public.user_profiles for insert with check (auth.uid() = user_id);
create policy "Users can update own profile" on public.user_profiles for update using (auth.uid() = user_id);

-- 2) DOCUMENT SHARES (Collaborative access)
create table if not exists public.document_shares (
  share_id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  shared_with uuid not null references auth.users(id) on delete cascade,
  permission text not null check (permission in ('view', 'comment', 'edit')),
  shared_at timestamptz default now()
);

alter table public.document_shares enable row level security;

create policy "Owners and shared users can view shares" on public.document_shares for select
  using (auth.uid() = owner_id or auth.uid() = shared_with);
create policy "Owners can manage shares" on public.document_shares for all
  using (auth.uid() = owner_id);

-- 3) PROFESSOR REVIEW & COMMENTS
create table if not exists public.document_comments (
  comment_id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  highlighted_text text,
  comment text not null,
  created_at timestamptz default now()
);

create table if not exists public.document_reviews (
  review_id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  grade numeric(5,2),
  status text not null check (status in ('pending', 'under_review', 'graded', 'returned')),
  notes text,
  reviewed_at timestamptz default now()
);

alter table public.document_comments enable row level security;
alter table public.document_reviews enable row level security;

create policy "Document owners and reviewers can view comments" on public.document_comments for select
  using (
    auth.uid() = user_id or 
    exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid()) or
    exists (select 1 from public.document_shares s where s.document_id = document_comments.document_id and s.shared_with = auth.uid())
  );

create policy "Users can insert comments on shared/owned documents" on public.document_comments for insert
  with check (auth.uid() = user_id);

create policy "Reviewers and students can view reviews" on public.document_reviews for select
  using (auth.uid() = reviewer_id or auth.uid() = student_id);

create policy "Reviewers can insert/update reviews" on public.document_reviews for all
  using (auth.uid() = reviewer_id);

-- 4) NOTIFICATIONS & REPORTS
create table if not exists public.notifications (
  notification_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  read boolean default false,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.reports (
  report_id uuid primary key default gen_random_uuid(),
  generated_by uuid not null references auth.users(id) on delete cascade,
  report_type text not null,
  parameters jsonb default '{}'::jsonb,
  file_path text,
  generated_at timestamptz default now()
);

alter table public.notifications enable row level security;
alter table public.reports enable row level security;

create policy "Users can manage own notifications" on public.notifications for all using (auth.uid() = user_id);
create policy "Users can read own reports" on public.reports for select using (auth.uid() = generated_by);
create policy "Users can insert own reports" on public.reports for insert with check (auth.uid() = generated_by);
