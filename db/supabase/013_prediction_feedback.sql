-- Migration 013: AI Prediction Feedback & Accuracy Tracking
-- Stores structured accept/reject logs for RQ1/RQ2/RQ4 research data analysis

create table if not exists public.prediction_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  prediction_type text not null check (prediction_type in ('format_prompt', 'suggestion_panel', 'chat_preview')),
  predicted_format text not null,
  confidence float default null,
  accepted boolean not null,
  created_at timestamptz default now()
);

-- Index for fast user feedback lookup and accuracy aggregation
create index if not exists idx_prediction_feedback_user_id
on public.prediction_feedback(user_id, created_at desc);

create index if not exists idx_prediction_feedback_doc_id
on public.prediction_feedback(document_id);

-- Enable RLS
alter table public.prediction_feedback enable row level security;

-- RLS Policies
create policy "Users can read their own prediction feedback"
on public.prediction_feedback for select
using (auth.uid() = user_id);

create policy "Users can insert their own prediction feedback"
on public.prediction_feedback for insert
with check (auth.uid() = user_id);
