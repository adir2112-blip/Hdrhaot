-- Supabase's built-in `db advisors` flagged this as "Multiple Permissive
-- Policies" (performance, not security): agents had both a SELECT-only
-- policy and a broader FOR ALL policy that already covers SELECT, so
-- every read evaluated two redundant policies. Dropping the narrower one
-- — the FOR ALL policy already keeps `agents` exactly as open as before.
drop policy if exists "agents: read all -- PHASE 2 TODO restrict columns" on public.agents;
