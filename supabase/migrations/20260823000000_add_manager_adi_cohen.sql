-- New manager (עדי כהן, adic@m4l.co.il) added to the is_manager() allowlist
-- so her requests pass RLS on manager-only tables (controls, discipline,
-- ai_feedback, etc.) — mirrors the client-side MANAGER_EMAILS list in
-- index.html, which must be updated in the same change.
create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'email', '') in (
    'adir2112@gmail.com',
    'tala@targetcall.co.il',
    'thielac@targetcall.co.il',
    'levanad@m4l.co.il',
    'hodayam@targetcall.co.il',
    'eliyab@targetcall.co.il',
    'bekib@targetcall.co.il',
    'adic@m4l.co.il'
  );
$$;
