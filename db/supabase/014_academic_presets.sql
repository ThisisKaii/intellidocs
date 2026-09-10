-- Migration 014: Seed academic one-click presets
-- The styles ribbon applies these tier-1 profiles (they are companions to 010's
-- five base presets). Each row maps to `frontend/src/components/editor/academicPresets.ts`.
-- On conflict the seed is skipped so manual edits are never overwritten.

insert into public.formatting_presets (key, name, description, rules) values
('uclm_capstone', 'UCLM Capstone (Thesis)', 'UCLM spec — left margin 1.5", double-spaced Arial/Times 12pt, uppercase centered chapter headings, roman preliminary page numbers.',
 '[{"page":{"size":"letter","orientation":"portrait","margins":{"top":1,"bottom":1,"left":1.5,"right":1}}},"format":"academic_layout"}]'),
('apa_7th', 'APA 7th Edition', 'APA 7 — 1" margins, Times New Roman 12pt, double-spaced, centered title, five-level headings.',
 '[{"page":{"size":"letter","orientation":"portrait","margins":{"top":1,"bottom":1,"left":1,"right":1}}},"format":"academic_layout"}]'),
('ieee', 'IEEE Conference', 'IEEE — 0.75" margins, Times New Roman 10pt, single-ish spacing, numbered headings.',
 '[{"page":{"size":"letter","orientation":"portrait","margins":{"top":0.75,"bottom":0.75,"left":0.75,"right":0.75}}},"format":"academic_layout"}]')
on conflict (key) do nothing;