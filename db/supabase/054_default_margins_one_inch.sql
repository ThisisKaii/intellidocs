-- Blank documents created without a preset start with 1-inch margins on all four sides.
alter table public.documents
  alter column margins set default '{"top":1,"bottom":1,"left":1,"right":1}'::jsonb;
