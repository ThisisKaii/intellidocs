-- Migration 046: a professor's own grading rubric per class folder
--
-- A class folder can carry the rubric its professor grades with, as jsonb:
--   {"criteria": [{"id": "content", "name": "Content", "description": "Ideas, depth and accuracy", "maxPoints": 40}, ...]}
-- The criteria's points add up to 100 (the grade). Null means the class uses the default
-- rubric (Content, Methodology, Formatting, Mechanics, 25 points each).
--
-- Each grade keeps a copy of the criteria it was given with (document_reviews.rubric,
-- migration 044), so editing a rubric never changes a grade already returned.

alter table public.folders
  add column if not exists rubric jsonb;
