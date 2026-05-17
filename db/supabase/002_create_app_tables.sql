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
