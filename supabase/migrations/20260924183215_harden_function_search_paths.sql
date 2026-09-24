-- Security hardening: pin function search_path so runtime name resolution is deterministic.
-- Safe behavior-only hardening; function bodies are unchanged.
alter function public._delivery_is_open_now(jsonb)
  set search_path = public, pg_temp;

alter function public._discount_value(public.discounts, jsonb, numeric)
  set search_path = public, pg_temp;

alter function public.set_updated_at()
  set search_path = public, pg_temp;
