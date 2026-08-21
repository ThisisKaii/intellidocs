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
