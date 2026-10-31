-- Blossom treats the existing `usd` payment method/column as USDT tender.
-- Keep the legacy schema key for compatibility while setting its DA rate.
ALTER TABLE public.settings
  ALTER COLUMN usd_exchange_rate SET DEFAULT 250;

UPDATE public.settings
SET usd_exchange_rate = 250
WHERE id = '00000000-0000-0000-0000-000000000001'
  AND usd_exchange_rate IS DISTINCT FROM 250;
