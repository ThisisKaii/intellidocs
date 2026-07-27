---
name: db-schema-validator
description: Use when modifying any database table, Redis key structure, or DuckDB schema in IntelliDocs. Checks for schema drift and consistency across Supabase (PostgreSQL), Redis key patterns, and DuckDB tables.
---

# Database Schema Validation & Consistency Guide

IntelliDocs uses a 3-tier database architecture. When updating any schema, consistency must be maintained across all three tiers.

## 1. Supabase (PostgreSQL) — Primary Transactional Store
- **Migrations Location**: `db/supabase/*.sql`
- **Reference Schema**: `db/intellidocs_schema.dbml`
- **Key Tables**:
  - `auth.users` (Supabase Auth reference)
  - `public.user_profiles` (Extended user roles & details)
  - `public.documents` (Document metadata & storage)
  - `public.folders` & `public.folder_documents`
  - `public.formatting_actions` & `public.ai_suggestions` & `public.suggestion_feedback`
  - `public.grammar_issues`
  - `public.document_comments` & `public.document_grades` & `public.notifications`
- **Rules**:
  - Every table MUST have `ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;`
  - Every table MUST have RLS policies for `select`, `insert`, `update`, `delete`.
  - Use `gen_random_uuid()` for primary keys (`uuid`).
  - Use `timestamptz default now()` for timestamps.

## 2. Redis — Real-time Buffering & Caching
- **Implementation**: `server/src/utils/redisClient.ts`, `server/src/models/behaviorModel.ts`
- **Key Naming Conventions**:
  - Behavior Events: `behavior:events:<user_id>` (List or Stream)
  - AI Quota: `ai:quota:<user_id>` (String/Counter with TTL)
  - AI Cache: `ai:cache:<hash>` (String with TTL)
  - Auto-save Dirty Flag: `autosave:dirty:<document_id>`

## 3. DuckDB — Analytical Store for Behavior ML
- **Implementation**: `ml/aggregator.py`, `ml/feature_extractor.py`
- **File Location**: `db/duckdb/behavior.duckdb`
- **Key Tables**:
  - `behavior_events` (Flushed periodically from Redis)
  - `formatting_features` (Extracted windowed numerical features for training)

## Cross-Store Alignment Checklist
- [ ] Field names in TypeScript (`server/src/types/index.ts` & `frontend/src/services/api.ts`) match Supabase column names (`snake_case` in DB, mapped in API).
- [ ] Any new table created in SQL migration is also documented in `db/intellidocs_schema.dbml`.
- [ ] If user actions are captured for ML, ensure `formatting_actions` in Supabase mirrors the event structure in Redis & DuckDB `behavior_events`.
