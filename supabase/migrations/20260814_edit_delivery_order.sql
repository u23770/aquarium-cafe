-- Customer order editing: full item list before preparation.
-- Customer can add/remove/change items; server reprices from current menu data.
-- Pricing, delivery fee and VAT are recalculated server-side.
create or replace function public.edit_delivery_order(p_order_id uuid, p_items jsonb)
returns json language plpgsql security definer set search_path=public as $$
declare
  v_order delivery_orders%rowtype; v_priced jsonb; v_lines jsonb; v_subtotal numeric(10,2);
  v_fee numeric(10,2); v_free numeric(10,2):=0; v_min numeric(10,2):=0; v_cfg jsonb;
  v_zone record; v_subzone record; v_vat numeric(10,2); v_total numeric(10,2);
begin
  select * into v_order from delivery_orders where id=p_order_id for update;
  if not found then raise exception 'Delivery order not found.'; end if;
  if v_order.status not in ('Received','Accepted') then raise exception 'This order can only be edited before preparation.'; end if;
  if v_order.discount_amount>0 or v_order.loyalty_redeemed>0 then
    raise exception 'This order contains a discount or loyalty redemption and cannot be edited safely.';
  end if;
  v_priced:=public._price_cart(p_items); v_lines:=v_priced->'lines'; v_subtotal:=(v_priced->>'subtotal')::numeric;
  select value into v_cfg from delivery_settings where key='config';
  v_free:=coalesce((v_cfg->>'free_above')::numeric,0); v_min:=coalesce((v_cfg->>'min_order')::numeric,0);
  if v_min>0 and v_subtotal<v_min then raise exception 'Minimum order for delivery is % EGP — your subtotal is % EGP.',v_min,v_subtotal; end if;
  select * into v_zone from delivery_zones where id=v_order.zone_id and active=true;
  if not found then raise exception 'The delivery zone is no longer available.'; end if;
  v_fee:=v_zone.fee; if v_zone.free_above>0 then v_free:=v_zone.free_above; end if;
  if v_order.subzone_id is not null then
    select * into v_subzone from delivery_subzones where id=v_order.subzone_id and zone_id=v_order.zone_id and active=true;
    if not found then raise exception 'The selected delivery sub-zone is no longer available.'; end if;
    v_fee:=v_subzone.delivery_fee;
  end if;
  if v_free>0 and v_subtotal>=v_free then v_fee:=0; end if;
  v_vat:=round(v_subtotal*0.14,2); v_total:=round(v_subtotal+v_fee+v_vat,2);
  update delivery_orders set items=v_lines,subtotal=v_subtotal,delivery_fee=v_fee,vat_amount=v_vat,total=v_total,updated_at=now()
    where id=p_order_id and status in ('Received','Accepted');
  if not found then raise exception 'This order changed status — refresh and try again.'; end if;
  insert into delivery_status_history(order_id,status,note,changed_by) values(p_order_id,v_order.status,'Customer edited order quantities.','customer');
  return jsonb_build_object('id',p_order_id,'status',v_order.status,'items',v_lines,'subtotal',v_subtotal,'deliveryFee',v_fee,'vatAmount',v_vat,'total',v_total);
end; $$;
revoke all on function public.edit_delivery_order(uuid,jsonb) from public;
grant execute on function public.edit_delivery_order(uuid,jsonb) to anon,authenticated;


-- Cancel the whole delivery order before preparation.
create or replace function public.cancel_delivery_order(p_order_id uuid)
returns json language plpgsql security definer set search_path=public as $$
declare v_order delivery_orders%rowtype;
begin
  select * into v_order from delivery_orders where id=p_order_id for update;
  if not found then raise exception 'Delivery order not found.'; end if;
  if v_order.status not in ('Received','Accepted') then raise exception 'This order can no longer be cancelled.'; end if;
  update delivery_orders set status='Cancelled', updated_at=now() where id=p_order_id and status in ('Received','Accepted');
  if not found then raise exception 'This order changed status — refresh and try again.'; end if;
  insert into delivery_status_history(order_id,status,note,changed_by) values(p_order_id,'Cancelled','Customer cancelled the order.','customer');
  return jsonb_build_object('id',p_order_id,'status','Cancelled');
end; $$;
revoke all on function public.cancel_delivery_order(uuid) from public;
grant execute on function public.cancel_delivery_order(uuid) to anon,authenticated;
