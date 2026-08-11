-- Distinguishes regular monthly quality controls from mystery-shopper
-- ("לקוח סמוי") controls, both recorded in the same controls table via
-- the same add-control form. Defaults to the existing behavior (monthly)
-- so every pre-existing row is treated as a regular control.
alter table public.controls add column if not exists control_type text not null default 'monthly';
