-- Store the shop's active DZD-per-USD tender rate.
-- The value is intentionally nullable so USD payment cannot be used until
-- an owner configures a valid rate in Settings.
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS usd_exchange_rate numeric(12, 4);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'settings_usd_exchange_rate_positive'
      AND conrelid = 'public.settings'::regclass
  ) THEN
    ALTER TABLE public.settings
      ADD CONSTRAINT settings_usd_exchange_rate_positive
      CHECK (usd_exchange_rate IS NULL OR usd_exchange_rate > 0);
  END IF;
END;
$$;
