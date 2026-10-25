-- IntelliDocs: Migration 031 — editor preferences follow the account.
-- Allows personalization_settings to hold one 'editor_preferences' row per user.
-- Re-runnable: the constraint is dropped and recreated.

alter table public.personalization_settings
  drop constraint if exists personalization_settings_key_check;

alter table public.personalization_settings
  add constraint personalization_settings_key_check
  check (key in ('custom_dictionary', 'ignored_patterns', 'editor_preferences'));
