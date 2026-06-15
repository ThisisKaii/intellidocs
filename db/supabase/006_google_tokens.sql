-- Google Drive OAuth2 token storage.
-- One row per user; upserted on each re-authorization.
CREATE TABLE IF NOT EXISTS public.google_tokens (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expiry_date   BIGINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- RLS: users can only read/write their own tokens
ALTER TABLE public.google_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY google_tokens_select ON public.google_tokens
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY google_tokens_insert ON public.google_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY google_tokens_update ON public.google_tokens
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY google_tokens_delete ON public.google_tokens
  FOR DELETE USING (auth.uid() = user_id);
