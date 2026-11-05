-- IntelliDocs: Migration 038 — document genre for genre-isolated personalization
--
-- Behavior learning used to be keyed by user only, so IEEE habits (10pt, compact, two columns)
-- leaked into thesis documents (12pt, double spaced). Every document now carries a genre, and
-- behavior events, learned patterns, DuckDB training rows and ML models are partitioned by it.
-- `genre_source` records whether the structural classifier set it ('auto') or the user did
-- ('manual'); auto-detection never overwrites a manual choice.
-- Re-runnable: every statement is guarded.

alter table public.documents
  add column if not exists genre text not null default 'general';

alter table public.documents
  add column if not exists genre_source text not null default 'auto';

do $$ begin
  alter table public.documents
    add constraint documents_genre_check check (genre in ('ieee', 'thesis', 'memo', 'general'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.documents
    add constraint documents_genre_source_check check (genre_source in ('auto', 'manual'));
exception when duplicate_object then null; end $$;

-- Backfill from the formatting preset. Forked presets (ieee__v2) use their base key.
update public.documents
set genre = case split_part(formatting_preset, '__', 1)
    when 'ieee' then 'ieee'
    when 'uclm_capstone' then 'thesis'
    when 'thesis' then 'thesis'
    when 'academic' then 'thesis'
    when 'business_letter' then 'memo'
    else 'general'
  end
where genre_source = 'auto' and formatting_preset is not null;

-- The `ieee` seed from migration 014 only carries page geometry, so it never matches in the tier
-- check. `ieee_base` is the conditioned fallback preset for the IEEE genre partition.
insert into public.formatting_presets (key, name, description, rules) values
('ieee_base', 'IEEE (genre baseline)', 'Genre fallback for IEEE papers: Roman-numeral sections as H1, lettered subsections as H2, Abstract and Index Terms as paragraphs.',
 '[{"condition":{"startsWith":"Abstract"},"format":"paragraph","priority":30},{"condition":{"startsWith":"Index Terms"},"format":"paragraph","priority":30},{"condition":{"startsWith":"References"},"format":"heading1","priority":25},{"condition":{"maxWords":6,"standaloneLine":true},"format":"heading1","priority":10},{"condition":{"maxWords":12,"standaloneLine":true},"format":"heading2","priority":5}]')
on conflict (key) do nothing;
