-- Security (15.11.2026, Strix scan + live verification). Apply AFTER the matching index.html is live.

-- 1) briefings / briefing_docs: agents work without a Supabase session (anon), and only ever
--    write the `completions` column (sign / complete / quiz). Until now anon could UPDATE every
--    column: titles, content, questions and correct answers, target departments, is_active —
--    and content changes are pushed to Callio by the kb sync trigger. Managers (authenticated)
--    keep full update through the existing policies.
revoke update on public.briefings from anon;
revoke update on public.briefing_docs from anon;
grant update (completions) on public.briefings to anon;
grant update (completions) on public.briefing_docs to anon;

-- 2) mark_agent_login: callable by anon (agents), wrote any text into agents.last_login, which
--    manager screens rendered as HTML. Now only the page's own format "D/M/YYYY HH:MM" is stored.
create or replace function public.mark_agent_login(p_agent_id bigint, p_login_ts text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.agents set last_login = p_login_ts
   where id = p_agent_id
     and p_login_ts ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4} [0-9]{2}:[0-9]{2}$';
$$;
grant execute on function public.mark_agent_login(bigint, text) to anon;
