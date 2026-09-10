-- Secure guest delivery tracking for anonymous customers.
-- Store only a SHA-256 hash of a random 256-bit bearer token.

create extension if not exists pgcrypto;

alter table public.delivery_orders add column if not exists tracking_token_hash text;
create unique index if not exists delivery_orders_tracking_token_hash_uidx
  on public.delivery_orders(tracking_token_hash)
  where tracking_token_hash is not null;

create or replace function public.get_guest_order(p_order_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_hash text; v_order jsonb;
begin
  if p_order_id is null or coalesce(length(trim(p_token)),0) < 24 then
    raise exception 'Invalid tracking credentials.' using errcode='42501';
  end if;
  v_hash := encode(extensions.digest(trim(p_token), 'sha256'), 'hex');
  select jsonb_build_object(
    'id',o.id,'customer_name',o.customer_name,'customer_phone',o.customer_phone,
    'address',o.address,'address_detail',o.address_detail,'maps_link',o.maps_link,
    'notes',o.notes,'payment_method',o.payment_method,'items',o.items,
    'subtotal',o.subtotal,'delivery_fee',o.delivery_fee,'vat_amount',o.vat_amount,'total',o.total,
    'status',o.status,'driver_id',o.driver_id,'estimated_minutes',o.estimated_minutes,
    'delivery_note',o.delivery_note,'zone_id',o.zone_id,'subzone_id',o.subzone_id,
    'temp_driver_name',o.temp_driver_name,'temp_driver_phone',o.temp_driver_phone,
    'discount_amount',o.discount_amount,'discount_label',o.discount_label,'coupon_code',o.coupon_code,
    'loyalty_redeemed',o.loyalty_redeemed,'loyalty_earned',o.loyalty_earned,
    'created_at',o.created_at,'updated_at',o.updated_at,
    'delivery_zones',case when z.id is null then null else jsonb_build_object('name_en',z.name_en,'name_ar',z.name_ar) end,
    'delivery_subzones',case when sz.id is null then null else jsonb_build_object('name_en',sz.name_en,'name_ar',sz.name_ar) end,
    'drivers',case when d.id is null then null else jsonb_build_object('name',d.name,'phone',d.phone) end
  ) into v_order
  from public.delivery_orders o
  left join public.delivery_zones z on z.id=o.zone_id
  left join public.delivery_subzones sz on sz.id=o.subzone_id
  left join public.drivers d on d.id=o.driver_id
  where o.id=p_order_id and o.tracking_token_hash=v_hash;
  if v_order is null then raise exception 'Order not found or tracking link is invalid.'; end if;
  return v_order;
end;
$$;

create or replace function public.get_guest_order_history(p_order_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_hash text; v_rows jsonb;
begin
  if p_order_id is null or coalesce(length(trim(p_token)),0) < 24 then raise exception 'Invalid tracking credentials.' using errcode='42501'; end if;
  v_hash := encode(extensions.digest(trim(p_token), 'sha256'), 'hex');
  if not exists(select 1 from public.delivery_orders where id=p_order_id and tracking_token_hash=v_hash) then
    raise exception 'Order not found or tracking link is invalid.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('status',h.status,'note',h.note,'created_at',h.created_at) order by h.created_at,h.id),'[]'::jsonb)
    into v_rows
    from public.delivery_status_history h where h.order_id=p_order_id;
  return v_rows;
end;
$$;

create or replace function public.cancel_guest_order(p_order_id uuid, p_token text)
returns json language plpgsql security definer set search_path=''
as $$
declare v_hash text;
begin
  if p_order_id is null or coalesce(length(trim(p_token)),0) < 24 then raise exception 'Invalid tracking credentials.' using errcode='42501'; end if;
  v_hash := encode(extensions.digest(trim(p_token), 'sha256'), 'hex');
  if not exists(select 1 from public.delivery_orders where id=p_order_id and tracking_token_hash=v_hash) then
    raise exception 'Order not found or tracking link is invalid.';
  end if;
  return public.cancel_delivery_order_legacy(p_order_id);
end;
$$;

create or replace function public.edit_guest_order(p_order_id uuid,p_token text,p_items jsonb)
returns json language plpgsql security definer set search_path=''
as $$
declare v_hash text;
begin
  if p_order_id is null or coalesce(length(trim(p_token)),0) < 24 then raise exception 'Invalid tracking credentials.' using errcode='42501'; end if;
  v_hash := encode(extensions.digest(trim(p_token), 'sha256'), 'hex');
  if not exists(select 1 from public.delivery_orders where id=p_order_id and tracking_token_hash=v_hash) then
    raise exception 'Order not found or tracking link is invalid.';
  end if;
  return public.edit_delivery_order_legacy(p_order_id,p_items);
end;
$$;

-- Preserve the existing pricing/validation implementation and wrap it with
-- token creation. The raw token is returned only once to the browser.
alter function public.place_delivery_order(jsonb) rename to place_delivery_order_legacy;
create or replace function public.place_delivery_order(p jsonb)
returns json language plpgsql security definer set search_path=''
as $$
declare v_result json; v_token text; v_id uuid; v_hash text;
begin
  v_result := public.place_delivery_order_legacy(p);
  v_id := (v_result->>'id')::uuid;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  update public.delivery_orders set tracking_token_hash=v_hash where id=v_id;
  return v_result::jsonb || jsonb_build_object('trackingToken',v_token);
end;
$$;

revoke execute on function public.place_delivery_order_legacy(jsonb) from public, anon, authenticated;
revoke execute on function public.place_delivery_order(jsonb) from public, anon, authenticated;
grant execute on function public.place_delivery_order(jsonb) to anon, authenticated;

-- notification_subscriptions has no user_id column in the current schema.
create or replace function public.register_push_subscription(p jsonb)
returns json language plpgsql security definer set search_path=''
as $$
declare v_id bigint; v_role text:=p->>'role'; v_order uuid:=nullif(p->>'order_id','')::uuid; v_token text:=trim(coalesce(p->>'trackingToken','')); v_hash text; v_user uuid:=(select auth.uid());
begin
 if coalesce(p->>'endpoint','')='' or coalesce(p->>'p256dh','')='' or coalesce(p->>'auth','')='' then raise exception 'Invalid push subscription.'; end if;
 if v_role not in ('waiter','customer') then raise exception 'Invalid push role.'; end if;
 if v_role='waiter' then
   if not exists(select 1 from public.staff_profiles where user_id=v_user and active=true and role in ('admin'::public.staff_role,'waiter'::public.staff_role)) then raise exception 'Not authorized.' using errcode='42501'; end if;
 elsif v_user is null then
   if v_order is null or length(v_token)<24 then raise exception 'Order tracking authorization required.' using errcode='42501'; end if;
   v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
   if not exists(select 1 from public.delivery_orders where id=v_order and tracking_token_hash=v_hash) then raise exception 'Invalid order tracking authorization.' using errcode='42501'; end if;
 elsif v_order is not null then
   if not exists(select 1 from public.delivery_orders where id=v_order and user_id=v_user) then raise exception 'Not authorized for this order.' using errcode='42501'; end if;
 end if;
 insert into public.notification_subscriptions(endpoint,p256dh,auth,role,order_id,updated_at)
 values(p->>'endpoint',p->>'p256dh',p->>'auth',v_role,v_order,now())
 on conflict(endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth,role=excluded.role,order_id=excluded.order_id,updated_at=now()
 returning id into v_id;
 return json_build_object('id',v_id);
end;
$$;

revoke execute on function public.get_guest_order(uuid,text) from public,authenticated,anon;
grant execute on function public.get_guest_order(uuid,text) to anon,authenticated;
revoke execute on function public.get_guest_order_history(uuid,text) from public,authenticated,anon;
grant execute on function public.get_guest_order_history(uuid,text) to anon,authenticated;
revoke execute on function public.cancel_guest_order(uuid,text) from public,authenticated,anon;
grant execute on function public.cancel_guest_order(uuid,text) to anon,authenticated;
revoke execute on function public.edit_guest_order(uuid,text,jsonb) from public,authenticated,anon;
grant execute on function public.edit_guest_order(uuid,text,jsonb) to anon,authenticated;
revoke execute on function public.register_push_subscription(jsonb) from public,authenticated,anon;
grant execute on function public.register_push_subscription(jsonb) to anon,authenticated;

revoke select on public.delivery_orders from anon;