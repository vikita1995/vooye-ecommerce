create table if not exists public.seller_application_audit (
  id uuid primary key default gen_random_uuid(),
  seller_firebase_uid text not null references public.seller_profiles(firebase_uid) on delete cascade,
  previous_status text not null check (previous_status in ('pending','approved','rejected','suspended')),
  new_status text not null check (new_status in ('pending','approved','rejected','suspended')),
  reason text,
  admin_firebase_uid text not null,
  created_at timestamptz not null default now()
);

create index if not exists seller_application_audit_seller_created_idx
  on public.seller_application_audit (seller_firebase_uid, created_at desc);

alter table public.seller_application_audit enable row level security;
revoke all on public.seller_application_audit from anon, authenticated;
grant select, insert, update, delete on public.seller_application_audit to service_role;
drop policy if exists "deny direct client access to seller application audit" on public.seller_application_audit;
create policy "deny direct client access to seller application audit"
  on public.seller_application_audit
  for all
  to anon, authenticated
  using (false)
  with check (false);
