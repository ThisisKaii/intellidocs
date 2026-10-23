-- Migration 028: private Storage buckets used by the ML service (ml/storage.py).
--   user-models : per-user fine-tuned models   ({userId}.pt / .pkl)
--   ml-models   : shared base model artifacts  (e.g. distilbert_int8.onnx)
-- Both are private; the ML service uses the service-role key, which bypasses RLS,
-- so no policies are needed (and none are added, keeping client access closed).
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-models', 'user-models', false),
       ('ml-models', 'ml-models', false)
ON CONFLICT (id) DO NOTHING;
