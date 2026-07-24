-- ============================================================
-- RLS hardening — Phase 1
--
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query),
-- or via `supabase db push` if you use the CLI's migration workflow.
-- Safe to re-run — every policy is dropped-then-recreated.
--
-- IMPORTANT ORDER: deploy the ai-proxy Edge Function first (and confirm the
-- app's AI features still work against it) BEFORE running the app_settings
-- section below — the client used to read the OpenAI key straight out of
-- that table, and that path has been removed from index.html.
--
-- Table list and what each policy allows was derived by grepping every
-- `_sb.from(...)` call site in index.html and checking whether it runs in
-- an agent context (no real Supabase Auth session) or an admin/manager
-- context (real email+password sign-in, checked client-side today via
-- SUPER_ADMIN_EMAIL / MANAGER_EMAILS).
-- ============================================================

-- ── 0. Helper: mirrors the client-side SUPER_ADMIN_EMAIL / MANAGER_EMAILS
--    allowlist (index.html), but enforced server-side — can't be bypassed
--    by calling the REST API directly with just the anon key.
create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') in (
    'adir2112@gmail.com',
    'tala@targetcall.co.il',
    'thielac@targetcall.co.il',
    'levanad@m4l.co.il',
    'hodayam@targetcall.co.il',
    'eliyab@targetcall.co.il',
    'bekib@targetcall.co.il'
  );
$$;

-- ============================================================
-- GROUP A — manager-only, no legitimate anonymous/agent access at all
-- ============================================================

-- app_settings: the ai-proxy Edge Function reads/writes this with the
-- service role key, which bypasses RLS entirely — nothing else needs it.
alter table public.app_settings enable row level security;
drop policy if exists "app_settings: managers only" on public.app_settings;
create policy "app_settings: managers only" on public.app_settings
  for all using (is_manager()) with check (is_manager());

-- controls: internal performance-review data (בקרות נציגים).
alter table public.controls enable row level security;
drop policy if exists "controls: managers only" on public.controls;
create policy "controls: managers only" on public.controls
  for all using (is_manager()) with check (is_manager());

-- ai_feedback: AI Q&A quality logs, only shown in manager "שיחות AI" screens.
alter table public.ai_feedback enable row level security;
drop policy if exists "ai_feedback: managers only" on public.ai_feedback;
create policy "ai_feedback: managers only" on public.ai_feedback
  for all using (is_manager()) with check (is_manager());

-- discipline: disciplinary records (דוח משמעת) — the most sensitive HR
-- data in the app. Only touched from manager-only add/edit/delete forms.
alter table public.discipline enable row level security;
drop policy if exists "discipline: managers only" on public.discipline;
create policy "discipline: managers only" on public.discipline
  for all using (is_manager()) with check (is_manager());

-- manager_logs: audit trail of manager actions. Only managers should be
-- able to read or write it.
alter table public.manager_logs enable row level security;
drop policy if exists "manager_logs: managers only" on public.manager_logs;
create policy "manager_logs: managers only" on public.manager_logs
  for all using (is_manager()) with check (is_manager());

-- ============================================================
-- GROUP B — agents read openly; only managers create/delete the content
-- itself (agents never insert/update/delete knowledge articles)
-- ============================================================

alter table public.knowledge_base enable row level security;
drop policy if exists "knowledge_base: read all" on public.knowledge_base;
create policy "knowledge_base: read all" on public.knowledge_base for select using (true);
drop policy if exists "knowledge_base: managers write" on public.knowledge_base;
create policy "knowledge_base: managers write" on public.knowledge_base
  for insert with check (is_manager());
drop policy if exists "knowledge_base: managers update" on public.knowledge_base;
create policy "knowledge_base: managers update" on public.knowledge_base
  for update using (is_manager()) with check (is_manager());
drop policy if exists "knowledge_base: managers delete" on public.knowledge_base;
create policy "knowledge_base: managers delete" on public.knowledge_base
  for delete using (is_manager());

alter table public.kb_folders enable row level security;
drop policy if exists "kb_folders: read all" on public.kb_folders;
create policy "kb_folders: read all" on public.kb_folders for select using (true);
drop policy if exists "kb_folders: managers write" on public.kb_folders;
create policy "kb_folders: managers write" on public.kb_folders
  for insert with check (is_manager());
drop policy if exists "kb_folders: managers update" on public.kb_folders;
create policy "kb_folders: managers update" on public.kb_folders
  for update using (is_manager()) with check (is_manager());
drop policy if exists "kb_folders: managers delete" on public.kb_folders;
create policy "kb_folders: managers delete" on public.kb_folders
  for delete using (is_manager());

-- ============================================================
-- GROUP C — agents read + write these directly with no real auth session
-- (recordAgentActivity, sendKnowledgeChat usage tracking, CRM webhook log,
-- article ratings/comments). Left fully open, same as today's behaviour,
-- just made explicit. Tightening this properly needs real per-agent
-- sessions (Phase 2) so RLS can tell "agent X" apart from "agent Y".
-- ============================================================

alter table public.briefings enable row level security;
drop policy if exists "briefings: read all" on public.briefings;
create policy "briefings: read all" on public.briefings for select using (true);
drop policy if exists "briefings: agents update (sign/complete)" on public.briefings;
create policy "briefings: agents update (sign/complete)" on public.briefings
  for update using (true) with check (true);
drop policy if exists "briefings: managers create" on public.briefings;
create policy "briefings: managers create" on public.briefings
  for insert with check (is_manager());
drop policy if exists "briefings: managers delete" on public.briefings;
create policy "briefings: managers delete" on public.briefings
  for delete using (is_manager());

alter table public.briefing_docs enable row level security;
drop policy if exists "briefing_docs: read all" on public.briefing_docs;
create policy "briefing_docs: read all" on public.briefing_docs for select using (true);
drop policy if exists "briefing_docs: agents update (sign/complete)" on public.briefing_docs;
create policy "briefing_docs: agents update (sign/complete)" on public.briefing_docs
  for update using (true) with check (true);
drop policy if exists "briefing_docs: managers create" on public.briefing_docs;
create policy "briefing_docs: managers create" on public.briefing_docs
  for insert with check (is_manager());
drop policy if exists "briefing_docs: managers delete" on public.briefing_docs;
create policy "briefing_docs: managers delete" on public.briefing_docs
  for delete using (is_manager());

alter table public.login_history enable row level security;
drop policy if exists "login_history: open (agents log their own logins)" on public.login_history;
create policy "login_history: open (agents log their own logins)" on public.login_history
  for all using (true) with check (true);

alter table public.ai_usage enable row level security;
drop policy if exists "ai_usage: open (agents log their own AI usage)" on public.ai_usage;
create policy "ai_usage: open (agents log their own AI usage)" on public.ai_usage
  for all using (true) with check (true);

alter table public.crm_webhook_log enable row level security;
drop policy if exists "crm_webhook_log: open (logged from agent completion flow)" on public.crm_webhook_log;
create policy "crm_webhook_log: open (logged from agent completion flow)" on public.crm_webhook_log
  for all using (true) with check (true);

alter table public.kb_comments enable row level security;
drop policy if exists "kb_comments: open (agents rate/comment on articles)" on public.kb_comments;
create policy "kb_comments: open (agents rate/comment on articles)" on public.kb_comments
  for all using (true) with check (true);

-- ============================================================
-- GROUP D — deliberately NOT locked down this phase
-- ============================================================

-- agents: still fully open (select/insert/update/delete) because the app
-- reads full rows — including pin, phone, id_number — for the agent picker
-- with no real per-agent auth session. Restricting this now would break
-- login for every agent. This is the #1 item for Phase 2: split public
-- columns (id, name, depts, active) from sensitive ones (pin, phone,
-- id_number) behind is_manager(), and move PIN verification to a
-- server-side RPC/Edge Function instead of a client-side string compare.
alter table public.agents enable row level security;
drop policy if exists "agents: read all -- PHASE 2 TODO restrict columns" on public.agents;
create policy "agents: read all -- PHASE 2 TODO restrict columns" on public.agents
  for select using (true);
drop policy if exists "agents: write all -- PHASE 2 TODO restrict" on public.agents;
create policy "agents: write all -- PHASE 2 TODO restrict" on public.agents
  for all using (true) with check (true);
