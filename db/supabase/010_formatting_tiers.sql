-- Migration 010: Three-tier formatting control system
-- Tier 1: formatting_presets (predefined rule sets)
-- Tier 2: format_bindings (per-user hard rules)
-- Documents get a formatting_preset column (selected Tier 1 profile).

-- 1) Documents: track the active preset profile
alter table public.documents
  add column if not exists formatting_preset text default null;

-- 2) Formatting presets (Tier 1)
create table if not exists public.formatting_presets (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text not null default '',
  rules jsonb not null default '[]'::jsonb,
  is_system boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.formatting_presets enable row level security;

create policy "Anyone can read formatting presets"
on public.formatting_presets for select
using (true);

-- Seed the five planned presets.
insert into public.formatting_presets (key, name, description, rules) values
('academic', 'Academic Research Paper', 'Standard academic paper: H2 for sections, H3 for subsections, short lines become headings.',
 '[{"condition":{"maxWords":8,"standaloneLine":true},"format":"heading2","priority":10},{"condition":{"maxWords":20,"standaloneLine":true},"format":"heading3","priority":5}]'),
('thesis', 'Thesis / Dissertation', 'Thesis structure: chapter titles as H1, sections as H2.',
 '[{"condition":{"startsWith":"Chapter"},"format":"heading1","priority":20},{"condition":{"maxWords":8,"standaloneLine":true},"format":"heading2","priority":10}]'),
('business_letter', 'Business Letter', 'Formal letter: salutation and closing as paragraphs, short lines become paragraphs.',
 '[{"condition":{"startsWith":"Dear"},"format":"paragraph","priority":10},{"condition":{"startsWith":"Sincerely"},"format":"paragraph","priority":10},{"condition":{"maxChars":40,"standaloneLine":true},"format":"paragraph","priority":5}]'),
('general', 'General Document', 'Neutral baseline: short standalone lines become headings, long text stays paragraph.',
 '[{"condition":{"maxWords":6,"standaloneLine":true},"format":"heading2","priority":10}]'),
('custom', 'Custom', 'Start with an empty profile and let your custom bindings define formatting.',
 '[]'::jsonb)
on conflict (key) do nothing;

-- 3) Custom format bindings (Tier 2)
create table if not exists public.format_bindings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger_condition jsonb not null default '{}'::jsonb,
  format_to_apply text not null,
  priority int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_format_bindings_user_id
on public.format_bindings(user_id);

alter table public.format_bindings enable row level security;

create policy "Users can read their own format bindings"
on public.format_bindings for select
using (auth.uid() = user_id);

create policy "Users can insert their own format bindings"
on public.format_bindings for insert
with check (auth.uid() = user_id);

create policy "Users can update their own format bindings"
on public.format_bindings for update
using (auth.uid() = user_id);

create policy "Users can delete their own format bindings"
on public.format_bindings for delete
using (auth.uid() = user_id);
