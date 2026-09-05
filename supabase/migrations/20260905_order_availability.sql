-- ============================================================
--  Order availability + opening hours (manual pause + schedule)
--  ------------------------------------------------------------
--  Non-destructive, incremental, backward-compatible.
--  · Extends the existing delivery_settings JSONB config with:
--      manual_pause     boolean  (default false)
--      schedule_enabled boolean  (default false)
--      opening_hours    jsonb    (per-weekday enabled/open/close)
--    All existing keys (enabled, fee, free_above, min_order,
--    estimated_minutes, payment_methods, note) are preserved —
--    we merge with `||`, we never replace the whole JSON value.
--  · Adds public._delivery_is_open_now(jsonb) — a small, stable
--    helper that evaluates the Cairo-local opening-hours schedule,
--    correctly handling overnight shifts (e.g. 08:00 -> 02:00).
--  · CREATE OR REPLACE public.place_delivery_order(jsonb) — the
--    exact original signature/body, with two new authoritative
--    checks (manual pause, then schedule) inserted right after
--    the existing "is delivery enabled" check. Everything else
--    (pricing, zones, VAT, discounts, loyalty, validation,
--    notifications) is byte-for-byte unchanged.
--  Safe defaults (manual_pause=false, schedule_enabled=false)
--  mean deploying this migration does NOT change current
--  ordering behavior until the owner opts in from the admin UI.
-- ============================================================

-- 1) Extend delivery_settings config with the new keys (merge only, non-destructive)
update delivery_settings
set value = value || jsonb_build_object(
  'manual_pause',     coalesce(value -> 'manual_pause', 'false'::jsonb),
  'schedule_enabled', coalesce(value -> 'schedule_enabled', 'false'::jsonb),
  'opening_hours',    coalesce(value -> 'opening_hours', '{"sun":{"enabled":true,"open":"08:00","close":"02:00"},"mon":{"enabled":true,"open":"08:00","close":"02:00"},"tue":{"enabled":true,"open":"08:00","close":"02:00"},"wed":{"enabled":true,"open":"08:00","close":"02:00"},"thu":{"enabled":true,"open":"08:00","close":"02:00"},"fri":{"enabled":true,"open":"08:00","close":"02:00"},"sat":{"enabled":true,"open":"08:00","close":"02:00"}}'::jsonb)
)
where key = 'config';

-- 2) Opening-hours evaluator — Africa/Cairo local time, overnight-safe.
--    p_hours shape: {"sun":{"enabled":bool,"open":"HH:MM","close":"HH:MM"}, "mon": {...}, ...}
create or replace function public._delivery_is_open_now(p_hours jsonb)
returns boolean
language plpgsql
stable
as $$
declare
  v_days text[] := array['sun','mon','tue','wed','thu','fri','sat'];
  v_now timestamp := (now() at time zone 'Africa/Cairo');
  v_dow int := extract(dow from v_now)::int;          -- 0 = Sunday
  v_time time := v_now::time;
  v_today text := v_days[v_dow + 1];
  v_yesterday text := v_days[((v_dow + 6) % 7) + 1];
  v_today_cfg jsonb;
  v_yday_cfg jsonb;
  v_open time;
  v_close time;
begin
  if p_hours is null or jsonb_typeof(p_hours) <> 'object' then
    return false; -- schedule_enabled=true but misconfigured -> fail closed, not open
  end if;

  -- yesterday's overnight shift may still be running into today
  v_yday_cfg := p_hours -> v_yesterday;
  if v_yday_cfg is not null and coalesce((v_yday_cfg ->> 'enabled')::boolean, false) then
    v_open  := nullif(v_yday_cfg ->> 'open', '')::time;
    v_close := nullif(v_yday_cfg ->> 'close', '')::time;
    if v_open is not null and v_close is not null and v_close <= v_open then
      if v_time < v_close then
        return true;
      end if;
    end if;
  end if;

  -- today's own configured shift
  v_today_cfg := p_hours -> v_today;
  if v_today_cfg is not null and coalesce((v_today_cfg ->> 'enabled')::boolean, false) then
    v_open  := nullif(v_today_cfg ->> 'open', '')::time;
    v_close := nullif(v_today_cfg ->> 'close', '')::time;
    if v_open is not null and v_close is not null then
      if v_close > v_open then
        if v_time >= v_open and v_time < v_close then
          return true;
        end if;
      else
        -- overnight shift starting today (close <= open)
        if v_time >= v_open then
          return true;
        end if;
      end if;
    end if;
  end if;

  return false;
end;
$$;

-- 3) place_delivery_order() — exact existing signature & behavior,
--    plus the two new authoritative availability checks.
CREATE OR REPLACE FUNCTION public.place_delivery_order(p jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

-- ═══ order availability: manual pause + opening hours (Cairo time) ═══
if coalesce((v_cfg ->> 'manual_pause')::boolean, false) then
raise exception 'MANUAL_PAUSED';
end if;

if coalesce((v_cfg ->> 'schedule_enabled')::boolean, false) then
if not public._delivery_is_open_now(v_cfg -> 'opening_hours') then
raise exception 'RESTAURANT_CLOSED';
end if;
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
$function$

