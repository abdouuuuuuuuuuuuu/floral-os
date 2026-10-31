-- H53H+498 is a short Plus Code. Its recovered full code is
-- 8F78H53H+498, resolved using Batna as the locality reference.
-- Store one shared boutique origin for every POS user.
INSERT INTO public.settings (
  id,
  shop_location_name,
  shop_location_wilaya,
  shop_latitude,
  shop_longitude,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'H53H+498, Batna, Algeria',
  'Batna',
  35.5527875,
  6.178453125,
  now()
)
ON CONFLICT (id) DO UPDATE
SET shop_location_name = EXCLUDED.shop_location_name,
    shop_location_wilaya = EXCLUDED.shop_location_wilaya,
    shop_latitude = EXCLUDED.shop_latitude,
    shop_longitude = EXCLUDED.shop_longitude,
    updated_at = EXCLUDED.updated_at;
