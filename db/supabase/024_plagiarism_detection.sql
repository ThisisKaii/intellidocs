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