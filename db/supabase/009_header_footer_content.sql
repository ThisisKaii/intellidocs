-- Migration 009: Add header_content and footer_content to documents table
-- Run in Supabase SQL Editor

alter table public.documents
  add column if not exists header_content text default '',
  add column if not exists footer_content text default '';

-- No RLS changes needed — existing policies already cover all columns.
