-- ============================================================
-- Step 1/2 of closing the two worst remaining exposures on public.agents
-- (readable PINs, open write policy) — see the follow-up migration
-- "..._pin_hardening_lockdown.sql" for the actual restriction.
--
-- This migration is deliberately additive-only and safe to deploy before
-- the client code is updated: it adds a column and two RPCs, and grants
-- nothing away. The live site keeps working exactly as before until the
-- lockdown migration runs (which must only happen AFTER the new client
-- code — using has_pin / verify_agent_pin / mark_agent_login — is
-- confirmed working on the live site).
-- ============================================================

-- has_pin: lets the client know whether to show the PIN pad at all,
-- without ever exposing the PIN value itself.
alter table public.agents
  add column if not exists has_pin boolean generated always as (pin is not null and pin <> '') stored;

-- Verify a PIN server-side. Returns true/false only — the pin value
-- itself never leaves the database once the client stops reading it
-- directly (see the lockdown migration).
create or replace function public.verify_agent_pin(p_agent_id bigint, p_pin text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.agents
    where id = p_agent_id and pin is not null and pin = p_pin
  );
$$;
grant execute on function public.verify_agent_pin(bigint, text) to anon;

-- Let an agent stamp their own last_login without general write access
-- to the table. p_login_ts is the same client-formatted string the app
-- already computes today (via the JS `now()` helper) — this just
-- relocates where the write happens, not the value or its format.
create or replace function public.mark_agent_login(p_agent_id bigint, p_login_ts text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.agents set last_login = p_login_ts where id = p_agent_id;
$$;
grant execute on function public.mark_agent_login(bigint, text) to anon;
