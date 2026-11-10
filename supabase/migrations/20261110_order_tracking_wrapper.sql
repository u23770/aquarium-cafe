-- Restore secure guest tracking and authoritative order availability
-- without replacing the current discount/pricing implementation.
--
-- The current place_delivery_order body contains the latest discount engine.
-- Keep it intact as a private core, then wrap it to enforce availability and
-- issue a one-time random bearer token for guest tracking.

do $$
begin
  if to_regprocedure('public.place_delivery_order(jsonb)') is null then
    raise exception 'Expected public.place_delivery_order(jsonb) to exist';
  end if;
  if to_regprocedure('public._delivery_is_open_now(jsonb)') is null then
    raise exception 'Expected public._delivery_is_open_now(jsonb) to exist';
  end if;
end;
$$;

alter function public.place_delivery_order(jsonb)
  rename to place_delivery_order_discount_core_20261110;

create function public.place_delivery_order(p jsonb)
returns json
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_cfg jsonb;
  v_result json;
  v_order_id uuid;
  v_token text;
  v_hash text;
begin
  select ds.value
    into v_cfg
    from public.delivery_settings ds
   where ds.key = 'config';

  if coalesce((v_cfg ->> 'manual_pause')::boolean, false) then
    raise exception 'MANUAL_PAUSED';
  end if;

  if coalesce((v_cfg ->> 'schedule_enabled')::boolean, false)
     and not public._delivery_is_open_now(v_cfg -> 'opening_hours') then
    raise exception 'RESTAURANT_CLOSED';
  end if;

  -- All pricing, VAT, zones, coupons, automatic discounts, loyalty,
  -- and order-history writes remain in the existing production function.
  v_result := public.place_delivery_order_discount_core_20261110(p);
  v_order_id := (v_result::jsonb ->> 'id')::uuid;

  if v_order_id is null then
    raise exception 'Order creation did not return an order id.';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  update public.delivery_orders
     set tracking_token_hash = v_hash
   where id = v_order_id;

  return (v_result::jsonb || jsonb_build_object('trackingToken', v_token))::json;
end;
$function$;

revoke all on function public.place_delivery_order_discount_core_20261110(jsonb)
  from public, anon, authenticated;
revoke all on function public.place_delivery_order(jsonb)
  from public, anon, authenticated;
grant execute on function public.place_delivery_order(jsonb)
  to anon, authenticated;
