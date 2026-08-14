-- Aquarium Cafe — add 14% VAT to delivery checkout
-- Existing data is preserved. Menu prices remain unchanged.
-- VAT is calculated on (subtotal - discounts - loyalty redemption), not delivery.

alter table public.delivery_orders
  add column if not exists vat_amount numeric(10,2) not null default 0;

create or replace function public.place_delivery_order(p jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name    text := trim(coalesce(p ->> 'name', ''));
  v_phone   text := trim(coalesce(p ->> 'phone', ''));
  v_detail  text := trim(coalesce(p ->> 'addressDetail', ''));
  v_maps    text := trim(coalesce(p ->> 'mapsLink', ''));
  v_notes   text := trim(coalesce(p ->> 'notes', ''));
  v_payment text := coalesce(p ->> 'payment', 'cash');
  v_zone_id    bigint := nullif(p ->> 'zoneId', '')::bigint;
  v_subzone_id bigint := nullif(p ->> 'subZoneId', '')::bigint;
  v_user    uuid := nullif(p ->> 'userId', '')::uuid;
  v_coupon  text := upper(trim(coalesce(p ->> 'coupon', '')));
  v_redeem  integer := greatest(coalesce((p ->> 'redeemPoints')::int, 0), 0);

  v_cfg     jsonb;
  v_enabled boolean := true;
  v_methods jsonb := '["cash", "card_on_delivery"]'::jsonb;
  v_free    numeric(10,2) := 0;
  v_min     numeric(10,2) := 0;
  v_eta     integer := 45;

  v_zone    record;
  v_subzone record;
  v_subname text := '';   -- plain var: reading a field of an never-assigned
                          -- record raises 55000, and guests may skip step 2
  v_priced  jsonb;
  v_lines   jsonb := '[]'::jsonb;
  v_subtotal numeric(10,2) := 0;
  v_fee     numeric(10,2) := 0;

  v_d         discounts%rowtype;
  v_amount    numeric(10,2);
  v_dis_amount numeric(10,2) := 0;
  v_dis_id    bigint;
  v_label     text := '';
  v_coupon_ok text := '';

  v_loy     jsonb;
  v_pv      numeric(10,2) := 0;
  v_min_r   integer := 0;
  v_max_r   integer := 0;
  v_bal     integer := 0;
  v_pts_discount numeric(10,2) := 0;

  v_vat     numeric(10,2) := 0;
  v_total   numeric(10,2);
  v_address text;
  v_id      uuid;
  v_created timestamptz;
begin
  -- live configuration
  select value into v_cfg from delivery_settings where key = 'config';
  if v_cfg is not null then
    v_enabled := coalesce((v_cfg ->> 'enabled')::boolean, true);
    v_methods := coalesce(v_cfg -> 'payment_methods', v_methods);
    v_free    := coalesce((v_cfg ->> 'free_above')::numeric, 0);
    v_min     := coalesce((v_cfg ->> 'min_order')::numeric, 0);
    v_eta     := coalesce((v_cfg ->> 'estimated_minutes')::int, 45);
  end if;

  if not v_enabled then
    raise exception 'Delivery is temporarily unavailable — please call us to order.';
  end if;

  -- the signed-in customer may only order as themselves
  if v_user is not null and auth.uid() is distinct from v_user then
    raise exception 'Please sign in again before ordering.';
  end if;

  -- STEP 1+2 · zone & sub zone
  if v_zone_id is null then
    raise exception 'Please choose your delivery zone.';
  end if;
  select * into v_zone from delivery_zones where id = v_zone_id;
  if not found then
    raise exception 'That delivery zone no longer exists.';
  end if;
  if not v_zone.active then
    raise exception 'Delivery is currently unavailable in this zone.';
  end if;
  v_fee := v_zone.fee;
  if v_zone.free_above > 0 then
    v_free := v_zone.free_above;
  end if;

  if v_subzone_id is not null then
    select * into v_subzone from delivery_subzones where id = v_subzone_id;
    if not found or v_subzone.zone_id <> v_zone_id then
      raise exception 'Please choose a sub zone inside the selected zone.';
    end if;
    if not v_subzone.active then
      raise exception 'That sub zone is currently unavailable.';
    end if;
    -- v5.1 · the sub zone's own delivery fee always wins over the
    -- parent zone's fee (zone fee applies only when no sub zone is chosen).
    v_fee := v_subzone.delivery_fee;
    v_subname := v_subzone.name_en;
  end if;

  -- STEP 3 · contact & detailed address
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'Please enter your full name.';
  end if;
  if char_length(v_phone) < 8 or char_length(v_phone) > 20 then
    raise exception 'Please enter a valid phone number.';
  end if;
  if char_length(v_detail) < 4 or char_length(v_detail) > 500 then
    raise exception 'Please write your full address (building, apartment, floor, landmark).';
  end if;
  if char_length(v_maps) > 500 or char_length(v_notes) > 500 then
    raise exception 'Some fields are too long.';
  end if;
  if not (v_methods ? v_payment) then
    raise exception 'Please choose an available payment method.';
  end if;

  -- prices, always server-side
  v_priced   := public._price_cart(p -> 'items');
  v_lines    := v_priced -> 'lines';
  v_subtotal := (v_priced ->> 'subtotal')::numeric;

  if v_min > 0 and v_subtotal < v_min then
    raise exception 'Minimum order for delivery is % EGP — your subtotal is % EGP.', v_min, v_subtotal;
  end if;

  if v_free > 0 and v_subtotal >= v_free then
    v_fee := 0;
  end if;

  -- ══ DISCOUNTS ══
  if v_coupon <> '' then
    select * into v_d from discounts
     where code is not null and upper(code) = v_coupon
       and active and starts_at <= now()
       and (expires_at is null or expires_at > now())
       and (max_uses is null or used_count < max_uses)
     limit 1;
    if not found then
      raise exception 'This coupon code is invalid or has expired.';
    end if;
    if v_subtotal < v_d.min_order then
      raise exception 'This coupon needs a minimum order of % EGP.', v_d.min_order;
    end if;
    if v_d.type = 'signup' then
      if v_user is null then
        raise exception 'This coupon is for registered customers — please sign in.';
      end if;
      if exists (select 1 from delivery_orders where user_id = v_user) then
        raise exception 'This welcome coupon works on your first order only.';
      end if;
    end if;
    v_dis_amount := public._discount_value(v_d, v_lines, v_subtotal);
    if v_dis_amount <= 0 then
      raise exception 'This coupon does not apply to the items in your cart.';
    end if;
    v_dis_id    := v_d.id;
    v_label     := v_d.name;
    v_coupon_ok := v_coupon;
  else
    -- best automatic discount (code-less): global / product / category / signup
    for v_d in
      select * from discounts
       where code is null and active and starts_at <= now()
         and (expires_at is null or expires_at > now())
         and (max_uses is null or used_count < max_uses)
       order by id
    loop
      if v_subtotal < v_d.min_order then
        continue;
      end if;
      if v_d.type = 'signup'
         and (v_user is null
              or exists (select 1 from delivery_orders where user_id = v_user)) then
        continue;
      end if;
      v_amount := public._discount_value(v_d, v_lines, v_subtotal);
      if v_amount > v_dis_amount then
        v_dis_amount := v_amount;
        v_dis_id     := v_d.id;
        v_label      := v_d.name;
      end if;
    end loop;
  end if;
  v_dis_amount := least(v_dis_amount, v_subtotal);

  -- ══ LOYALTY redemption ══
  if v_redeem > 0 then
    if v_user is null then
      raise exception 'Sign in to redeem loyalty points.';
    end if;
    select value into v_loy from loyalty_settings where key = 'config';
    if not coalesce((v_loy ->> 'enabled')::boolean, true) then
      raise exception 'Loyalty rewards are currently disabled.';
    end if;
    v_pv    := coalesce((v_loy ->> 'point_value_egp')::numeric, 0);
    v_min_r := coalesce((v_loy ->> 'min_redeem')::int, 0);
    v_max_r := coalesce((v_loy ->> 'max_redeem')::int, 0);
    if v_pv <= 0 then
      raise exception 'Redemption is not configured yet.';
    end if;
    if v_redeem < v_min_r then
      raise exception 'Minimum redemption is % points.', v_min_r;
    end if;
    if v_max_r > 0 and v_redeem > v_max_r then
      raise exception 'Maximum redemption per order is % points.', v_max_r;
    end if;
    select points into v_bal from loyalty_accounts where user_id = v_user;
    if not found or v_bal < v_redeem then
      raise exception 'Not enough points — your balance is %.', coalesce(v_bal, 0);
    end if;
    v_pts_discount := round(v_redeem * v_pv, 2);
    v_pts_discount := least(v_pts_discount, v_subtotal - v_dis_amount);
    -- atomic check-and-set: the balance check lives INSIDE the update, so two
    -- simultaneous orders redeeming the same wallet can never drive the
    -- balance negative — the loser raises here and its WHOLE order rolls back
    update loyalty_accounts
       set points = points - v_redeem
     where user_id = v_user
       and points >= v_redeem;
    if not found then
      raise exception 'Not enough points — your balance just changed, please try again.';
    end if;
  end if;

  -- Menu prices are before VAT. VAT is calculated on the net taxable item amount
  -- after discounts and loyalty redemption; delivery is not included in VAT here.
  v_vat := round(greatest(v_subtotal - v_dis_amount - v_pts_discount, 0) * 0.14, 2);
  v_total := greatest(round(v_subtotal - v_dis_amount - v_pts_discount + v_fee + v_vat, 2), 0);

  v_address := left(
    v_zone.name_en
    || case when v_subname <> '' then ' — ' || v_subname else '' end
    || ' — ' || v_detail, 700);

  insert into delivery_orders
    (customer_name, customer_phone, address, maps_link, notes,
     payment_method, items, subtotal, delivery_fee, vat_amount, total, estimated_minutes,
     zone_id, subzone_id, address_detail, user_id,
     discount_id, discount_amount, discount_label, coupon_code, loyalty_redeemed)
  values
    (v_name, v_phone, v_address, v_maps, v_notes,
     v_payment, v_lines, v_subtotal, v_fee, v_vat, v_total, v_eta,
     v_zone_id, v_subzone_id, v_detail, v_user,
     v_dis_id, v_dis_amount, left(v_label, 120), v_coupon_ok, v_redeem)
  returning id, created_at into v_id, v_created;

  if v_redeem > 0 then
    insert into loyalty_transactions (user_id, order_id, delta, balance_after, reason, note)
    select v_user, v_id, -v_redeem,
           (select points from loyalty_accounts where user_id = v_user),
           'redeem', 'Points redeemed on a delivery order';
  end if;

  if v_dis_id is not null then
    -- atomic usage counter: the limit is re-checked under the row lock, so two
    -- simultaneous checkouts can never exceed max_uses; when the limit was just
    -- reached this raises — and the whole RPC rolls back WITH the order row above
    update discounts
       set used_count = used_count + 1
     where id = v_dis_id
       and (max_uses is null or used_count < max_uses);
    if not found then
      raise exception 'This coupon has just reached its usage limit.';
    end if;
  end if;

  insert into delivery_status_history (order_id, status, note, changed_by)
  values (v_id, 'Received', 'Order placed online.', 'customer');

  return jsonb_build_object(
    'id', v_id,
    'status', 'Received',
    'items', v_lines,
    'subtotal', v_subtotal,
    'discount', v_dis_amount,
    'discountLabel', v_label,
    'pointsDiscount', v_pts_discount,
    'pointsRedeemed', v_redeem,
    'deliveryFee', v_fee,
    'vatAmount', v_vat,
    'total', v_total,
    'paymentMethod', v_payment,
    'estimatedMinutes', v_eta,
    'zone', v_zone.name_en,
    'subZone', v_subname,
    'createdAt', v_created
  );
end;
$$;

grant execute on function public.place_delivery_order(jsonb) to anon, authenticated;
