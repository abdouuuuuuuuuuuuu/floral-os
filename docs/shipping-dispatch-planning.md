# Shipping dispatch planning

## Setup

1. Apply `supabase/migrations/20261018130000_shipping_dispatch_planning.sql`, `supabase/migrations/20261018140000_secure_shipping_route_calculation.sql`, and `supabase/migrations/20261018150000_set_shared_shop_origin_batna.sql` to the Supabase project in order.
2. Deploy the Edge Function with `supabase functions deploy calculate-shipping-route`.
3. The third migration sets the shared boutique origin from the supplied Plus Code `H53H+498, Batna`. An owner can refine or replace that map point later in **Settings → Shipping distance planning**. This shared settings row is the only route origin for every user; individual staff profiles do not supply origins.
4. In the same settings section, configure an OSRM-compatible driving-route service URL. It must support `/route/v1/driving/{longitude,latitude};{longitude,latitude}?overview=false&steps=false` over HTTPS. Browser CORS is not required because Supabase calls the provider server-side.
5. If the provider requires a bearer token, store it as a Supabase Edge Function secret with `supabase secrets set ROUTING_SERVICE_API_KEY=your-token`; never include credentials in the settings URL.
6. Create or update delivery orders with a confirmed destination town/commune and requested delivery date. The server calculates and saves the route after order creation, or when a user resolves an existing order from the shipping queue.
7. Check the **Carrier handoff** panel on the dashboard and the shipping queue on **Orders**. Orders without a route appear in **Needs destination or route**; open one to resolve it.

## Dispatch rules

The route service returns driving distance. The Edge Function derives the transit band from that distance, and the database rejects any saved distance/band pair that does not match:

- Under 80 km: same-day delivery band (0 calendar days).
- 80 km through 600 km: 1 calendar day.
- Over 600 km: up to 2 calendar days.

The handoff date is `delivery_date - shipping_transit_days`, using calendar days in the `Africa/Algiers` business timezone. Distances are retained to meter precision before classifying the 80 km and 600 km boundaries. Supabase calculates route metrics from the shared shop origin and selected destination, then stores the destination, route distance, origin snapshot, duration when supplied, provider host, and computed transit band with the order. Client-supplied route distances are not trusted or saved.

## Location and accuracy limits

Place search covers the 69-wilaya / 1,541-commune 2026 gazetteer and offers OpenStreetMap place results. The app downloads and caches the community gazetteer; a selected gazetteer result must still resolve to an OpenStreetMap map point before a route can be calculated. Only town/wilaya search terms are sent to the place-search service; customer street details remain in order notes and are not used in geocoding.

The boutique origin is one shared map point in Settings for all users. Delivery destinations use the selected town/commune point, not the customer's exact street address. The map search presents possible matches for staff confirmation instead of silently selecting the first result. Route calculations are rejected if either selected point is more than 5 km from the provider's drivable road network, which helps catch bad town/map matches. Carrier pickup cutoffs, non-working days, weather, traffic, and service-specific SLAs are not modeled. This queue is a preparation estimate; use the carrier's own booking/ETA confirmation for the final dispatch commitment. If location or routing cannot be resolved, the order remains visibly pending instead of receiving a guessed dispatch date.

The public OSRM demo endpoint is not intended as a dependable production routing service. Use a managed provider or a self-hosted OSRM-compatible service. Place search observes Nominatim's public usage policy: explicit searches, throttling, caching, and attribution rather than autocomplete.

For a self-hosted Algeria OSRM service on a shop computer, see [`ops/osrm/README.md`](../ops/osrm/README.md). The setup uses Docker, a Cloudflare Tunnel, and a bearer-protected proxy so the hosted Supabase function can reach the local router over HTTPS.
