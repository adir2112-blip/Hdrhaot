-- ============================================================
-- Push knowledge_base changes to Callio via the kb-to-callio Edge Function.
--
-- AFTER triggers + pg_net (async): saving an article never waits for, or
-- fails because of, Callio. Any error inside the trigger is swallowed with a
-- WARNING so the manager's insert/update/delete always commits.
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
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'kb_sync_secret'
   limit 1;
  if v_secret is null then
    return null; -- sync not configured yet: no-op
  end if;

  v_id := case when tg_op = 'DELETE' then old.id::text else new.id::text end;

  perform net.http_post(
    url := 'https://hbjtpjdthvjikfxsufdo.supabase.co/functions/v1/kb-to-callio',
    body := jsonb_build_object('op', tg_op, 'id', v_id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-kb-sync-secret', v_secret
    ),
    timeout_milliseconds := 10000
  );
  return null;
exception when others then
  raise warning 'kb_notify_callio failed for % %: %', tg_op, v_id, sqlerrm;
  return null;
end;
$$;

revoke all on function public.kb_notify_callio() from public, anon, authenticated;

drop trigger if exists kb_callio_insert on public.knowledge_base;
create trigger kb_callio_insert
  after insert on public.knowledge_base
  for each row execute function public.kb_notify_callio();

-- Only real content edits. The app also updates rows on every view/rating
-- (view_count, week_views, last_view, avg_rating, rating_count) — those must
-- not reach Callio.
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
