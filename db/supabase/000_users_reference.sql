-- Reference schema for auth.users (managed by Supabase Auth)
-- This table is auto-created by Supabase — DO NOT run this migration.
-- Included here for documentation / Chapter 3 database design only.

CREATE TABLE IF NOT EXISTS auth.users (
  id                  UUID PRIMARY KEY,
  display_name        VARCHAR,
  email               VARCHAR UNIQUE,
  phone               TEXT,
  providers           TEXT,
  provider_type       TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  last_sign_in_at     TIMESTAMPTZ
);
