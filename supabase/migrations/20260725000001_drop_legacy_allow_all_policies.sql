-- ============================================================
-- Follow-up to 20260725000000_rls_hardening_phase1.sql
--
-- After running that migration, a live verification (curl against the
-- REST API with just the anon key) showed the sensitive tables were
-- STILL fully readable. Cause: each of these tables already had an old,
-- unnamed-by-us permissive policy (e.g. "allow_all" / "allow all X",
-- condition `true`) predating this work. Postgres OR's multiple
-- permissive policies together for the same command, so those old
-- always-true policies were silently overriding the new manager-only
-- ones. This drops them. Re-verified after this ran: app_settings,
-- controls, discipline, manager_logs, ai_feedback now correctly return
-- empty to anon; briefings INSERT now correctly returns 401 to anon.
-- ============================================================

drop policy if exists "allow all settings" on public.app_settings;
drop policy if exists "allow_all" on public.controls;
drop policy if exists "allow_all" on public.discipline;
drop policy if exists "allow_all" on public.manager_logs;
drop policy if exists "allow_all" on public.ai_feedback;
drop policy if exists "allow all briefings" on public.briefings;
drop policy if exists "allow all agents" on public.agents;
drop policy if exists "allow_all" on public.ai_usage;
drop policy if exists "allow all for authenticated" on public.crm_webhook_log;
drop policy if exists "allow_all" on public.kb_comments;
drop policy if exists "allow_all" on public.login_history;
