-- Atomic Supabase payment lifecycle primitives.
-- Repository-only migration: do not apply to production without an approved release.
-- These functions are intentionally not wired into application routes in this PR.
-- Follow-up application changes must use these RPCs before checkout can be enabled.

create or replace function public.process_razorpay_payment_event(
  p_provider_order_id text,
  p_provider_payment_id text,
  p_event_type text,
  p_event_key text,
  p_payload_hash text,
  p_amount_paise bigint,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.payment_transactions%rowtype;
  v_order public.orders%rowtype;
  v_metadata jsonb;
  v_item record;
  v_state text;
  v_updated integer;
begin
  if coalesce(trim(p_provider_order_id), '') = ''
     or coalesce(trim(p_event_key), '') = ''
     or p_event_type not in ('payment.captured', 'payment.failed') then
    raise exception 'INVALID_PAYMENT_EVENT' using errcode = '22023';
  end if;

  -- Serialize all callbacks for this provider order through the payment row.
  select pt.* into v_payment
  from public.payment_transactions pt
  where pt.provider = 'razorpay'
    and pt.provider_order_id = p_provider_order_id
  for update;
  if not found then
    return jsonb_build_object('state', 'unknown_order', 'reconciliation_required', true);
  end if;

  select o.* into v_order
  from public.orders o
  where o.id = v_payment.order_id
  for update;
  if not found then
    return jsonb_build_object('state', 'order_missing', 'reconciliation_required', true);
  end if;

  v_metadata := coalesce(v_payment.provider_metadata, '{}'::jsonb);
  if coalesce(v_metadata->'processed_event_keys', '[]'::jsonb) @> jsonb_build_array(p_event_key) then
    return jsonb_build_object('state', 'duplicate', 'order_id', v_order.id, 'order_number', v_order.order_number);
  end if;

  if p_event_type = 'payment.captured' then
    if coalesce(trim(p_provider_payment_id), '') = ''
       or p_amount_paise is null
       or (round(v_payment.amount * 100))::bigint <> p_amount_paise
       or upper(coalesce(p_currency, '')) <> upper(v_payment.currency) then
      update public.payment_transactions
      set provider_metadata = v_metadata
        || jsonb_build_object('reconciliation_required', true,
             'last_reconciliation_reason', 'captured_payment_amount_or_currency_mismatch',
             'last_event_key', p_event_key,
             'last_payload_hash', p_payload_hash,
             'last_event_at', now()),
          updated_at = now()
      where id = v_payment.id;
      return jsonb_build_object('state', 'mismatch', 'reconciliation_required', true);
    end if;

    if v_payment.status = 'captured'
       and v_payment.provider_payment_id = p_provider_payment_id
       and v_order.status in ('confirmed', 'processing', 'shipped', 'delivered') then
      update public.payment_transactions
      set provider_metadata = v_metadata
        || jsonb_build_object('last_duplicate_event_key', p_event_key,
             'last_payload_hash', p_payload_hash,
             'last_event_at', now()),
          updated_at = now()
      where id = v_payment.id;
      return jsonb_build_object('state', 'duplicate_captured', 'order_id', v_order.id, 'order_number', v_order.order_number);
    end if;

    if v_order.status <> 'pending' or v_payment.status <> 'pending' then
      update public.payment_transactions
      set provider_metadata = v_metadata
        || jsonb_build_object('reconciliation_required', true,
             'last_reconciliation_reason', 'capture_after_order_state_changed',
             'late_provider_payment_id', p_provider_payment_id,
             'last_event_key', p_event_key,
             'last_payload_hash', p_payload_hash,
             'last_event_at', now()),
          updated_at = now()
      where id = v_payment.id;
      return jsonb_build_object('state', 'late_capture', 'reconciliation_required', true);
    end if;

    update public.payment_transactions
    set provider_payment_id = p_provider_payment_id,
        status = 'captured',
        provider_metadata = v_metadata
          || jsonb_build_object('processed_event_keys',
               coalesce(v_metadata->'processed_event_keys', '[]'::jsonb) || jsonb_build_array(p_event_key),
               'last_event_type', p_event_type,
               'last_payload_hash', p_payload_hash,
               'last_event_at', now(),
               'reconciliation_required', false),
        updated_at = now()
    where id = v_payment.id;

    update public.orders
    set status = 'confirmed', updated_at = now()
    where id = v_order.id and status = 'pending';
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      raise exception 'ORDER_STATE_RACE' using errcode = '40001';
    end if;

    return jsonb_build_object('state', 'captured', 'order_id', v_order.id, 'order_number', v_order.order_number);
  end if;

  -- A failed-payment callback must never cancel an already captured order.
  if v_payment.status = 'captured' or v_order.status in ('confirmed', 'processing', 'shipped', 'delivered') then
    update public.payment_transactions
    set provider_metadata = v_metadata
      || jsonb_build_object('last_failure_after_capture_event_key', p_event_key,
           'last_payload_hash', p_payload_hash,
           'last_event_at', now()),
        updated_at = now()
    where id = v_payment.id;
    return jsonb_build_object('state', 'failure_after_capture_ignored', 'order_id', v_order.id);
  end if;

  if v_order.status <> 'pending' or v_payment.status <> 'pending' then
    return jsonb_build_object('state', 'already_closed', 'order_id', v_order.id);
  end if;

  -- The payment row lock and metadata flag make inventory release exactly-once.
  if coalesce((v_metadata->>'inventory_released')::boolean, false) = false then
    for v_item in
      select oi.product_id, sum(oi.quantity)::integer as quantity
      from public.order_items oi
      where oi.order_id = v_order.id
      group by oi.product_id
      order by oi.product_id
    loop
      update public.products
      set stock = stock + v_item.quantity, updated_at = now()
      where id::text = v_item.product_id;
      if not found then
        raise exception 'PRODUCT_MISSING_DURING_STOCK_RELEASE' using errcode = 'P0002';
      end if;
    end loop;
    v_metadata := v_metadata || jsonb_build_object('inventory_released', true, 'inventory_release_reason', 'payment_failed');
  end if;

  update public.payment_transactions
  set status = 'failed',
      provider_metadata = v_metadata
        || jsonb_build_object('processed_event_keys',
             coalesce(v_metadata->'processed_event_keys', '[]'::jsonb) || jsonb_build_array(p_event_key),
             'last_event_type', p_event_type,
             'last_payload_hash', p_payload_hash,
             'last_event_at', now()),
      updated_at = now()
  where id = v_payment.id;

  update public.orders set status = 'cancelled', updated_at = now()
  where id = v_order.id and status = 'pending';

  return jsonb_build_object('state', 'failed_and_cancelled', 'order_id', v_order.id, 'order_number', v_order.order_number);
end;
$$;

create or replace function public.expire_pending_checkout_orders(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.payment_transactions%rowtype;
  v_order public.orders%rowtype;
  v_item record;
  v_metadata jsonb;
  v_expired integer := 0;
  v_skipped integer := 0;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'INVALID_EXPIRY_LIMIT' using errcode = '22023';
  end if;

  -- Lock payment rows first, matching webhook processing's lock order.
  for v_payment in
    select pt.*
    from public.payment_transactions pt
    where pt.provider = 'razorpay'
      and pt.status = 'pending'
      and coalesce((pt.provider_metadata->>'expires_at')::timestamptz, pt.created_at + interval '15 minutes') <= now()
    order by pt.created_at
    for update skip locked
    limit p_limit
  loop
    select o.* into v_order
    from public.orders o
    where o.id = v_payment.order_id
    for update;
    if not found or v_order.status <> 'pending' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_metadata := coalesce(v_payment.provider_metadata, '{}'::jsonb);
    if coalesce((v_metadata->>'inventory_released')::boolean, false) = false then
      for v_item in
        select oi.product_id, sum(oi.quantity)::integer as quantity
        from public.order_items oi
        where oi.order_id = v_order.id
        group by oi.product_id
        order by oi.product_id
      loop
        update public.products
        set stock = stock + v_item.quantity, updated_at = now()
        where id::text = v_item.product_id;
        if not found then
          raise exception 'PRODUCT_MISSING_DURING_STOCK_RELEASE' using errcode = 'P0002';
        end if;
      end loop;
    end if;

    update public.payment_transactions
    set status = 'failed',
        provider_metadata = v_metadata || jsonb_build_object(
          'inventory_released', true,
          'inventory_release_reason', 'order_expired',
          'checkout_state', 'expired',
          'expired_at', now()),
        updated_at = now()
    where id = v_payment.id and status = 'pending';

    if not found then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    update public.orders set status = 'cancelled', updated_at = now()
    where id = v_order.id and status = 'pending';

    if found then v_expired := v_expired + 1;
    else v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object('expired', v_expired, 'skipped', v_skipped);
end;
$$;

revoke all on function public.process_razorpay_payment_event(text,text,text,text,text,bigint,text) from public, anon, authenticated;
revoke all on function public.expire_pending_checkout_orders(integer) from public, anon, authenticated;
grant execute on function public.process_razorpay_payment_event(text,text,text,text,text,bigint,text) to service_role;
grant execute on function public.expire_pending_checkout_orders(integer) to service_role;
