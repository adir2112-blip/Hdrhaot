-- ============================================================
-- Step 2/2 — DO NOT RUN until the client code from this same change
-- (has_pin / verify_agent_pin / mark_agent_login) is live on the actual
-- site and confirmed working. Running this first will break agent login
-- immediately, the same "lock rules before the client can authenticate"
-- mistake the deployment-order warning in the additive migration exists
-- to prevent.
-- ============================================================

-- Re-grant anon's column list without pin: same double-revoke pattern as
-- 20260725000004_hide_agent_id_number_fix.sql (a column-level revoke
-- alone has no effect while the broader table-level grant still stands).
revoke select on public.agents from anon;
grant select (id, name, depts, has_pin, last_login, active, phone, is_active)
  on public.agents to anon;

-- Lock writes to managers only. The two agent-side use cases (PIN check,
-- stamping their own last_login) now go through the RPCs added in the
-- additive migration, which run as the function owner and bypass RLS —
-- same technique already used for is_manager() itself.
drop policy if exists "agents: write all -- PHASE 2 TODO restrict" on public.agents;
drop policy if exists "agents: managers write" on public.agents;
create policy "agents: managers write" on public.agents
  for all using (is_manager()) with check (is_manager());
