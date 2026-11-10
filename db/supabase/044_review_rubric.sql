-- Migration 044: rubric breakdown on professor reviews
--
-- A grade can carry four criteria (content, methodology, formatting, mechanics),
-- 0-25 each, that sum to the overall grade. Stored as jsonb on the review row:
--   {"content": 22, "methodology": 20, "formatting": 24, "mechanics": 23}
-- Null for grades given without a rubric.

alter table public.document_reviews
  add column if not exists rubric jsonb;
