-- The block a formatting suggestion was for, so feedback can train the user's own model.
-- block_text: the block's text when the user accepted or rejected the suggestion (the prediction's
--   features are computed from it). kept_format: on a rejection, the format the block stayed (its
--   label then); null on an acceptance, whose label is predicted_format.
alter table public.prediction_feedback add column if not exists block_text text;
alter table public.prediction_feedback add column if not exists kept_format text;
