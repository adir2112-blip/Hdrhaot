-- ============================================================
-- Agent PIN brute-force protection: 3 wrong PINs → that agent is locked for
-- 15 minutes. Enforced inside the database (the only place the PIN is
-- checked), so it cannot be bypassed by calling the API directly.
--
-- verify_agent_pin_v2 returns details for the UI (attempts left / seconds
-- until unlock). The original verify_agent_pin keeps its signature (the
-- live client calls it until the new client ships) but now goes through
-- the same lockout.
-- Changing an agent's PIN clears their lock.
-- ============================================================

create table if not exists public.agent_pin_attempts (
  agent_id       bigint primary key references public.agents(id) on delete cascade,
  failed_count   int not null default 0,
  locked_until   timestamptz,
  last_failed_at timestamptz
);
-- No policies: only the security-definer functions below touch this table.
alter table public.agent_pin_attempts enable row level security;
revoke all on public.agent_pin_attempts from anon, authenticated;

create or replace function public.verify_agent_pin_v2(p_agent_id bigint, p_pin text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  c_max_attempts constant int := 3;
  c_lock constant interval := interval '15 minutes';
  v_pin text;
  v_row public.agent_pin_attempts;
begin
  select pin into v_pin from public.agents where id = p_agent_id;
  if not found or v_pin is null or v_pin = '' then
    return jsonb_build_object('ok', false);
  end if;

  insert into public.agent_pin_attempts(agent_id) values (p_agent_id)
    on conflict (agent_id) do nothing;
  -- Row lock: parallel guesses for the same agent are counted one by one.
  select * into v_row from public.agent_pin_attempts where agent_id = p_agent_id for update;

  if v_row.locked_until is not null and v_row.locked_until > now() then
    return jsonb_build_object('ok', false, 'locked', true,
      'seconds_left', ceil(extract(epoch from v_row.locked_until - now()))::int);
  end if;

  if v_pin = p_pin then
    update public.agent_pin_attempts
       set failed_count = 0, locked_until = null
     where agent_id = p_agent_id;
    return jsonb_build_object('ok', true);
  end if;

  -- A lock that has expired starts a fresh count.
  if v_row.locked_until is not null then v_row.failed_count := 0; end if;

  if v_row.failed_count + 1 >= c_max_attempts then
    update public.agent_pin_attempts
       set failed_count = 0, locked_until = now() + c_lock, last_failed_at = now()
     where agent_id = p_agent_id;
    return jsonb_build_object('ok', false, 'locked', true,
      'seconds_left', extract(epoch from c_lock)::int);
  end if;

  update public.agent_pin_attempts
     set failed_count = v_row.failed_count + 1, locked_until = null, last_failed_at = now()
   where agent_id = p_agent_id;
  return jsonb_build_object('ok', false,
    'attempts_left', c_max_attempts - (v_row.failed_count + 1));
end;
$$;
revoke all on function public.verify_agent_pin_v2(bigint, text) from public;
grant execute on function public.verify_agent_pin_v2(bigint, text) to anon, authenticated;

-- Old entry point, same lockout (it was `stable sql` — it now writes).
create or replace function public.verify_agent_pin(p_agent_id bigint, p_pin text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  return coalesce((public.verify_agent_pin_v2(p_agent_id, p_pin) ->> 'ok')::boolean, false);
end;
$$;

-- A manager setting a new PIN unlocks the agent.
create or replace function public.agent_pin_changed_unlock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.agent_pin_attempts where agent_id = new.id;
  return null;
end;
$$;
revoke all on function public.agent_pin_changed_unlock() from public, anon, authenticated;

drop trigger if exists agents_pin_changed_unlock on public.agents;
create trigger agents_pin_changed_unlock
  after update of pin on public.agents
  for each row
  when (old.pin is distinct from new.pin)
  execute function public.agent_pin_changed_unlock();
