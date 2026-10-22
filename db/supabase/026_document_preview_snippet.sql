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
