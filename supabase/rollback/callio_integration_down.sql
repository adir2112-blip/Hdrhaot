-- Turns off the Callio knowledge-base sync (undo of
-- migrations/20260925000000_kb_callio_sync.sql). Safe to run more than once.
-- Leaves pg_net installed (other things may use it) and does not touch data.
drop trigger if exists kb_callio_insert on public.knowledge_base;
drop trigger if exists kb_callio_update on public.knowledge_base;
drop trigger if exists kb_callio_delete on public.knowledge_base;
drop function if exists public.kb_notify_callio();
