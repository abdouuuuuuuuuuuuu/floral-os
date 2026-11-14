-- Supplier functions: close a permission gap and add duplicate protection.
--
-- 1. receive_supplier_stock, update_supplier_entry and void_supplier_entry
--    checked `IF v_role <> 'owner'`. For a deactivated account, or one with no
--    profile, v_role is NULL, `NULL <> 'owner'` is NULL (not true), and the
--    check let the call through. They now use IS DISTINCT FROM.
-- 2. pay_supplier checked nobody. It now requires an active owner or manager,
--    the same people the app lets open Suppliers.
-- 3. receive_supplier_stock and pay_supplier add stock/debt/payments on every
--    call, so a retry after a dropped connection recorded them twice. New
--    versions take p_request_id; a repeat returns the first result.
--
-- Bodies below are the definitions taken from the live database on
-- 2026-11-09, changed only where marked "CHANGED". Existing signatures stay,
-- so tills on older app versions keep working. Needs 20261110100000 (the
-- blossom_request_results table). Safe to run more than once. One transaction.

BEGIN;

CREATE TABLE IF NOT EXISTS public.blossom_request_results (
  actor_id    uuid        NOT NULL,
  request_id  uuid        NOT NULL,
  action      text        NOT NULL,
  fingerprint text        NOT NULL,
  result      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, request_id)
);
ALTER TABLE public.blossom_request_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.blossom_request_results FROM PUBLIC, anon, authenticated;

-- ─── receive_supplier_stock (existing signature) ──────────────────────────
CREATE OR REPLACE FUNCTION public.receive_supplier_stock(p_supplier_id integer, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor  uuid := auth.uid();
  v_role   text;
  v_item   jsonb;
  v_tx_ids int[] := '{}';
  v_tx_id  int;
  v_total  int := 0;
  v_before int;
  v_after  int;
begin
  if v_actor is null then
    raise exception 'You must be signed in' using errcode = '28000';
  end if;

  select role into v_role
  from public.profiles where id = v_actor and coalesce(is_active, true);

  -- CHANGED: was `v_role <> 'owner'`, which let NULL (inactive / no profile) through.
  if v_role is distinct from 'owner' then
    raise exception 'Only an owner can receive stock' using errcode = '42501';
  end if;

  -- CHANGED: the supplier must exist and be active.
  if not exists (
    select 1 from public.suppliers s
    where s.supplier_id = p_supplier_id and s.supplier_status <> 'inactive'
  ) then
    raise exception 'That supplier no longer exists or is inactive.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No items to receive';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select stock_level into v_before from public.products
    where product_id = (v_item->>'product_id')::int;

    if not found then
      raise exception 'Product % does not exist', v_item->>'product_id';
    end if;

    -- amount_due omitted — it's generated.
    insert into public.supplier_transactions (
      supplier_id, product_id, quantity, unit_cost, total_cost,
      amount_paid, payment_status, transaction_type,
      notes, transaction_date, created_by
    )
    values (
      p_supplier_id,
      (v_item->>'product_id')::int,
      (v_item->>'quantity')::int,
      (v_item->>'unit_cost')::int,
      (v_item->>'quantity')::int * (v_item->>'unit_cost')::int,
      0, 'unpaid', 'purchase',
      nullif(v_item->>'notes', ''), current_date, v_actor
    )
    returning transaction_id into v_tx_id;

    v_tx_ids := v_tx_ids || v_tx_id;
    v_total := v_total + (v_item->>'quantity')::int * (v_item->>'unit_cost')::int;

    update public.products
    set stock_level = stock_level + (v_item->>'quantity')::int
    where product_id = (v_item->>'product_id')::int
    returning stock_level into v_after;

    insert into public.stock_adjustments (
      product_id, adjustment_type, quantity, reason,
      previous_stock, new_stock, created_by
    )
    values (
      (v_item->>'product_id')::int, 'received', (v_item->>'quantity')::int,
      'Supplier delivery', v_before, v_after, v_actor
    );
  end loop;

  perform public.allocate_supplier_payments(p_supplier_id);

  insert into public.audit_logs (performed_by, action_taken, target_table, new_value)
  values (
    v_actor::text, 'receive_stock', 'supplier_transactions',
    jsonb_build_object(
      'supplier_id', p_supplier_id,
      'transaction_ids', to_jsonb(v_tx_ids),
      'total_cost', v_total
    )
  );

  return jsonb_build_object('transaction_ids', to_jsonb(v_tx_ids), 'total_cost', v_total);
end;
$function$;

-- ─── update_supplier_entry (existing signature) ───────────────────────────
CREATE OR REPLACE FUNCTION public.update_supplier_entry(p_transaction_id integer, p_quantity integer DEFAULT NULL::integer, p_unit_cost integer DEFAULT NULL::integer, p_notes text DEFAULT NULL::text, p_transaction_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor    uuid := auth.uid();
  v_role     text;
  v_tx       public.supplier_transactions;
  v_new_qty  int;
  v_new_cost int;
  v_new_tot  int;
  v_delta    int;
  v_before   int;
  v_after    int;
begin
  if v_actor is null then
    raise exception 'You must be signed in' using errcode = '28000';
  end if;

  select role into v_role
  from public.profiles where id = v_actor and coalesce(is_active, true);

  -- CHANGED: was `v_role <> 'owner'`, which let NULL (inactive / no profile) through.
  if v_role is distinct from 'owner' then
    raise exception 'Only an owner can edit a supplier entry' using errcode = '42501';
  end if;

  select * into v_tx from public.supplier_transactions
  where transaction_id = p_transaction_id for update;

  if not found then
    raise exception 'That entry no longer exists';
  end if;

  if v_tx.transaction_type <> 'purchase' then
    raise exception 'Only purchase entries can be edited';
  end if;

  if v_tx.voided_at is not null then
    raise exception 'That entry has been voided';
  end if;

  v_new_qty  := coalesce(p_quantity, v_tx.quantity);
  v_new_cost := coalesce(p_unit_cost, v_tx.unit_cost);

  if v_new_qty <= 0 then
    raise exception 'Quantity must be greater than zero. Void the entry instead.';
  end if;
  if v_new_cost < 0 then
    raise exception 'Unit cost cannot be negative';
  end if;

  v_new_tot := v_new_qty * v_new_cost;
  v_delta   := v_new_qty - coalesce(v_tx.quantity, 0);

  -- ── Stock by difference ─────────────────────────────────────
  if v_delta <> 0 and v_tx.product_id is not null then
    select stock_level into v_before from public.products
    where product_id = v_tx.product_id;

    if found then
      update public.products
      set stock_level = stock_level + v_delta
      where product_id = v_tx.product_id
      returning stock_level into v_after;

      insert into public.stock_adjustments (
        product_id, adjustment_type, quantity, reason,
        previous_stock, new_stock, created_by
      )
      values (
        v_tx.product_id,
        case when v_delta > 0 then 'received' else 'deduct' end,
        abs(v_delta),
        'Corrected supplier entry #' || p_transaction_id,
        v_before, v_after, v_actor
      );
    end if;
  end if;

  update public.supplier_transactions
  set quantity         = v_new_qty,
      unit_cost        = v_new_cost,
      total_cost       = v_new_tot,
      notes            = coalesce(p_notes, notes),
      transaction_date = coalesce(p_transaction_date, transaction_date)
  where transaction_id = p_transaction_id;

  -- Payments spread again — the amount owed just changed.
  perform public.allocate_supplier_payments(v_tx.supplier_id);

  insert into public.audit_logs (performed_by, action_taken, target_table, old_value, new_value)
  values (
    v_actor::text, 'update_supplier_entry', 'supplier_transactions',
    to_jsonb(v_tx),
    jsonb_build_object(
      'transaction_id', p_transaction_id,
      'quantity', v_new_qty,
      'unit_cost', v_new_cost,
      'total_cost', v_new_tot,
      'stock_delta', v_delta
    )
  );

  return jsonb_build_object(
    'transaction_id', p_transaction_id,
    'total_cost', v_new_tot,
    'stock_delta', v_delta
  );
end;
$function$;

-- ─── void_supplier_entry (existing signature) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.void_supplier_entry(p_transaction_id integer, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor  uuid := auth.uid();
  v_role   text;
  v_tx     public.supplier_transactions;
  v_before int;
  v_after  int;
begin
  if v_actor is null then
    raise exception 'You must be signed in' using errcode = '28000';
  end if;

  select role into v_role
  from public.profiles where id = v_actor and coalesce(is_active, true);

  -- CHANGED: was `v_role <> 'owner'`, which let NULL (inactive / no profile) through.
  if v_role is distinct from 'owner' then
    raise exception 'Only an owner can void a supplier entry' using errcode = '42501';
  end if;

  select * into v_tx from public.supplier_transactions
  where transaction_id = p_transaction_id for update;

  if not found then
    raise exception 'That entry no longer exists';
  end if;

  if v_tx.voided_at is not null then
    raise exception 'That entry is already voided';
  end if;

  if v_tx.transaction_type = 'purchase' and v_tx.product_id is not null then
    select stock_level into v_before from public.products
    where product_id = v_tx.product_id;

    if found then
      update public.products
      set stock_level = stock_level - coalesce(v_tx.quantity, 0)
      where product_id = v_tx.product_id
      returning stock_level into v_after;

      insert into public.stock_adjustments (
        product_id, adjustment_type, quantity, reason,
        previous_stock, new_stock, created_by
      )
      values (
        v_tx.product_id, 'deduct', coalesce(v_tx.quantity, 0),
        'Voided supplier entry #' || p_transaction_id,
        v_before, v_after, v_actor
      );
    end if;
  end if;

  -- total_cost and amount_paid to zero; amount_due follows on its own
  -- (0 - 0 = 0).
  update public.supplier_transactions
  set total_cost     = 0,
      amount_paid    = 0,
      payment_status = 'voided',
      voided_at      = now(),
      voided_by      = v_actor,
      void_reason    = nullif(p_reason, '')
  where transaction_id = p_transaction_id;

  perform public.allocate_supplier_payments(v_tx.supplier_id);

  insert into public.audit_logs (performed_by, action_taken, target_table, old_value, new_value)
  values (
    v_actor::text, 'void_supplier_entry', 'supplier_transactions',
    to_jsonb(v_tx),
    jsonb_build_object('transaction_id', p_transaction_id, 'reason', p_reason)
  );

  return jsonb_build_object(
    'transaction_id', p_transaction_id,
    'stock_removed', coalesce(v_tx.quantity, 0)
  );
end;
$function$;

-- ─── pay_supplier (existing signature) ────────────────────────────────────
-- Still SECURITY INVOKER as before, so table rules (RLS) still apply too.
CREATE OR REPLACE FUNCTION public.pay_supplier(p_supplier_id integer, p_amount numeric, p_notes text, p_method text DEFAULT 'cash'::text, p_transaction_id integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_payment_id integer;
  v_supplier_id integer;
  v_amount integer;
  v_method text;
  v_remaining integer;
  v_tx record;
  v_role text;
begin
  -- CHANGED: only an active owner or manager may record supplier payments.
  if auth.uid() is null then
    raise exception 'You must be signed in' using errcode = '28000';
  end if;
  select role into v_role
  from public.profiles where id = auth.uid() and coalesce(is_active, true);
  if v_role is null or v_role not in ('owner', 'manager') then
    raise exception 'Only an owner or manager can record supplier payments' using errcode = '42501';
  end if;

  v_amount := round(p_amount)::integer;
  v_method := coalesce(nullif(trim(p_method), ''), 'cash');

  if v_amount is null or v_amount <= 0 then
    raise exception 'Enter an amount greater than zero.';
  end if;

  -- For a general payment, p_supplier_id is supplied.
  -- For a payment against one purchase, derive the supplier from the purchase.
  v_supplier_id := coalesce(
    p_supplier_id,
    (
      select st.supplier_id
      from public.supplier_transactions st
      where st.transaction_id = p_transaction_id
        and st.transaction_type = 'purchase'
        and st.voided_at is null
    )
  );

  if v_supplier_id is null then
    raise exception 'A valid supplier is required for the payment.';
  end if;

  if not exists (
    select 1
    from public.suppliers s
    where s.supplier_id = v_supplier_id
      and s.supplier_status <> 'inactive'
  ) then
    raise exception 'That supplier no longer exists or is inactive.';
  end if;

  -- The official payment record. Both method columns are populated because
  -- the current table contains both payment_method and legacy method.
  insert into public.supplier_payments (
    supplier_id,
    amount,
    payment_method,
    method,
    notes,
    transaction_id,
    created_at
  )
  values (
    v_supplier_id,
    v_amount,
    v_method,
    v_method,
    coalesce(p_notes, ''),
    p_transaction_id,
    now()
  )
  returning payment_id into v_payment_id;

  -- If the payment is for one specific purchase, update that purchase only.
  if p_transaction_id is not null then
    update public.supplier_transactions st
    set
      amount_paid = least(coalesce(st.amount_paid, 0) + v_amount, st.total_cost),
      payment_status = case
        when coalesce(st.amount_paid, 0) + v_amount >= st.total_cost then 'paid'
        when coalesce(st.amount_paid, 0) + v_amount > 0 then 'partial'
        else 'unpaid'
      end
    where st.transaction_id = p_transaction_id
      and st.supplier_id = v_supplier_id
      and st.transaction_type = 'purchase'
      and st.voided_at is null;

    if not found then
      raise exception 'That purchase entry does not exist or is voided.';
    end if;

  -- General supplier payment: apply it FIFO to unpaid purchase rows.
  -- This keeps the existing purchase-level status display useful, while the
  -- supplier_balances view remains based on supplier_payments only.
  else
    v_remaining := v_amount;

    for v_tx in
      select
        st.transaction_id,
        st.total_cost,
        coalesce(st.amount_paid, 0) as amount_paid
      from public.supplier_transactions st
      where st.supplier_id = v_supplier_id
        and st.transaction_type = 'purchase'
        and st.voided_at is null
        and coalesce(st.amount_paid, 0) < st.total_cost
      order by coalesce(st.received_at, st.created_at at time zone 'UTC'), st.transaction_id
      for update
    loop
      exit when v_remaining <= 0;

      update public.supplier_transactions st
      set
        amount_paid = least(v_tx.amount_paid + v_remaining, st.total_cost),
        payment_status = case
          when v_tx.amount_paid + v_remaining >= st.total_cost then 'paid'
          else 'partial'
        end
      where st.transaction_id = v_tx.transaction_id;

      v_remaining := v_remaining - least(
        v_remaining,
        v_tx.total_cost - v_tx.amount_paid
      );
    end loop;
  end if;

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'supplier_id', v_supplier_id,
    'amount', v_amount,
    'method', v_method,
    'cash_register_updated', false,
    'coffre_forte_updated', false
  );
end;
$function$;

-- ─── NEW: receive_supplier_stock with a request id ────────────────────────
CREATE OR REPLACE FUNCTION public.receive_supplier_stock(p_supplier_id integer, p_items jsonb, p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_fingerprint text;
  v_saved public.blossom_request_results%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'You must be signed in' USING ERRCODE = '28000'; END IF;
  IF p_request_id IS NULL THEN RETURN public.receive_supplier_stock(p_supplier_id, p_items); END IF;

  v_fingerprint := md5(concat_ws('|', 'receive_supplier_stock', p_supplier_id, coalesce(p_items::text, '')));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text || '|' || p_request_id::text, 0));

  SELECT * INTO v_saved FROM public.blossom_request_results
  WHERE actor_id = v_actor AND request_id = p_request_id;
  IF FOUND THEN
    IF v_saved.fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'request id was already used for a different action';
    END IF;
    RETURN v_saved.result;
  END IF;

  v_result := public.receive_supplier_stock(p_supplier_id, p_items);

  INSERT INTO public.blossom_request_results (actor_id, request_id, action, fingerprint, result)
  VALUES (v_actor, p_request_id, 'receive_supplier_stock', v_fingerprint, v_result);
  RETURN v_result;
END;
$$;

-- ─── NEW: pay_supplier with a request id ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.pay_supplier(p_supplier_id integer, p_amount numeric, p_notes text, p_method text, p_transaction_id integer, p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_fingerprint text;
  v_saved public.blossom_request_results%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'You must be signed in' USING ERRCODE = '28000'; END IF;
  IF p_request_id IS NULL THEN
    RETURN public.pay_supplier(p_supplier_id, p_amount, p_notes, coalesce(p_method, 'cash'), p_transaction_id);
  END IF;

  v_fingerprint := md5(concat_ws('|', 'pay_supplier', p_supplier_id, p_amount, coalesce(p_notes, ''), coalesce(p_method, 'cash'), p_transaction_id));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text || '|' || p_request_id::text, 0));

  SELECT * INTO v_saved FROM public.blossom_request_results
  WHERE actor_id = v_actor AND request_id = p_request_id;
  IF FOUND THEN
    IF v_saved.fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'request id was already used for a different action';
    END IF;
    RETURN v_saved.result;
  END IF;

  -- The existing function checks the caller's role itself.
  v_result := public.pay_supplier(p_supplier_id, p_amount, p_notes, coalesce(p_method, 'cash'), p_transaction_id);

  INSERT INTO public.blossom_request_results (actor_id, request_id, action, fingerprint, result)
  VALUES (v_actor, p_request_id, 'pay_supplier', v_fingerprint, v_result);
  RETURN v_result;
END;
$$;

-- ─── Who may call them: signed-in users only (each checks the role) ───────
REVOKE ALL ON FUNCTION public.receive_supplier_stock(integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.receive_supplier_stock(integer, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_supplier_entry(integer, integer, integer, text, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_supplier_entry(integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pay_supplier(integer, numeric, text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pay_supplier(integer, numeric, text, text, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_supplier_stock(integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_supplier_stock(integer, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_supplier_entry(integer, integer, integer, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_supplier_entry(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_supplier(integer, numeric, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_supplier(integer, numeric, text, text, integer, uuid) TO authenticated;

COMMIT;

-- Check: expect 6 rows, all with anon_can_call = false, and the role checks in place.
SELECT p.oid::regprocedure AS function,
       p.prosecdef AS security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_call,
       pg_get_functiondef(p.oid) LIKE '%is distinct from ''owner''%'
         OR pg_get_functiondef(p.oid) LIKE '%not in (''owner'', ''manager'')%'
         OR pg_get_functiondef(p.oid) LIKE '%p_request_id%' AS protected
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('receive_supplier_stock', 'pay_supplier', 'update_supplier_entry', 'void_supplier_entry')
ORDER BY 1;
