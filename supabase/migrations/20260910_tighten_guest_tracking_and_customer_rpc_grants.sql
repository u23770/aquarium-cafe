-- Aquarium Cafe & Restaurant — guest tracking and customer RPC grant tightening
-- 2026-09-10
--
-- Keeps customer mutation RPCs authenticated-only. Guest customers use
-- token-authorized guest wrappers. Also minimizes the fields exposed by the
-- guest tracking endpoint so a tracking capability does not reveal the full
-- delivery record.

revoke execute on function public.cancel_delivery_order(uuid) from public, anon;
grant execute on function public.cancel_delivery_order(uuid) to authenticated;
revoke execute on function public.edit_delivery_order(uuid, jsonb) from public, anon;
grant execute on function public.edit_delivery_order(uuid, jsonb) to authenticated;

create or replace function public.get_guest_order(p_order_id uuid, p_token text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_hash text;
  v_order jsonb;
begin
  if p_order_id is null or coalesce(length(trim(p_token)),0) < 24 then
    raise exception 'Invalid tracking credentials.' using errcode='42501';
  end if;
  v_hash := encode(extensions.digest(trim(p_token), 'sha256'), 'hex');
  select jsonb_build_object(
    'id',o.id,
    'items',o.items,
    'subtotal',o.subtotal,
    'delivery_fee',o.delivery_fee,
    'vat_amount',o.vat_amount,
    'total',o.total,
    'status',o.status,
    'estimated_minutes',o.estimated_minutes,
    'delivery_note',o.delivery_note,
    'zone_id',o.zone_id,
    'subzone_id',o.subzone_id,
    'temp_driver_name',o.temp_driver_name,
    'temp_driver_phone',o.temp_driver_phone,
    'discount_amount',o.discount_amount,
    'discount_label',o.discount_label,
    'loyalty_redeemed',o.loyalty_redeemed,
    'loyalty_earned',o.loyalty_earned,
    'created_at',o.created_at,
    'updated_at',o.updated_at,
    'delivery_zones',case when z.id is null then null else jsonb_build_object('name_en',z.name_en,'name_ar',z.name_ar) end,
    'delivery_subzones',case when sz.id is null then null else jsonb_build_object('name_en',sz.name_en,'name_ar',sz.name_ar) end,
    'drivers',case when d.id is null then null else jsonb_build_object('name',d.name,'phone',d.phone) end
  ) into v_order
  from public.delivery_orders o
  left join public.delivery_zones z on z.id=o.zone_id
  left join public.delivery_subzones sz on sz.id=o.subzone_id
  left join public.drivers d on d.id=o.driver_id
  where o.id=p_order_id and o.tracking_token_hash=v_hash;
  if v_order is null then
    raise exception 'Order not found or tracking link is invalid.';
  end if;
  return v_order;
end;
$$;
revoke execute on function public.get_guest_order(uuid,text) from public, authenticated, anon;
grant execute on function public.get_guest_order(uuid,text) to anon, authenticated;
