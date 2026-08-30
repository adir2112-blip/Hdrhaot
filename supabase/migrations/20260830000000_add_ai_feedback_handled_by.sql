-- "תשובות לא נכונות לטיפול" now records who marked an item handled and
-- when, so the UI can show "טופל על ידי X בתאריך Y בשעה Z" instead of
-- just a checkmark.
alter table public.ai_feedback add column if not exists handled_by text;
alter table public.ai_feedback add column if not exists handled_at timestamptz;
