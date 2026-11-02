-- Phase 4: persist order-change notifications for active staff members.
CREATE TABLE IF NOT EXISTS public.order_notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_event_id bigint NOT NULL REFERENCES public.order_events(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  read_at timestamptz,
  UNIQUE (recipient_id, order_event_id)
);

CREATE INDEX IF NOT EXISTS order_notifications_recipient_created_idx
  ON public.order_notifications (recipient_id, created_at DESC, id DESC);

ALTER TABLE public.order_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_notifications FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.order_notifications TO authenticated;
GRANT UPDATE (read_at) ON TABLE public.order_notifications TO authenticated;

DROP POLICY IF EXISTS order_notifications_select_own ON public.order_notifications;
CREATE POLICY order_notifications_select_own
  ON public.order_notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS order_notifications_update_own ON public.order_notifications;
CREATE POLICY order_notifications_update_own
  ON public.order_notifications FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

DROP POLICY IF EXISTS order_notifications_delete_own ON public.order_notifications;
CREATE POLICY order_notifications_delete_own
  ON public.order_notifications FOR DELETE TO authenticated
  USING (recipient_id = auth.uid());

CREATE OR REPLACE FUNCTION public.blossom_notify_staff_of_order_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- New orders are expected activity and would create unnecessary noise.
  -- All later state, delivery, payment, archive, and item changes are useful.
  IF NEW.event_type = 'order_created' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.order_notifications (recipient_id, order_event_id)
  SELECT p.id, NEW.id
  FROM public.profiles p
  WHERE p.is_active = true
    AND p.role = ANY (ARRAY['owner', 'manager', 'florist', 'cashier', 'delivery']::text[])
    AND (NEW.event_type <> 'order_archived' OR p.role = 'owner')
    AND p.id <> coalesce(NEW.actor_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ON CONFLICT (recipient_id, order_event_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.blossom_notify_staff_of_order_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS order_events_notify_staff ON public.order_events;
CREATE TRIGGER order_events_notify_staff
  AFTER INSERT ON public.order_events
  FOR EACH ROW EXECUTE FUNCTION public.blossom_notify_staff_of_order_event();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'order_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_notifications;
  END IF;
END;
$$;
