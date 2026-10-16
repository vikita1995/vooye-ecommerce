create or replace function public.review_seller_application(
  p_seller_firebase_uid text,
  p_next_status text,
  p_reason text,
  p_admin_firebase_uid text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  current_row public.seller_profiles%rowtype;
  updated_row public.seller_profiles%rowtype;
  audit_row public.seller_application_audit%rowtype;
  clean_reason text := nullif(pg_catalog.btrim(p_reason), '');
begin
  if p_seller_firebase_uid is null or pg_catalog.length(pg_catalog.btrim(p_seller_firebase_uid)) = 0 then
    raise exception using errcode = '22023', message = 'INVALID_SELLER_UID';
  end if;
  if p_admin_firebase_uid is null or pg_catalog.length(pg_catalog.btrim(p_admin_firebase_uid)) = 0 then
    raise exception using errcode = '22023', message = 'INVALID_ADMIN_UID';
  end if;
  if p_next_status not in ('approved', 'rejected', 'suspended') then
    raise exception using errcode = '22023', message = 'INVALID_SELLER_STATUS';
  end if;
  if p_next_status in ('rejected', 'suspended') and (clean_reason is null or pg_catalog.length(clean_reason) < 5) then
    raise exception using errcode = '22023', message = 'REASON_REQUIRED';
  end if;

  select * into current_row
  from public.seller_profiles
  where firebase_uid = p_seller_firebase_uid
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'SELLER_APPLICATION_NOT_FOUND';
  end if;

  if not (
    (current_row.status = 'pending' and p_next_status in ('approved', 'rejected'))
    or (current_row.status = 'approved' and p_next_status = 'suspended')
    or (current_row.status = 'suspended' and p_next_status = 'approved')
  ) then
    raise exception using errcode = '22023', message = 'INVALID_SELLER_STATUS_TRANSITION';
  end if;

  update public.seller_profiles
  set status = p_next_status, updated_at = pg_catalog.now()
  where firebase_uid = p_seller_firebase_uid
  returning * into updated_row;

  insert into public.seller_application_audit (
    seller_firebase_uid, previous_status, new_status, reason, admin_firebase_uid
  )
  values (
    p_seller_firebase_uid, current_row.status, updated_row.status, clean_reason, p_admin_firebase_uid
  )
  returning * into audit_row;

  return pg_catalog.jsonb_build_object(
    'application', pg_catalog.to_jsonb(updated_row),
    'event', pg_catalog.to_jsonb(audit_row)
  );
end;
$$;

revoke all on function public.review_seller_application(text, text, text, text) from public;
revoke all on function public.review_seller_application(text, text, text, text) from anon, authenticated;
grant execute on function public.review_seller_application(text, text, text, text) to service_role;
