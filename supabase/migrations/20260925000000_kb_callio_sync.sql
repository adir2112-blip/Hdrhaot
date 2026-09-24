-- ============================================================
-- Push knowledge changes to Callio via the kb-to-callio Edge Function:
-- מאמרי ידע (knowledge_base), תדריכים (briefing_docs), מבחנים (briefings).
--
-- AFTER triggers + pg_net (async): saving never waits for, or fails because
-- of, Callio. Any error inside the trigger is swallowed with a WARNING so the
-- manager's insert/update/delete always commits.
--
-- Inactive until the Vault secret exists (created manually, never in git):
--   select vault.create_secret('<random>', 'kb_sync_secret');
-- and the same value is set on the function:
--   supabase secrets set KB_SYNC_SECRET=<random>
--
-- Rollback: supabase/rollback/callio_integration_down.sql
-- ============================================================

create extension if not exists pg_net with schema extensions;

create or replace function public.kb_notify_callio()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
  v_id text;
  v_old jsonb;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'kb_sync_secret'
   limit 1;
  if v_secret is null then
    return null; -- sync not configured yet: no-op
  end if;

  v_id := case when tg_op = 'DELETE' then old.id::text else new.id::text end;
  -- Slim snapshot of the old row (dept / targetDepts / is_active) so the
  -- function can route deletes and moves between Callio orgs. Large and
  -- private columns are dropped: completions holds agent names and scores.
  v_old := case when tg_op = 'INSERT' then null
                else to_jsonb(old) - 'content' - 'questions' - 'completions' end;

  perform net.http_post(
    url := 'https://hbjtpjdthvjikfxsufdo.supabase.co/functions/v1/kb-to-callio',
    body := jsonb_build_object('table', tg_table_name, 'op', tg_op, 'id', v_id, 'old', v_old),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-kb-sync-secret', v_secret
    ),
    timeout_milliseconds := 10000
  );
  return null;
exception when others then
  raise warning 'kb_notify_callio failed for % % %: %', tg_table_name, tg_op, v_id, sqlerrm;
  return null;
end;
$$;

revoke all on function public.kb_notify_callio() from public, anon, authenticated;

-- ── knowledge_base ──────────────────────────────────────────
-- Only real content edits: the app also updates rows on every view/rating
-- (view_count, week_views, last_view, avg_rating, rating_count).
drop trigger if exists kb_callio_insert on public.knowledge_base;
create trigger kb_callio_insert
  after insert on public.knowledge_base
  for each row execute function public.kb_notify_callio();

drop trigger if exists kb_callio_update on public.knowledge_base;
create trigger kb_callio_update
  after update on public.knowledge_base
  for each row
  when (
       old.title       is distinct from new.title
    or old.content     is distinct from new.content
    or old.dept        is distinct from new.dept
    or old.folder_id   is distinct from new.folder_id
    or old.expiry_date is distinct from new.expiry_date
  )
  execute function public.kb_notify_callio();

drop trigger if exists kb_callio_delete on public.knowledge_base;
create trigger kb_callio_delete
  after delete on public.knowledge_base
  for each row execute function public.kb_notify_callio();

-- ── briefing_docs (תדריכים) ─────────────────────────────────
-- Every agent sign-off rewrites completions — ignored here.
drop trigger if exists kb_callio_insert on public.briefing_docs;
create trigger kb_callio_insert
  after insert on public.briefing_docs
  for each row execute function public.kb_notify_callio();

drop trigger if exists kb_callio_update on public.briefing_docs;
create trigger kb_callio_update
  after update on public.briefing_docs
  for each row
  when (
       old.title     is distinct from new.title
    or old.content   is distinct from new.content
    or old.questions is distinct from new.questions
    or old.dept      is distinct from new.dept
    or old.is_active is distinct from new.is_active
  )
  execute function public.kb_notify_callio();

drop trigger if exists kb_callio_delete on public.briefing_docs;
create trigger kb_callio_delete
  after delete on public.briefing_docs
  for each row execute function public.kb_notify_callio();

-- ── briefings (מבחנים) ──────────────────────────────────────
-- Same: completions / refresh_requested changes are not content.
drop trigger if exists kb_callio_insert on public.briefings;
create trigger kb_callio_insert
  after insert on public.briefings
  for each row execute function public.kb_notify_callio();

drop trigger if exists kb_callio_update on public.briefings;
create trigger kb_callio_update
  after update on public.briefings
  for each row
  when (
       old.title         is distinct from new.title
    or old.content       is distinct from new.content
    or old.questions     is distinct from new.questions
    or old."targetDepts" is distinct from new."targetDepts"
    or old.is_active     is distinct from new.is_active
  )
  execute function public.kb_notify_callio();

drop trigger if exists kb_callio_delete on public.briefings;
create trigger kb_callio_delete
  after delete on public.briefings
  for each row execute function public.kb_notify_callio();
