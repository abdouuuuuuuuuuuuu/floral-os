-- Phase 3: let Supabase Realtime deliver the append-only activity stream
-- to authorized clients. The activity table and its SELECT RLS policy are
-- created in the preceding order_activity_timeline migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'order_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_events;
  END IF;
END;
$$;

-- Delivery staff need the operational events for active orders they can see
-- in the delivery run. Archived order history remains owner-only.
DROP POLICY IF EXISTS order_events_select_authorized ON public.order_events;
CREATE POLICY order_events_select_authorized
  ON public.order_events
  FOR SELECT
  TO authenticated
  USING (
    public.blossom_active_role() = ANY (ARRAY['owner', 'manager', 'florist', 'cashier', 'delivery']::text[])
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_events.order_id
        AND (o.deleted_at IS NULL OR public.blossom_active_role() = 'owner')
    )
  );
