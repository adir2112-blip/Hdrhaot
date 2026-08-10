-- The briefings table (older briefing system, used by the manager
-- dashboard's מבחנים panel) never tracked who created each briefing,
-- unlike briefing_docs which already has manager_email. Adding the same
-- column here so the dashboard can show who published each briefing.
alter table public.briefings add column if not exists manager_email text;
