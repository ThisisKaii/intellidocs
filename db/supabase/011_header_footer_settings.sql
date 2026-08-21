-- Migration 011: Header/footer visibility toggles + page-number formats
-- Run in Supabase SQL Editor

alter table public.documents
  add column if not exists show_header boolean not null default false,
  add column if not exists show_footer boolean not null default false,
  add column if not exists header_number_format text not null default 'none',
  add column if not exists footer_number_format text not null default 'none';

-- 'none' | 'number' (1, 2, 3…) | 'roman' (I, II, III…)

-- No RLS changes needed — existing policies already cover all columns.
