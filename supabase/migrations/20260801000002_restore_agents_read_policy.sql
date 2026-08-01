-- Emergency fix: 20260801000001 replaced the *only* remaining policy on
-- public.agents (a "for all using(true)" one) with a managers-only "for
-- all" policy, not realizing 20260725000002 had already consolidated the
-- separate read-all SELECT policy into that same "for all" policy as a
-- redundant-policy cleanup. Net effect: anon lost SELECT entirely, not
-- just the pin column — every agent-facing screen broke, not just PIN
-- verification.
--
-- Restore a dedicated open SELECT policy (row-level; the column-level
-- grant from 20260801000001 still restricts which columns are visible).
-- The managers-only "for all" policy stays as-is for insert/update/delete.
drop policy if exists "agents: read all" on public.agents;
create policy "agents: read all" on public.agents
  for select using (true);
