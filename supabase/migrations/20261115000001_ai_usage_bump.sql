-- Atomic daily AI usage counter for ai-proxy (15.11.2026). Apply BEFORE deploying ai-proxy.
-- app_settings(key text primary key, value text). Only the service role (ai-proxy) may call it.
create or replace function public.ai_usage_bump(p_key text)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.app_settings(key, value) values (p_key, '1')
  on conflict (key) do update
    set value = ((coalesce(nullif(public.app_settings.value, ''), '0'))::int + 1)::text
  returning value::int;
$$;
revoke all on function public.ai_usage_bump(text) from public, anon, authenticated;
grant execute on function public.ai_usage_bump(text) to service_role;
