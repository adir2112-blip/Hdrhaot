-- ============================================================
-- Per-manager department scope (phase 1: visibility in the app).
--
-- manager_depts: which depts / groups each manager is assigned to, set by
-- the super admin in ניהול › מנהלים. No row (or empty depts) = full access,
-- so existing managers keep working until they are assigned.
-- Entries are dept names (e.g. 'כללית אקטיב'), group keys (e.g. 'מובמנט',
-- meaning every dept in the group) or 'כללי'.
--
-- kb_folders.dept: which dept a folder belongs to (same value space as
-- knowledge_base.dept). Existing folders get a suggested dept from their
-- name/contents below; the super admin can change it in the library.
-- ============================================================

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'adir2112@gmail.com';
$$;

create table if not exists public.manager_depts (
  email      text primary key check (email = lower(email)),
  depts      text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.manager_depts enable row level security;

-- A manager may read only their own row; only the super admin sees all rows
-- and is the only one who can change assignments.
drop policy if exists "manager_depts: read own or super admin" on public.manager_depts;
create policy "manager_depts: read own or super admin" on public.manager_depts
  for select to authenticated
  using (public.is_super_admin() or email = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "manager_depts: super admin insert" on public.manager_depts;
create policy "manager_depts: super admin insert" on public.manager_depts
  for insert to authenticated with check (public.is_super_admin());

drop policy if exists "manager_depts: super admin update" on public.manager_depts;
create policy "manager_depts: super admin update" on public.manager_depts
  for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "manager_depts: super admin delete" on public.manager_depts;
create policy "manager_depts: super admin delete" on public.manager_depts
  for delete to authenticated using (public.is_super_admin());

-- ── Folder dept ─────────────────────────────────────────────
alter table public.kb_folders add column if not exists dept text;

-- Suggested depts for the existing folders (by name + parent), only where
-- not set yet. Folders not matched stay null = visible only through the
-- articles inside them.
with s(name, parent, dept) as (values
  ('FREEFIT',                     null,          'פריפיט'),
  ('מכירות',                      'FREEFIT',     'פריפיט מכירות'),
  ('שירות',                       'FREEFIT',     'פריפיט שירות'),
  ('מכירות',                      'שירות',       'פריפיט מכירות'),
  ('אלן קאר',                     null,          'אלן קאר'),
  ('מאוחדת',                      null,          'מאוחדת'),
  ('מובמנט',                      null,          'מובמנט'),
  ('כללית אקטיב',                 'מובמנט',      'כללית אקטיב'),
  ('קישורים למערכות כללית אקטיב', 'כללית אקטיב', 'כללית אקטיב'),
  ('לאומית FIT',                  'מובמנט',      'לאומית FIT'),
  ('מעוף לעמית',                  'מובמנט',      'מעוף לעמית'),
  ('עובדים בריא',                 'מובמנט',      'עובדים בריא'),
  ('מערכות עובדים',               'מובמנט',      'עובדים בריא'),
  ('קישורים למערכות',             'מובמנט',      'מובמנט')
)
update public.kb_folders f
   set dept = s.dept
  from s
 where f.dept is null
   and f.name = s.name
   and coalesce((select p.name from public.kb_folders p where p.id = f.parent_id), '') = coalesce(s.parent, '');
