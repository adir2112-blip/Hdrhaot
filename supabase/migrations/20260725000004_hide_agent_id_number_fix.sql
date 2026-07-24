-- Follow-up to 20260725000003_hide_agent_id_number.sql — verified live that
-- it did NOT work: `anon` already holds a blanket table-level SELECT grant
-- on public.agents (from Supabase's default setup), and revoking a
-- column-specific privilege has no effect while that broader table-level
-- grant still stands — Postgres allows access if ANY applicable grant
-- covers it. Re-tested against a real record (agent 83) after the first
-- migration: id_number was still fully visible.
--
-- Real fix: revoke the blanket table-level SELECT from anon entirely,
-- then explicitly re-grant SELECT on every column except id_number.
-- (RLS policies are unaffected/unrelated — this is a separate privilege
-- layer that applies in addition to RLS, not instead of it.)
revoke select on public.agents from anon;
grant select (id, name, depts, pin, last_login, active, phone, is_active)
  on public.agents to anon;
