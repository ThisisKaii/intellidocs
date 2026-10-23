-- Citation style and reference list saved with each document, so references
-- follow the student across devices instead of living in one browser.
-- Shape: { "style": "ieee" | "apa" | "mla" | "chicago", "references": [ ... ] }

alter table public.documents
  add column if not exists citation_data jsonb;
