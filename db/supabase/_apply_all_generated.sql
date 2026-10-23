-- IntelliDocs: all migrations in dependency order. Generated file - do not commit.
-- Run once in the Supabase SQL Editor on a fresh project (000_users_reference.sql is documentation only and is skipped).

-- ==================== 0004_default_drive_folder.sql ====================
-- IntelliDocs: create default "My Drive" folder on user signup

create or replace function public.create_default_drive_folder()
returns trigger
language plpgsql
security definer
set search_path = public as $$
begin
  insert into public.folders (user_id, name, parent_id)
  values (new.id, 'My Drive', null);
  return new;
end;
$$;

drop trigger if exists trg_create_default_drive_folder on auth.users;

create trigger trg_create_default_drive_folder
after insert on auth.users
for each row execute function public.create_default_drive_folder();

-- ==================== 001_create_documents.sql ====================
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

-- ==================== 002_create_app_tables.sql ====================
-- IntelliDocs: folders + actions + AI + grammar tables + RLS
-- (Supabase / Postgres-ready)

create extension if not exists "pgcrypto";

-- 1) FOLDERS
create table if not exists public.folders (
  folder_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  parent_id uuid null references public.folders(folder_id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_folders_user_id
on public.folders(user_id);

alter table public.folders enable row level security;

create policy "Users can read their own folders"
on public.folders for select
using (auth.uid() = user_id);

create policy "Users can insert their own folders"
on public.folders for insert
with check (auth.uid() = user_id);

create policy "Users can update their own folders"
on public.folders for update
using (auth.uid() = user_id);

create policy "Users can delete their own folders"
on public.folders for delete
using (auth.uid() = user_id);

-- 2) FOLDER_DOCUMENTS (junction)
create table if not exists public.folder_documents (
  folder_id uuid not null references public.folders(folder_id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  added_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (folder_id, document_id)
);

create index if not exists idx_folder_documents_folder_id
on public.folder_documents(folder_id);

create index if not exists idx_folder_documents_document_id
on public.folder_documents(document_id);

alter table public.folder_documents enable row level security;

create policy "Users can read their own folder documents"
on public.folder_documents for select
using (
  exists (
    select 1
    from public.folders f
    where f.folder_id = folder_documents.folder_id
      and f.user_id = auth.uid()
  )
);

create policy "Users can insert their own folder documents"
on public.folder_documents for insert
with check (
  exists (
    select 1
    from public.folders f
    where f.folder_id = folder_documents.folder_id
      and f.user_id = auth.uid()
  )
);

create policy "Users can update their own folder documents"
on public.folder_documents for update
using (
  exists (
    select 1
    from public.folders f
    where f.folder_id = folder_documents.folder_id
      and f.user_id = auth.uid()
  )
);

create policy "Users can delete their own folder documents"
on public.folder_documents for delete
using (
  exists (
    select 1
    from public.folders f
    where f.folder_id = folder_documents.folder_id
      and f.user_id = auth.uid()
  )
);

-- 3) FORMATTING_ACTIONS
create table if not exists public.formatting_actions (
  action_id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null,
  action_source text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_formatting_actions_user_id
on public.formatting_actions(user_id);

create index if not exists idx_formatting_actions_document_id
on public.formatting_actions(document_id);

alter table public.formatting_actions enable row level security;

create policy "Users can read their own formatting actions"
on public.formatting_actions for select
using (auth.uid() = user_id);

create policy "Users can insert their own formatting actions"
on public.formatting_actions for insert
with check (auth.uid() = user_id);

create policy "Users can update their own formatting actions"
on public.formatting_actions for update
using (auth.uid() = user_id);

create policy "Users can delete their own formatting actions"
on public.formatting_actions for delete
using (auth.uid() = user_id);

-- 4) AI_SUGGESTIONS
create table if not exists public.ai_suggestions (
  suggestion_id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  suggested_format text not null,
  confidence numeric(5,2) not null,
  reason text,
  status text default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_ai_suggestions_user_id
on public.ai_suggestions(user_id);

create index if not exists idx_ai_suggestions_document_id
on public.ai_suggestions(document_id);

alter table public.ai_suggestions enable row level security;

create policy "Users can read their own AI suggestions"
on public.ai_suggestions for select
using (auth.uid() = user_id);

create policy "Users can insert their own AI suggestions"
on public.ai_suggestions for insert
with check (auth.uid() = user_id);

create policy "Users can update their own AI suggestions"
on public.ai_suggestions for update
using (auth.uid() = user_id);

create policy "Users can delete their own AI suggestions"
on public.ai_suggestions for delete
using (auth.uid() = user_id);

-- 5) SUGGESTION_FEEDBACK
create table if not exists public.suggestion_feedback (
  feedback_id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null references public.ai_suggestions(suggestion_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  decision text not null,
  decided_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_suggestion_feedback_user_id
on public.suggestion_feedback(user_id);

create index if not exists idx_suggestion_feedback_suggestion_id
on public.suggestion_feedback(suggestion_id);

alter table public.suggestion_feedback enable row level security;

create policy "Users can read their own suggestion feedback"
on public.suggestion_feedback for select
using (auth.uid() = user_id);

create policy "Users can insert their own suggestion feedback"
on public.suggestion_feedback for insert
with check (auth.uid() = user_id);

create policy "Users can update their own suggestion feedback"
on public.suggestion_feedback for update
using (auth.uid() = user_id);

create policy "Users can delete their own suggestion feedback"
on public.suggestion_feedback for delete
using (auth.uid() = user_id);

-- 6) GRAMMAR_ISSUES
create table if not exists public.grammar_issues (
  issue_id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  issue_type text not null,
  original_text text not null,
  suggestion_text text,
  resolved_at timestamptz null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_grammar_issues_user_id
on public.grammar_issues(user_id);

create index if not exists idx_grammar_issues_document_id
on public.grammar_issues(document_id);

alter table public.grammar_issues enable row level security;

create policy "Users can read their own grammar issues"
on public.grammar_issues for select
using (auth.uid() = user_id);

create policy "Users can insert their own grammar issues"
on public.grammar_issues for insert
with check (auth.uid() = user_id);

create policy "Users can update their own grammar issues"
on public.grammar_issues for update
using (auth.uid() = user_id);

create policy "Users can delete their own grammar issues"
on public.grammar_issues for delete
using (auth.uid() = user_id);

-- ==================== 003_updated_at_triggers.sql ====================
-- IntelliDocs: updated_at triggers for new tables

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- folders
drop trigger if exists trg_folders_updated_at on public.folders;
create trigger trg_folders_updated_at
before update on public.folders
for each row execute function public.set_updated_at();

-- folder_documents
drop trigger if exists trg_folder_documents_updated_at on public.folder_documents;
create trigger trg_folder_documents_updated_at
before update on public.folder_documents
for each row execute function public.set_updated_at();

-- formatting_actions
drop trigger if exists trg_formatting_actions_updated_at on public.formatting_actions;
create trigger trg_formatting_actions_updated_at
before update on public.formatting_actions
for each row execute function public.set_updated_at();

-- ai_suggestions
drop trigger if exists trg_ai_suggestions_updated_at on public.ai_suggestions;
create trigger trg_ai_suggestions_updated_at
before update on public.ai_suggestions
for each row execute function public.set_updated_at();

-- suggestion_feedback
drop trigger if exists trg_suggestion_feedback_updated_at on public.suggestion_feedback;
create trigger trg_suggestion_feedback_updated_at
before update on public.suggestion_feedback
for each row execute function public.set_updated_at();

-- grammar_issues
drop trigger if exists trg_grammar_issues_updated_at on public.grammar_issues;
create trigger trg_grammar_issues_updated_at
before update on public.grammar_issues
for each row execute function public.set_updated_at();

-- ==================== 005_add_is_isolated.sql ====================
-- Add is_isolated column to documents table.
-- When true, behavioral events for this document are excluded
-- from the Redis/DuckDB learning pipeline.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS is_isolated BOOLEAN DEFAULT FALSE;

-- ==================== 006_google_tokens.sql ====================
-- Google Drive OAuth2 token storage.
-- One row per user; upserted on each re-authorization.
CREATE TABLE IF NOT EXISTS public.google_tokens (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expiry_date   BIGINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- RLS: users can only read/write their own tokens
ALTER TABLE public.google_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY google_tokens_select ON public.google_tokens
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY google_tokens_insert ON public.google_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY google_tokens_update ON public.google_tokens
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY google_tokens_delete ON public.google_tokens
  FOR DELETE USING (auth.uid() = user_id);

-- ==================== 007_enhanced_schema.sql ====================
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

-- ==================== 008_admin_and_block_ids.sql ====================
-- IntelliDocs: Migration 008 — Admin Role Support & Block-Level Unique Identifiers
-- Adds verification_status to user_profiles, block_id tracking, and Admin RLS policies

-- 1) USER PROFILES: Verification Status for Professors
alter table public.user_profiles
add column if not exists verification_status text not null default 'approved'
check (verification_status in ('pending', 'approved', 'rejected'));

-- 2) BLOCK-LEVEL UNIQUE IDENTIFIERS TRACKING
alter table public.formatting_actions
add column if not exists block_id text;

alter table public.ai_suggestions
add column if not exists block_id text;

-- 3) ADMIN RLS POLICIES
-- Admin helper function checking if current user is an admin
create or replace function public.is_admin()
returns boolean as $$
begin
  return exists (
    select 1
    from public.user_profiles up
    join public.roles r on up.role_id = r.role_id
    where up.user_id = auth.uid()
      and r.role_name = 'admin'
  );
end;
$$ language plpgsql security definer;

-- Admin policies on user_profiles
create policy "Admins can view all user profiles" on public.user_profiles for select
  using (public.is_admin());

create policy "Admins can update all user profiles" on public.user_profiles for update
  using (public.is_admin());

-- Admin policies on documents (Moderation)
create policy "Admins can view all documents" on public.documents for select
  using (public.is_admin());

create policy "Admins can update all documents" on public.documents for update
  using (public.is_admin());

create policy "Admins can delete any document" on public.documents for delete
  using (public.is_admin());

-- Admin policies on reports (System-wide Analytics)
create policy "Admins can view all reports" on public.reports for select
  using (public.is_admin());

-- Admin policies on document_reviews & comments
create policy "Admins can view all document reviews" on public.document_reviews for select
  using (public.is_admin());

create policy "Admins can update all document reviews" on public.document_reviews for update
  using (public.is_admin());

create policy "Admins can view all document comments" on public.document_comments for select
  using (public.is_admin());

-- ==================== 009_header_footer_content.sql ====================
-- Migration 009: Add header_content and footer_content to documents table
-- Run in Supabase SQL Editor

alter table public.documents
  add column if not exists header_content text default '',
  add column if not exists footer_content text default '';

-- No RLS changes needed — existing policies already cover all columns.

-- ==================== 010_formatting_tiers.sql ====================
-- Migration 010: Three-tier formatting control system
-- Tier 1: formatting_presets (predefined rule sets)
-- Tier 2: format_bindings (per-user hard rules)
-- Documents get a formatting_preset column (selected Tier 1 profile).

-- 1) Documents: track the active preset profile
alter table public.documents
  add column if not exists formatting_preset text default null;

-- 2) Formatting presets (Tier 1)
create table if not exists public.formatting_presets (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text not null default '',
  rules jsonb not null default '[]'::jsonb,
  is_system boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.formatting_presets enable row level security;

create policy "Anyone can read formatting presets"
on public.formatting_presets for select
using (true);

-- Seed the five planned presets.
insert into public.formatting_presets (key, name, description, rules) values
('academic', 'Academic Research Paper', 'Standard academic paper: H2 for sections, H3 for subsections, short lines become headings.',
 '[{"condition":{"maxWords":8,"standaloneLine":true},"format":"heading2","priority":10},{"condition":{"maxWords":20,"standaloneLine":true},"format":"heading3","priority":5}]'),
('thesis', 'Thesis / Dissertation', 'Thesis structure: chapter titles as H1, sections as H2.',
 '[{"condition":{"startsWith":"Chapter"},"format":"heading1","priority":20},{"condition":{"maxWords":8,"standaloneLine":true},"format":"heading2","priority":10}]'),
('business_letter', 'Business Letter', 'Formal letter: salutation and closing as paragraphs, short lines become paragraphs.',
 '[{"condition":{"startsWith":"Dear"},"format":"paragraph","priority":10},{"condition":{"startsWith":"Sincerely"},"format":"paragraph","priority":10},{"condition":{"maxChars":40,"standaloneLine":true},"format":"paragraph","priority":5}]'),
('general', 'General Document', 'Neutral baseline: short standalone lines become headings, long text stays paragraph.',
 '[{"condition":{"maxWords":6,"standaloneLine":true},"format":"heading2","priority":10}]'),
('custom', 'Custom', 'Start with an empty profile and let your custom bindings define formatting.',
 '[]'::jsonb)
on conflict (key) do nothing;

-- 3) Custom format bindings (Tier 2)
create table if not exists public.format_bindings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger_condition jsonb not null default '{}'::jsonb,
  format_to_apply text not null,
  priority int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_format_bindings_user_id
on public.format_bindings(user_id);

alter table public.format_bindings enable row level security;

create policy "Users can read their own format bindings"
on public.format_bindings for select
using (auth.uid() = user_id);

create policy "Users can insert their own format bindings"
on public.format_bindings for insert
with check (auth.uid() = user_id);

create policy "Users can update their own format bindings"
on public.format_bindings for update
using (auth.uid() = user_id);

create policy "Users can delete their own format bindings"
on public.format_bindings for delete
using (auth.uid() = user_id);

-- ==================== 011_header_footer_settings.sql ====================
-- Migration 011: Header/footer visibility toggles + page-number formats
-- Run in Supabase SQL Editor

alter table public.documents
  add column if not exists show_header boolean not null default false,
  add column if not exists show_footer boolean not null default false,
  add column if not exists header_number_format text not null default 'none',
  add column if not exists footer_number_format text not null default 'none';

-- 'none' | 'number' (1, 2, 3…) | 'roman' (I, II, III…)

-- No RLS changes needed — existing policies already cover all columns.

-- ==================== 012_page_setup.sql ====================
-- Migration 012: Page setup (size, margins, orientation) for imported documents
-- Run in Supabase SQL Editor

alter table public.documents
  add column if not exists page_size text not null default 'short',
  add column if not exists margins jsonb not null default '{"top":1,"bottom":1,"left":1.5,"right":1}',
  add column if not exists orientation text not null default 'portrait';

-- page_size: 'short' | 'long' | 'a4' | 'letter' | 'legal'
-- orientation: 'portrait' | 'landscape'
-- margins: { top, bottom, left, right } in inches

-- No RLS changes needed — existing policies already cover all columns.

-- ==================== 013_prediction_feedback.sql ====================
-- Migration 013: AI Prediction Feedback & Accuracy Tracking
-- Stores structured accept/reject logs for RQ1/RQ2/RQ4 research data analysis

create table if not exists public.prediction_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  prediction_type text not null check (prediction_type in ('format_prompt', 'suggestion_panel', 'chat_preview')),
  predicted_format text not null,
  confidence float default null,
  accepted boolean not null,
  created_at timestamptz default now()
);

-- Index for fast user feedback lookup and accuracy aggregation
create index if not exists idx_prediction_feedback_user_id
on public.prediction_feedback(user_id, created_at desc);

create index if not exists idx_prediction_feedback_doc_id
on public.prediction_feedback(document_id);

-- Enable RLS
alter table public.prediction_feedback enable row level security;

-- RLS Policies
create policy "Users can read their own prediction feedback"
on public.prediction_feedback for select
using (auth.uid() = user_id);

create policy "Users can insert their own prediction feedback"
on public.prediction_feedback for insert
with check (auth.uid() = user_id);

-- ==================== 014_academic_presets.sql ====================
-- Migration 014: Seed academic one-click presets
-- The styles ribbon applies these tier-1 profiles (they are companions to 010's
-- five base presets). Each row maps to `frontend/src/components/editor/academicPresets.ts`.
-- On conflict the seed is skipped so manual edits are never overwritten.

insert into public.formatting_presets (key, name, description, rules) values
('uclm_capstone', 'UCLM Capstone (Thesis)', 'UCLM spec — left margin 1.5", double-spaced Arial/Times 12pt, uppercase centered chapter headings, roman preliminary page numbers.',
  '[{"page":{"size":"letter","orientation":"portrait","margins":{"top":1,"bottom":1,"left":1.5,"right":1}},"format":"academic_layout"}]'),
('apa_7th', 'APA 7th Edition', 'APA 7 — 1" margins, Times New Roman 12pt, double-spaced, centered title, five-level headings.',
  '[{"page":{"size":"letter","orientation":"portrait","margins":{"top":1,"bottom":1,"left":1,"right":1}},"format":"academic_layout"}]'),
('ieee', 'IEEE Conference', 'IEEE — 0.75" margins, Times New Roman 10pt, single-ish spacing, numbered headings.',
  '[{"page":{"size":"letter","orientation":"portrait","margins":{"top":0.75,"bottom":0.75,"left":0.75,"right":0.75}},"format":"academic_layout"}]')
on conflict (key) do nothing;

-- ==================== 015_sharing_trash.sql ====================
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

-- ==================== 016_share_links.sql ====================
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

-- ==================== 017_share_expiry.sql ====================
-- Migration 017: share-link expiry
--
-- Owners can set an expiry on a copyable share link. Expired links are treated
-- as revoked server-side in the model layer (read and write paths both check
-- share_expires_at against the current time before granting access).

alter table public.documents
  add column if not exists share_expires_at timestamptz;

-- ==================== 018_document_versions.sql ====================
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

-- ==================== 019_document_versions_enhance.sql ====================
-- Migration 019: enrich document version snapshots (plan point 22)
-- Adds sequential version numbering and word counts used by the history
-- timeline and the visual diff comparator (plan point 23).

alter table public.document_versions
  add column if not exists version_number integer;

alter table public.document_versions
  add column if not exists word_count integer;

-- Number historical rows that predate this migration in chronological order.
update public.document_versions
set version_number = seq.seq
from (
  select version_id, row_number() over (
    partition by document_id
    order by created_at asc
  ) as seq
  from public.document_versions
) as seq
where public.document_versions.version_id = seq.version_id
  and public.document_versions.version_number is null;

-- Keep numbering consistent for every new snapshot going forward.
create or replace function public.set_version_number()
returns trigger
language plpgsql
as $$
declare
  next_number integer;
begin
  select coalesce(max(version_number), 0) + 1
  into next_number
  from public.document_versions
  where document_id = new.document_id;

  new.version_number := next_number;
  return new;
end;
$$;

drop trigger if exists trg_document_versions_number on public.document_versions;
create trigger trg_document_versions_number
before insert on public.document_versions
for each row
execute function public.set_version_number();

-- ==================== 020_personalization_settings.sql ====================
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

-- ==================== 021_admin_schema_gap.sql ====================
-- IntelliDocs: Migration 021 — Admin role support gap (008 only)
--
-- Earlier probing assumed some tables were missing; they were not (the probe
-- used the wrong PK column names). The deployed DB only lacks the piece that
-- migration 008 introduced: user_profiles.verification_status + the admin
-- RLS function/policies. Those break every /admin endpoint:
--   - getAllUsers selects verification_status          -> 500 /admin/users
--   - getPendingProfessorApplicants filters on it      -> 500 /admin/professors/pending
--   - getSystemReports / exportEmpirical count on it   -> 500 /admin/reports, /export-empirical
--
-- Re-runnable: every statement is guarded (IF NOT EXISTS / DROP + CREATE).

-- 1) Verification status for professor applicants
alter table public.user_profiles
add column if not exists verification_status text not null default 'approved'
check (verification_status in ('pending', 'approved', 'rejected'));

-- 2) Admin helper: is the calling user an admin?
  create or replace function public.is_admin()
returns boolean as $$
begin
  return exists (
    select 1
    from public.user_profiles up
    join public.roles r on up.role_id = r.role_id
    where up.user_id = auth.uid()
      and r.role_name = 'admin'
  );
end;
$$ language plpgsql security definer;

-- 3) Admin RLS policies (drop-first so the script is safe to re-run)
drop policy if exists "Admins can view all user profiles" on public.user_profiles;
create policy "Admins can view all user profiles" on public.user_profiles for select
  using (public.is_admin());  

drop policy if exists "Admins can update all user profiles" on public.user_profiles;
create policy "Admins can update all user profiles" on public.user_profiles for update
  using (public.is_admin());

drop policy if exists "Admins can view all documents" on public.documents;
create policy "Admins can view all documents" on public.documents for select
  using (public.is_admin());

drop policy if exists "Admins can update all documents" on public.documents;
create policy "Admins can update all documents" on public.documents for update
  using (public.is_admin());

drop policy if exists "Admins can delete any document" on public.documents;
create policy "Admins can delete any document" on public.documents for delete
  using (public.is_admin());

drop policy if exists "Admins can view all reports" on public.reports;
create policy "Admins can view all reports" on public.reports for select
  using (public.is_admin());

drop policy if exists "Admins can view all document reviews" on public.document_reviews;
create policy "Admins can view all document reviews" on public.document_reviews for select
  using (public.is_admin());

drop policy if exists "Admins can update all document reviews" on public.document_reviews;
create policy "Admins can update all document reviews" on public.document_reviews for update
  using (public.is_admin());

drop policy if exists "Admins can view all document comments" on public.document_comments;
create policy "Admins can view all document comments" on public.document_comments for select
  using (public.is_admin());

-- ==================== 022_class_folders.sql ====================
-- IntelliDocs: Migration 022 — Professor class folders vs. personal folders
--
-- A professor's drive previously mixed two very different things: their own
-- working folders and the folders they hand to a class. This adds an explicit
-- `folder_type` discriminator, optional course metadata, and an enrollment
-- table so a class folder can be opened to specific students.
--
-- Access rules after this migration:
--   - personal folder  -> owner only (unchanged)
--   - class folder     -> owner (full control) + enrolled students (read the
--                         folder, read its documents, submit into it)
--
-- Re-runnable: every statement is guarded (IF NOT EXISTS / DROP + CREATE).

-- 1) Folder type + optional course metadata
--    Existing rows were all personal workspaces, so the default is correct.
alter table public.folders
  add column if not exists folder_type text not null default 'personal';

alter table public.folders
  add column if not exists class_code text;

alter table public.folders
  add column if not exists academic_term text;

-- Constrain the discriminator to the two values the app understands. Added
-- separately from the column so a re-run on an existing table still installs
-- the constraint after the column already exists.
alter table public.folders
  drop constraint if exists folders_folder_type_check;

alter table public.folders
  add constraint folders_folder_type_check
  check (folder_type in ('personal', 'class'));

-- 2) Class enrollments (class owner -> student)
create table if not exists public.class_enrollments (
  folder_id uuid not null references public.folders(folder_id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  enrolled_at timestamptz default now(),
  primary key (folder_id, student_id)
);

create index if not exists idx_class_enrollments_student_id
  on public.class_enrollments(student_id);

create index if not exists idx_class_enrollments_folder_id
  on public.class_enrollments(folder_id);

-- 3) Lookup indexes for the class-folder views
create index if not exists idx_folders_class_type
  on public.folders(folder_type)
  where folder_type = 'class';

create index if not exists idx_folders_class_code
  on public.folders(class_code)
  where class_code is not null;

-- 4) Helper: is the calling user enrolled in this class folder?
--    SECURITY DEFINER so it can read class_enrollments without re-entering RLS.
create or replace function public.is_class_member(p_folder_id uuid)
returns boolean as $$
begin
  return exists (
    select 1
    from public.class_enrollments ce
    where ce.folder_id = p_folder_id
      and ce.student_id = auth.uid()
  );
end;
$$ language plpgsql security definer;

-- 5) Helper: may the calling user see this folder at all?
create or replace function public.can_read_folder(p_folder_id uuid)
returns boolean as $$
begin
  return exists (
    select 1
    from public.folders f
    where f.folder_id = p_folder_id
      and (f.user_id = auth.uid() or public.is_class_member(f.folder_id))
  );
end;
$$ language plpgsql security definer;

-- 6) Enrollment RLS
--    The owner manages the roster; a student can read their own row.
alter table public.class_enrollments enable row level security;

drop policy if exists "Class owners manage enrollments" on public.class_enrollments;
create policy "Class owners manage enrollments" on public.class_enrollments for all
  using (
    exists (
      select 1 from public.folders f
      where f.folder_id = class_enrollments.folder_id
        and f.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.folders f
      where f.folder_id = class_enrollments.folder_id
        and f.user_id = auth.uid()
    )
  );

drop policy if exists "Students read own enrollments" on public.class_enrollments;
create policy "Students read own enrollments" on public.class_enrollments for select
  using (student_id = auth.uid());

-- 7) Folder RLS — widen SELECT to enrolled students, keep writes owner-only
drop policy if exists "Users can read their own folders" on public.folders;
create policy "Users can read their own folders" on public.folders for select
  using (auth.uid() = user_id or public.is_class_member(folder_id));

-- 8) Folder documents RLS — enrolled students read a class folder's contents
--    and may submit into it; updates and deletes stay owner-only.
drop policy if exists "Users can read their own folder documents" on public.folder_documents;
create policy "Users can read their own folder documents" on public.folder_documents for select
  using (public.can_read_folder(folder_id));

drop policy if exists "Users can insert their own folder documents" on public.folder_documents;
create policy "Users can insert their own folder documents" on public.folder_documents for insert
  with check (public.can_read_folder(folder_id));

-- ==================== 023_user_presets.sql ====================
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

-- ==================== 024_plagiarism_detection.sql ====================
ee-- IntelliDocs: Migration 024 — Multi-Agent AI Council & Forensic Plagiarism Detection
-- Creates tables for document embeddings, plagiarism scans, and match tracking.
-- Enables pgvector for similarity search across class folder documents.

-- 1. Ensure pgvector extension is available
create extension if not exists vector;

-- 2. Document embeddings for intra-class similarity search
-- Stores paragraph-level embeddings for intra-class plagiarism detection
create table if not exists public.document_embeddings (
  embedding_id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references public.folders(folder_id) on delete set null,
  paragraph_index int not null,
  paragraph_text text not null,
  embedding vector(1536), -- OpenAI text-embedding-3-small = 1536 dims
  char_start int not null,
  char_end int not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_document_embeddings_document_id
  on public.document_embeddings(document_id);

create index if not exists idx_document_embeddings_folder_id
  on public.document_embeddings(folder_id);

create index if not exists idx_document_embeddings_user_id
  on public.document_embeddings(user_id);

-- HNSW index for fast cosine similarity search (requires pgvector >= 0.5.0)
-- This index is created after some data exists; safe to re-run
drop index if exists idx_document_embeddings_hnsw;
create index idx_document_embeddings_hnsw
  on public.document_embeddings
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

alter table public.document_embeddings enable row level security;

drop policy if exists "Users can read embeddings in their class folders" on public.document_embeddings;
create policy "Users can read embeddings in their class folders"
on public.document_embeddings for select
using (
  exists (
    select 1 from public.folders f
    where f.folder_id = document_embeddings.folder_id
    and f.user_id = auth.uid()
  ) or document_embeddings.user_id = auth.uid()
);

drop policy if exists "Users can insert their own document embeddings" on public.document_embeddings;
create policy "Users can insert their own document embeddings"
on public.document_embeddings for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own document embeddings" on public.document_embeddings;
create policy "Users can delete their own document embeddings"
on public.document_embeddings for delete
using (auth.uid() = user_id);

-- 3. Plagiarism scans — records each Council review session
create table if not exists public.plagiarism_scans (
  scan_id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references public.folders(folder_id) on delete set null,
  overall_originality_score numeric(5, 2) not null, -- e.g. 91.50
  peer_similarity_score numeric(5, 2) default 0.00,
  external_similarity_score numeric(5, 2) default 0.00,
  active_judges_count int not null,
  quorum_reached boolean not null default true,
  council_transcript jsonb not null, -- Full debate transcript
  scan_status varchar(30) not null default 'completed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_plagiarism_scans_document_id
  on public.plagiarism_scans(document_id);

create index if not exists idx_plagiarism_scans_user_id
  on public.plagiarism_scans(user_id);

create index if not exists idx_plagiarism_scans_folder_id
  on public.plagiarism_scans(folder_id);

alter table public.plagiarism_scans enable row level security;

drop policy if exists "Users can read their own plagiarism scans" on public.plagiarism_scans;
create policy "Users can read their own plagiarism scans"
on public.plagiarism_scans for select
using (auth.uid() = user_id);

drop policy if exists "Users can create their own plagiarism scans" on public.plagiarism_scans;
create policy "Users can create their own plagiarism scans"
on public.plagiarism_scans for insert
with check (auth.uid() = user_id);

drop policy if exists "Professors can read class folder plagiarism scans" on public.plagiarism_scans;
create policy "Professors can read class folder plagiarism scans"
on public.plagiarism_scans for select
using (
  exists (
    select 1 from public.folders f
    where f.folder_id = plagiarism_scans.folder_id
    and f.user_id = auth.uid()
  )
);

-- 4. Plagiarism matches — individual flagged passages
create table if not exists public.plagiarism_matches (
  match_id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.plagiarism_scans(scan_id) on delete cascade,
  paragraph_index int not null,
  char_start int not null,
  char_end int not null,
  matched_document_id uuid references public.documents(id) on delete set null,
  matched_student_id uuid references auth.users(id) on delete set null,
  similarity_score numeric(5, 2) not null,
  match_type varchar(30) not null, -- 'verbatim', 'paraphrased', 'uncited_fact', 'external_source'
  match_severity varchar(20) not null default 'medium', -- 'low', 'medium', 'high', 'critical'
  source_excerpt text,
  target_excerpt text,
  timeline_verdict varchar(30), -- 'original_author', 'derivative_paste', 'unverified_import', 'external_source'
  flagged_text text not null,
  council_verdict jsonb, -- Judge-specific verdicts for this match
  created_at timestamptz not null default now()
);

create index if not exists idx_plagiarism_matches_scan_id
  on public.plagiarism_matches(scan_id);

create index if not exists idx_plagiarism_matches_matched_document
  on public.plagiarism_matches(matched_document_id);

create index if not exists idx_plagiarism_matches_matched_student
  on public.plagiarism_matches(matched_student_id);

alter table public.plagiarism_matches enable row level security;

drop policy if exists "Users can read matches from their scans" on public.plagiarism_matches;
create policy "Users can read matches from their scans"
on public.plagiarism_matches for select
using (
  exists (
    select 1 from public.plagiarism_scans ps
    where ps.scan_id = plagiarism_matches.scan_id
    and ps.user_id = auth.uid()
  )
);

drop policy if exists "Professors can read class folder matches" on public.plagiarism_matches;
create policy "Professors can read class folder matches"
on public.plagiarism_matches for select
using (
  exists (
    select 1 from public.plagiarism_scans ps
    join public.folders f on f.folder_id = ps.folder_id
    where ps.scan_id = plagiarism_matches.scan_id
    and f.user_id = auth.uid()
  )
);

-- 5. Trigger to keep updated_at fresh on plagiarism_scans
drop trigger if exists trg_plagiarism_scans_updated_at on public.plagiarism_scans;
create trigger trg_plagiarism_scans_updated_at
  before update on public.plagiarism_scans
  for each row execute function public.set_updated_at();

-- 6. Function to compute cosine similarity (helper for manual queries)
create or replace function public.cosine_similarity(vec1 vector, vec2 vector)
returns float
language sql immutable parallel safe
as $$
  select 1 - (vec1 <=> vec2);
$$;

-- 6. Function to find similar paragraphs within a class folder
create or replace function public.find_similar_paragraphs(
  target_embedding vector,
  class_folder_id uuid,
  exclude_document_id uuid,
  similarity_threshold float default 0.80,
  max_results int default 10
)
returns table (
  embedding_id uuid,
  document_id uuid,
  user_id uuid,
  paragraph_index int,
  paragraph_text text,
  similarity float
)
language sql stable parallel safe
as $$
  select
    de.embedding_id,
    de.document_id,
    de.user_id,
    de.paragraph_index,
    de.paragraph_text,
    1 - (de.embedding <=> target_embedding) as similarity
  from public.document_embeddings de
  where de.folder_id = class_folder_id
    and de.document_id != exclude_document_id
    and 1 - (de.embedding <=> target_embedding) > similarity_threshold
  order by similarity desc
  limit max_results;
$$;

-- ==================== 025_document_images_bucket.sql ====================
-- Migration 025: Create public Supabase Storage bucket for imported document images
-- Run in Supabase SQL Editor or via: supabase db push
--
-- Purpose: Imported DOCX/PDF files contain embedded images (base64).
-- Rather than storing base64 blobs inline in the document content column
-- (which balloons row size and breaks Supabase limits), images are uploaded
-- here and referenced by public URL in the saved HTML.
--
-- Bucket layout: document-images/{userId}/{documentId}/{imageKey}.{ext}

-- ── 1. Create the bucket ─────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'document-images',
  'document-images',
  true,
  52428800,  -- 50 MB per individual image file
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- ── 2. RLS policies ──────────────────────────────────────────────────────────

-- Allow anyone to read public images (they are embedded in shared documents)
CREATE POLICY "Public image read"
ON storage.objects FOR SELECT
USING (bucket_id = 'document-images');

-- Allow authenticated users to upload images
CREATE POLICY "Auth upload images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'document-images'
  AND auth.role() = 'authenticated'
);

-- Allow the uploader (first folder segment = userId) to delete their own images
CREATE POLICY "Owner delete images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'document-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ==================== 026_document_preview_snippet.sql ====================
-- IntelliDocs: Migration 026 — lightweight Page 1 preview snippet for list endpoints
--
-- The dashboard grid shows a Google-Docs-style miniature of each document's
-- first page. Fetching the full `content` column for every row on the home
-- screen exceeded Supabase's statement timeout (documents can hold several MB
-- of HTML), so the list endpoints read this small pre-computed snippet instead.
--
-- `preview_snippet` is refreshed by the backend on every save as attribute-free
-- preview markup (paragraphs/headings only — see documentModel.extractPreviewSnippet).
-- The backfill below seeds existing rows with a raw prefix; grid cards normalize
-- legacy snippets at render time, and the next save replaces it with a clean one.

alter table public.documents
  add column if not exists preview_snippet text not null default '';

update public.documents
  set preview_snippet = left(content, 3000)
  where preview_snippet = '' and coalesce(content, '') <> '';

-- ==================== 027_user_storage_bytes.sql ====================
-- Storage used by one user's active documents, computed inside the database.
-- The server used to download every document's full content just to add up its
-- length, which burned disk IO and timed out on larger accounts.
-- pg_column_size reads the stored (compressed) size from the row header without
-- detoasting the content, so it costs almost no disk IO.
create or replace function public.user_storage_bytes(p_user_id uuid)
returns bigint
language sql
stable
as $$
  select coalesce(sum(pg_column_size(content)), 0)::bigint
  from public.documents
  where user_id = p_user_id
    and is_deleted = false;
$$;

-- ==================== 028_ml_model_buckets.sql ====================
-- Migration 028: private Storage buckets used by the ML service (ml/storage.py).
--   user-models : per-user fine-tuned models   ({userId}.pt / .pkl)
--   ml-models   : shared base model artifacts  (e.g. distilbert_int8.onnx)
-- Both are private; the ML service uses the service-role key, which bypasses RLS,
-- so no policies are needed (and none are added, keeping client access closed).
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-models', 'user-models', false),
       ('ml-models', 'ml-models', false)
ON CONFLICT (id) DO NOTHING;

