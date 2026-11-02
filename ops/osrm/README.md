# Self-hosted OSRM for Blossom POS

This stack runs the Algeria driving graph on an always-on shop computer. A named Cloudflare Tunnel with a hostname on a domain you control gives the remote Supabase Edge Function a persistent HTTPS address without opening inbound ports on the shop network. Caddy requires a shared bearer token before proxying requests to OSRM. Cloudflare Quick Tunnels (`*.trycloudflare.com`) are temporary: their hostnames can change, and the POS route-service URL must be updated in Settings after a change.

## Requirements

- An always-on Linux host or Windows PC with WSL2 and Docker Desktop, internet access, and persistent storage.
- A Cloudflare account with a domain managed in Cloudflare, plus a named Tunnel token.
- A public hostname for the tunnel, for example `router.your-domain.example`.
- Supabase CLI access to the Blossom project.

On Windows, install WSL2 and Docker Desktop before running this stack. WSL installation requires administrator access and a restart. A local OSRM service is unavailable whenever its host PC or internet connection is down.

## Setup

1. In Cloudflare Zero Trust, create a named Tunnel. Add a public hostname and route it to `http://caddy:8080`. Copy the tunnel token.
2. Copy `.env.example` to `.env`. Set `CLOUDFLARE_TUNNEL_TOKEN` and generate `ROUTER_API_TOKEN` with `openssl rand -hex 32`. Keep `.env` private; it is ignored by Git.
3. In a Linux or WSL shell, run `bash ./bootstrap-algeria.sh`. It downloads the Geofabrik Algeria PBF and prepares the OSRM MLD graph. The first graph preparation can take several minutes and needs more disk space than the compressed PBF.
4. Start the services with `docker compose up -d` from this directory.
5. Set the same router token as a Supabase Edge Function secret. Create a temporary file containing only `ROUTING_SERVICE_API_KEY=<the ROUTER_API_TOKEN value>`, then run:

   ```sh
   npx supabase secrets set --project-ref wnuvbslgznhehzdemmdm --env-file .supabase-router-secret.env
   rm -f .supabase-router-secret.env
   ```

   The temporary secret file is ignored by Git. Do not put the token in the router URL.

6. In Blossom POS, open **Settings → Delivery routing** and set the Driving-route service URL to the tunnel's base URL, such as `https://router.your-domain.example`. Save it.
7. Confirm the tunnel is online, then calculate a route from an active delivery order. The Edge Function sends the bearer token server-side; the browser never receives it.

Only the Caddy proxy is reachable through the tunnel. OSRM itself has no published host port and is only reachable inside the private Docker network.

## Updating the map

The Algeria extract changes over time. For a map refresh, stop the stack, back up `data/`, download a fresh PBF, remove the old generated `algeria-latest.osrm*` graph files and `.processed-v26.10.0-mld` marker, then run the bootstrap script and start the stack again. Keep a backup until the refreshed route service responds successfully.

The OSRM route API uses `/route/v1/driving/{longitude},{latitude};{longitude},{latitude}`. The app expects the route response to include both route distance and waypoint snap distances.
