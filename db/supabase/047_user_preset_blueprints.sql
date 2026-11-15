-- Presets made from a document the user uploads (or a shared .idocpreset file) carry the look read
-- from it: page size and margins, body font, size, spacing and indent, heading styles and the
-- section outline. Plain forks of a built-in preset leave it null.
alter table public.user_presets
  add column if not exists blueprint jsonb;
