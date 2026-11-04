# Blossom POS

Blossom is a desktop point-of-sale and shop operations app for a flower shop. The renderer is React/Vite; the Windows desktop shell is Electron; authentication and shop data use Supabase.

## Requirements

- Node.js and npm versions compatible with the versions in `package-lock.json`.
- A Supabase project with the Blossom schema, views, RPCs, Row Level Security policies, and Edge Functions deployed.
- The public Supabase project URL and anon/publishable key for the renderer. Never put a service-role key in a `VITE_` variable or renderer file.

## Run it in VS Code (quick start)

1. Open the `Floral-pos` folder in VS Code (File → Open Folder).
2. The first time only: run `npm install`, and create the `.env` file shown below.
3. Press **Ctrl+Shift+B** (or Terminal → Run Build Task) to start **Blossom (npm run dev)**. The app opens in your browser at `http://localhost:5173`.

If `npm` is blocked with "running scripts is disabled", run this once in the terminal: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

## Local development

1. Install dependencies with `npm ci`.
2. Create `.env` in this directory with the public client settings:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
   ```

3. Start the web renderer with `npm run dev`, or run `npm run electron:dev` for the desktop app.

The app stops during startup if either setting is missing. Do not commit `.env` or real project credentials.

## First shop setup

Blossom’s public sign-up screen is intentionally invite-only. Provision the first active `owner` through the shop’s controlled Supabase administration process; ordinary staff accounts are created by the owner from **Team → Add member**. Verify the owner can sign in and has an active `profiles` row before adding staff.

In the owner account, configure shop details, operating hours, USD-to-DA tender rate (if USD is accepted), low-stock alerts, and receipt printer. Add staff with the least access needed for their work. The UI role matrix is in `src/lib/permissions.js`; matching database policies and RPC checks must also be deployed before production use.

## Roles

| Role | Typical access |
| --- | --- |
| Owner | All shop features, settings, team access, register, reports |
| Manager | Orders, products, suppliers, delivery, reports, operational team management |
| Florist | Orders, products/stock, customers, delivery |
| Cashier | Sales, checkout, customer lookup, order/payment lookup |
| Delivery | Delivery runs and customer handoff details |

The app hides routes and actions according to the client matrix. This is not a substitute for server-side authorization. Do not give a role access until Supabase RLS and RPC permissions match it.

## Database and Edge Functions

The repository contains the USD-rate migration and the `create-team-member` and `reset-member-password` Edge Functions under `supabase/`. Other schema objects and transaction RPC definitions are managed outside this checkout. Before deploying:

1. Confirm the migration history and apply `20261007000000_add_usd_exchange_rate.sql` only after verifying it is not already represented in the target project.
2. Deploy the Edge Functions with the Supabase CLI and confirm their project secrets are configured by Supabase. Keep the service-role key server-side only.
3. Verify public sign-up is disabled, the first owner is provisioned, and RLS/RPC authorization and payment transaction behavior have been reviewed in staging.

## Cash, currency, and receipts

Order totals and the cash ledger use DA. USD is tender against the DA total at the rate shown in Settings; the rate and tender details are recorded in the payment note. Confirm the production ledger’s currency handling before enabling USD.

In the desktop app, receipts print directly on the receipt printer (the Windows default if its name looks like one, otherwise the first receipt printer found) as an image sent over ESC/POS, so the driver paper length cannot cut it. If none is found, direct printing fails, the receipt is over about 2 metres, or in a browser, the print dialog opens instead. Use **Settings → Print test receipt** to check paper width and readability. Reprint a saved sale from its order receipt. A print failure does not undo the saved order.

## Backups and recovery

Shop data is stored in Supabase. Set up and periodically verify database backups/point-in-time recovery in the Supabase project according to the shop’s retention needs; no backup schedule is configured by the renderer. Test a restore in a separate project before relying on it.

If the app reports that the service is unavailable, check Orders before retrying a sale or payment. If an outcome is uncertain, do not create a second transaction until the original order/payment is found or confirmed absent. Contact the shop owner or project administrator for account recovery and database restore.

## Build and release

- `npm run build` creates the Vite renderer in `dist/`.
- `npm run electron:pack` builds the desktop package locally.
- `npm run electron:build` builds a Windows release and is configured to publish through the repository’s release provider. Use it only from the authorized release environment.

Before distribution, test representative Owner, Manager, Florist, Cashier, and Delivery workflows against staging, including checkout, partial/full payment, refunds, delivery outcomes, register close, printing, and reconnect behavior.

## Troubleshooting

- **Startup says Supabase settings are missing:** check the local `.env` names and restart Vite/Electron.
- **A page says access denied:** confirm the staff member has an active profile and the deployed database role policy matches the role matrix.
- **A staff account cannot sign in:** ask the owner to confirm the account is active and reset its password from Team.
- **Receipt does not print:** check the OS printer queue, selected printer, paper size (80 mm thermal), and connection; print the test receipt and retry from the order receipt.
- **Sales or reports do not load:** check the connection indicator, Supabase service status, schema/view/RPC deployment, and browser/Electron logs. Preserve the order number when asking the project administrator for help.
