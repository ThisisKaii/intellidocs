# IntelliDocs Database Setup (Supabase)

This guide documents the **required database schema**, **foreign keys**, and **RLS policies** for IntelliDocs.
Use this if you’re setting up the project with **DBeaver** or the **Supabase SQL Editor**.

---

## ✅ Required Tables

### `documents` (public)
- Stores user documents
- Linked to Supabase Auth users

---

## ✅ Schema SQL (Run in Supabase / DBeaver)

```/dev/null/supabase-schema.sql#L1-80
-- 1) Documents table
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text default '',
  formatting_history jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2) Index for fast user queries
create index if not exists idx_documents_user_id
on public.documents(user_id);

-- 3) Enable Row Level Security
alter table public.documents enable row level security;

-- 4) RLS Policies
create policy "Users can read their own documents"
on public.documents
for select
using (auth.uid() = user_id);

create policy "Users can insert their own documents"
on public.documents
for insert
with check (auth.uid() = user_id);

create policy "Users can update their own documents"
on public.documents
for update
using (auth.uid() = user_id);

create policy "Users can delete their own documents"
on public.documents
for delete
using (auth.uid() = user_id);
```

---

## ✅ Foreign Key Relationship

The key relationship is:

```
documents.user_id → auth.users.id
```

This is the Supabase equivalent of:

- **Laravel:** `->foreignId('user_id')->constrained('users')`
- **Django:** `ForeignKey(User, on_delete=CASCADE)`

---

## ✅ Notes

- Supabase Auth tables live in the `auth` schema.
- You should **not** manually create users — Supabase Auth manages them.
- RLS must be enabled for all user‑owned tables.
- If RLS is not enabled, any authenticated user could read/write other users' data.

---

## ✅ Recommended Repo Location

Keep this file here:

```
intellidocs/db/README.md
```

This makes onboarding easy for new contributors.

---

## ✅ Optional (Migrations Later)

If you want Laravel‑style migrations later, consider:
- Supabase CLI migrations
- Prisma ORM migrations
- Drizzle ORM migrations

For now, this SQL setup is enough for development and testing.