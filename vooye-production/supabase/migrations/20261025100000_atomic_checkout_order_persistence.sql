-- P0: atomic checkout persistence against the existing Supabase commerce schema.
-- Repository migration only. Do not apply to production without an approved release.

create or replace function public.create_checkout_order(
  p_firebase_uid text,
  p_items jsonb,
  p_shipping jsonb,
  p_shipping_fee_paise integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer public.customers%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty integer;
  v_product_id uuid;
  v_subtotal_paise bigint := 0;
  v_line_paise bigint;
  v_order_id uuid;
  v_order_number text;
  v_now timestamptz := now();
  v_total_paise bigint;
  v_lines jsonb := '[]'::jsonb;
  v_shipping jsonb;
begin
  if p_firebase_uid is null or length(trim(p_firebase_uid)) = 0 then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then
    raise exception 'INVALID_ITEMS' using errcode = '22023';
  end if;
  if p_shipping_fee_paise is null or p_shipping_fee_paise < 0 then
    raise exception 'INVALID_SHIPPING_FEE' using errcode = '22023';
  end if;

  select * into v_customer
  from public.customers
  where firebase_uid = p_firebase_uid and status = 'active'
  for update;
  if not found then
    raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Deterministic lock order prevents deadlocks when carts contain multiple products.
  for v_item in
    select value from jsonb_array_elements(p_items)
    order by (value->>'productId')
  loop
    if coalesce(v_item->>'productId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or coalesce(v_item->>'quantity','') !~ '^[0-9]+$' then
      raise exception 'INVALID_ITEM' using errcode = '22023';
    end if;
    v_product_id := (v_item->>'productId')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    if v_qty < 1 or v_qty > 10 then
      raise exception 'INVALID_QUANTITY' using errcode = '22023';
    end if;

    -- A repeated product in the request is rejected: it must be merged before this RPC.
    if (select count(*) from jsonb_array_elements(p_items) x
        where lower(x->>'productId') = lower(v_item->>'productId')) > 1 then
      raise exception 'DUPLICATE_PRODUCT' using errcode = '22023';
    end if;

    select p.* into v_product
    from public.products p
    join public.seller_profiles s on s.firebase_uid = p.seller_uid
    where p.id = v_product_id
      and p.status = 'approved'
      and s.status = 'approved'
      and p.stock >= v_qty
    for update of p;
    if not found then
      raise exception 'INSUFFICIENT_STOCK' using errcode = 'P0001';
    end if;

    v_line_paise := v_product.price_paise::bigint * v_qty;
    if v_line_paise < 1 or v_line_paise > 9000000000000000 then
      raise exception 'INVALID_ORDER_TOTAL' using errcode = '22003';
    end if;
    v_subtotal_paise := v_subtotal_paise + v_line_paise;
    if v_subtotal_paise > 9000000000000000 then
      raise exception 'INVALID_ORDER_TOTAL' using errcode = '22003';
    end if;

    update public.products
      set stock = stock - v_qty, updated_at = v_now
      where id = v_product.id and stock >= v_qty;
    if not found then
      raise exception 'INSUFFICIENT_STOCK' using errcode = 'P0001';
    end if;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id::text,
      'product_name', v_product.name,
      'quantity', v_qty,
      'unit_price_paise', v_product.price_paise,
      'line_total_paise', v_line_paise
    ));
  end loop;

  v_total_paise := v_subtotal_paise + p_shipping_fee_paise;
  if v_total_paise < 1 or v_total_paise > 9000000000000000 then
    raise exception 'INVALID_ORDER_TOTAL' using errcode = '22003';
  end if;

  v_shipping := jsonb_build_object(
    'recipient_name', p_shipping->>'name',
    'phone_e164', p_shipping->>'phone',
    'address_line1', p_shipping->>'address1',
    'address_line2', nullif(p_shipping->>'address2',''),
    'city', p_shipping->>'city',
    'state', p_shipping->>'state',
    'postal_code', p_shipping->>'postalCode',
    'country_code', 'IN'
  );
  v_order_number := 'VOO-' || to_char(v_now at time zone 'UTC', 'YYYYMMDDHH24MISS') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.orders (
    order_number, customer_id, status, currency, subtotal, shipping_amount,
    discount_amount, tax_amount, total_amount, billing_address_snapshot, shipping_address_snapshot, placed_at
  ) values (
    v_order_number, v_customer.id, 'pending', 'INR',
    v_subtotal_paise::numeric / 100, p_shipping_fee_paise::numeric / 100,
    0, 0, v_total_paise::numeric / 100, v_shipping, v_shipping, v_now
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(v_lines)
  loop
    insert into public.order_items (
      order_id, product_id, product_name, quantity, unit_price, line_total
    ) values (
      v_order_id,
      v_item->>'product_id',
      v_item->>'product_name',
      (v_item->>'quantity')::integer,
      (v_item->>'unit_price_paise')::numeric / 100,
      (v_item->>'line_total_paise')::numeric / 100
    );
  end loop;

  insert into public.payment_transactions (
    order_id, provider, status, amount, currency, provider_metadata
  ) values (
    v_order_id, 'razorpay', 'pending', v_total_paise::numeric / 100, 'INR',
    jsonb_build_object('checkout_state', 'awaiting_provider_order', 'expires_at', (v_now + interval '15 minutes'))
  );

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'amount_paise', v_total_paise,
    'currency', 'INR',
    'expires_at', (v_now + interval '15 minutes')
  );
end;
$$;

create or replace function public.attach_razorpay_order(
  p_order_id uuid,
  p_firebase_uid text,
  p_provider_order_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
begin
  if coalesce(trim(p_provider_order_id),'') = '' then
    raise exception 'INVALID_PROVIDER_ORDER_ID' using errcode = '22023';
  end if;

  update public.payment_transactions pt
    set provider_order_id = p_provider_order_id,
        provider_metadata = coalesce(pt.provider_metadata, '{}'::jsonb) ||
          jsonb_build_object('checkout_state','provider_order_created'),
        updated_at = now()
  from public.orders o
  join public.customers c on c.id = o.customer_id
  where pt.order_id = o.id
    and o.id = p_order_id
    and c.firebase_uid = p_firebase_uid
    and o.status = 'pending'
    and pt.status = 'pending'
    and pt.provider = 'razorpay'
    and pt.provider_order_id is null;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.cancel_unpaid_checkout_order(
  p_order_id uuid,
  p_firebase_uid text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payment_transactions%rowtype;
  v_updated integer;
  v_item record;
  v_metadata jsonb;
begin
  -- Use the same lock order as webhook and expiry processing: payment, then order.
  select pt.* into v_payment
  from public.payment_transactions pt
  where pt.order_id = p_order_id
    and pt.provider = 'razorpay'
  for update;
  if not found then return false; end if;

  select o.* into v_order
  from public.orders o
  join public.customers c on c.id = o.customer_id
  where o.id = p_order_id
    and c.firebase_uid = p_firebase_uid
  for update of o;
  if not found then return false; end if;

  -- Re-check state only after both rows are locked.
  if v_order.status <> 'pending' or v_payment.status <> 'pending' then
    return false;
  end if;

  v_metadata := coalesce(v_payment.provider_metadata, '{}'::jsonb);

  -- The payment lock serializes cancellation against webhook/expiry. The marker
  -- ensures inventory is restored at most once for this payment transaction.
  if coalesce((v_metadata->>'inventory_released')::boolean, false) = false then
    for v_item in
      select oi.product_id, sum(oi.quantity)::integer as quantity
      from public.order_items oi
      where oi.order_id = p_order_id
      group by oi.product_id
      order by oi.product_id
    loop
      update public.products
      set stock = stock + v_item.quantity,
          updated_at = now()
      where id::text = v_item.product_id;

      if not found then
        raise exception 'PRODUCT_MISSING_DURING_STOCK_RELEASE' using errcode = 'P0002';
      end if;
    end loop;

    v_metadata := v_metadata || jsonb_build_object(
      'inventory_released', true,
      'inventory_release_reason', 'checkout_cancelled'
    );
  end if;

  update public.payment_transactions
  set status = 'failed',
      provider_metadata = v_metadata || jsonb_build_object(
        'checkout_state', 'cancelled',
        'cancel_reason', left(coalesce(p_reason, 'unknown'), 80)
      ),
      updated_at = now()
  where id = v_payment.id
    and status = 'pending';

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'PAYMENT_STATE_RACE' using errcode = '40001';
  end if;

  update public.orders
  set status = 'cancelled',
      updated_at = now()
  where id = p_order_id
    and status = 'pending';

  if not found then
    raise exception 'ORDER_STATE_RACE' using errcode = '40001';
  end if;

  return true;
end;
$$;

revoke all on function public.create_checkout_order(text,jsonb,jsonb,integer) from public, anon, authenticated;
revoke all on function public.attach_razorpay_order(uuid,text,text) from public, anon, authenticated;
revoke all on function public.cancel_unpaid_checkout_order(uuid,text,text) from public, anon, authenticated;
grant execute on function public.create_checkout_order(text,jsonb,jsonb,integer) to service_role;
grant execute on function public.attach_razorpay_order(uuid,text,text) to service_role;
grant execute on function public.cancel_unpaid_checkout_order(uuid,text,text) to service_role;
