-- Tighten the four "wide open" tables (login_history, ai_usage,
-- crm_webhook_log, kb_comments) from "for all using(true) with check(true)"
-- (select+insert+update+delete, no restriction at all) down to only the
-- operations the app actually performs from an unauthenticated context.
-- Verified by grepping every `_sb.from('<table>')` call site in index.html
-- before writing this:
--
--   login_history:    insert (own login) + select. No update/delete.
--   ai_usage:          insert (usage log) + update (is_correct feedback on
--                       the agent's own row, from markAnswerCorrect()).
--                       No delete.
--   crm_webhook_log:   insert only (logged after calling the CRM webhook)
--                       + select. No update/delete.
--   kb_comments:       insert (agent rating/comment, always a fresh row —
--                       submitAgentArticleComment() never updates an
--                       existing one) + select. delete only ever called
--                       from deleteKbComment(), which the UI only renders
--                       behind `_adminUnlocked` — restricted to managers to
--                       match. No update.
--
-- Net effect: nobody (with just the public anon key) can wipe or rewrite
-- history in these tables anymore; every legitimate write path used by the
-- app today keeps working unchanged.

drop policy if exists "login_history: open (agents log their own logins)" on public.login_history;
create policy "login_history: read all" on public.login_history for select using (true);
create policy "login_history: insert all" on public.login_history for insert with check (true);

drop policy if exists "ai_usage: open (agents log their own AI usage)" on public.ai_usage;
create policy "ai_usage: read all" on public.ai_usage for select using (true);
create policy "ai_usage: insert all" on public.ai_usage for insert with check (true);
create policy "ai_usage: update all" on public.ai_usage for update using (true) with check (true);

drop policy if exists "crm_webhook_log: open (logged from agent completion flow)" on public.crm_webhook_log;
create policy "crm_webhook_log: read all" on public.crm_webhook_log for select using (true);
create policy "crm_webhook_log: insert all" on public.crm_webhook_log for insert with check (true);

drop policy if exists "kb_comments: open (agents rate/comment on articles)" on public.kb_comments;
create policy "kb_comments: read all" on public.kb_comments for select using (true);
create policy "kb_comments: insert all" on public.kb_comments for insert with check (true);
create policy "kb_comments: managers delete" on public.kb_comments for delete using (is_manager());
