-- Physical loyalty cards linked to customer profiles.
--
-- Reconstructed on 2026-10-30 from the live schema: the original file in this
-- repository had been truncated to a single byte. Every statement is
-- idempotent so it is safe to run against the live project, where these
-- objects already exist.
--
-- Managers print unassigned cards; front-counter staff link a blank card to a
-- customer once. A card cannot be moved to another customer by clients.

CREATE TABLE IF NOT EXISTS public.customer_loyalty_cards (
  code text PRIMARY KEY,
  customer_id integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  assigned_at timestamptz
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_loyalty_cards_code_check') THEN
    ALTER TABLE public.customer_loyalty_cards ADD CONSTRAINT customer_loyalty_cards_code_check
      CHECK (code ~ '^[A-Z]{1,3}-[A-F0-9]{12}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_loyalty_cards_customer_unique') THEN
    ALTER TABLE public.customer_loyalty_cards ADD CONSTRAINT customer_loyalty_cards_customer_unique UNIQUE (customer_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_loyalty_cards_customer_id_fkey') THEN
    ALTER TABLE public.customer_loyalty_cards ADD CONSTRAINT customer_loyalty_cards_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES public.customers(customer_id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_loyalty_cards_created_by_fkey') THEN
    ALTER TABLE public.customer_loyalty_cards ADD CONSTRAINT customer_loyalty_cards_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS customer_loyalty_cards_customer_idx
  ON public.customer_loyalty_cards (customer_id) WHERE customer_id IS NOT NULL;

ALTER TABLE public.customer_loyalty_cards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_loyalty_cards FROM PUBLIC, anon;
REVOKE DELETE ON TABLE public.customer_loyalty_cards FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.customer_loyalty_cards TO authenticated;

DROP POLICY IF EXISTS customer_loyalty_cards_staff_select ON public.customer_loyalty_cards;
CREATE POLICY customer_loyalty_cards_staff_select
  ON public.customer_loyalty_cards
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND coalesce(p.is_active, false)
      AND p.role = ANY (ARRAY['owner', 'manager', 'florist', 'cashier']::text[])
  ));

DROP POLICY IF EXISTS customer_loyalty_cards_manager_insert ON public.customer_loyalty_cards;
CREATE POLICY customer_loyalty_cards_manager_insert
  ON public.customer_loyalty_cards
  FOR INSERT TO authenticated
  WITH CHECK (
    customer_id IS NULL
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND coalesce(p.is_active, false)
        AND p.role = ANY (ARRAY['owner', 'manager']::text[])
    )
  );

-- Only a blank card can be linked, and only to a customer.
DROP POLICY IF EXISTS customer_loyalty_cards_staff_assign ON public.customer_loyalty_cards;
CREATE POLICY customer_loyalty_cards_staff_assign
  ON public.customer_loyalty_cards
  FOR UPDATE TO authenticated
  USING (
    customer_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND coalesce(p.is_active, false)
        AND p.role = ANY (ARRAY['owner', 'manager', 'florist', 'cashier']::text[])
    )
  )
  WITH CHECK (customer_id IS NOT NULL);
