# Blossom POS: local database that syncs to Supabase

## Context

Today every screen reads directly from Supabase. Only new sales survive an outage (IndexedDB queue in `src/lib/offlineQueue.js`). You want every feature to work offline, on several Windows PCs running the Electron app, syncing to Supabase when the connection returns. The PCs do not talk to each other during an outage.

Goal: each PC has its own local database. Screens read from it, changes are saved locally first, and sync runs in the background. Supabase stays the final source of truth.

## What full offline can and can't do

During an outage each PC only sees its own changes. These rules follow from that:

| Situation | Behaviour |
|---|---|
| Order numbers | Server-assigned at sync. Receipts print a temporary reference such as `T2-0042`, kept on the order and searchable forever |
| Two PCs sell the last item | Both sales stand, because the server already allows oversell. Stock goes negative and is flagged, as it does today |
| Stock count, waste or removal no longer valid | Sent to the review screen |
| Loyalty points already spent on another PC | Sent to the review screen; the sale is never dropped |
| Sale made Tuesday, synced Wednesday | Keeps its Tuesday time on the order. If Tuesday's register is closed, its cash goes to the next register using the existing "held after close" logic |
| Register closed offline | Saved as provisional. Late sales from other PCs follow the same held logic |
| Two PCs edit the same order | The second edit goes to review if the order changed since that PC last saw it |

**Not possible offline:**
- Creating staff accounts, resetting passwords, and activating or deactivating staff (these need Supabase Auth)
- Driving-route estimates (these can be saved and calculated later; Checkout already has this follow-up path)
- A staff member's first sign-in on a given PC
- App updates

**Limited offline:**
- Reports and the activity log show the last synced figures, plus this PC's pending sales, labelled "as of <time>". Rebuilding all report logic locally would risk two versions of the numbers.
- Product images show only if already cached.

**Remaining risk:** a sale not yet synced exists only on that PC. If the PC dies before the next successful sync, that sale is lost.

## Architecture

```
Screens / hooks
   ↓ src/lib/data/* (named queries and commands, one module per area)
   ↓ IPC (window.electronAPI.localDb), using the existing trustedAppWindow check
Electron main process
   ├─ Encrypted SQLite: replica tables + outbox + review items
   └─ Sync engine ── pull: change log, then rows through RLS
                  └─ push: outbox replayed through one server RPC
```

- **SQLite library:** `better-sqlite3-multiple-ciphers`. Electron 33 runs Node 20, which has no built-in SQLite. The key is protected with Electron `safeStorage`. It lives in the main process because the renderer is sandboxed.
- **Local tables:** each row is stored as JSON with a few indexed columns, so new server columns don't need a local migration.
- **Data layer, not a fake Supabase client:** the 44 files use embedded selects, `.or()` and `ilike`, and re-implementing those would be fragile. Hooks move to named functions one area at a time.
- **Browser mode:** with no `electronAPI`, the data layer calls Supabase directly, so `npm run dev` keeps working.

### Pull (Supabase to PC)
- New `sync_changes` table, filled by triggers on each synced table. It holds only table name, primary key, operation and transaction ID. This also covers hard deletes, and avoids relying on `updated_at`, which is barely used.
- New RPC `blossom_sync_changes(cursor, limit)` returns only changes from committed transactions, using `pg_snapshot_xmin`. A plain sequence can skip rows when transactions commit out of order.
- Rows are then fetched with normal `.from(table).select('*').in(...)`, so **existing RLS still applies**.
- Each table keeps its own cursor and only syncs if the signed-in role may read it. A row is removed locally only on an explicit delete, so a cashier's sync can't erase rows only the owner can see.

### Sync schedule: every 5 minutes
- One timer in the main process runs a full cycle every 5 minutes: push the outbox, then pull changes. The interval is one constant, `SYNC_INTERVAL_MS`.
- Small additions beyond the timer: a sync when the app starts, a **Sync now** button, and one attempt when the app closes. The timer skips a cycle if one is still running.
- Realtime no longer feeds shop data. The 8 files with `.channel()` subscriptions (`useOrders.js`, `useDeliveries.js`, `useCashRegister.js`, `useReports.js`, `useNewOrderSound.js`, `NotificationContext.jsx`, `useShopName.js`, `OrderDetail.jsx`) instead listen for a local "database changed" event after each cycle.
- The status indicator shows the last sync time and the number of changes waiting.
- Online-only actions (sign-in, team actions) still happen immediately.

**What this means even when the internet is working:**
- Other PCs can take up to 5 minutes to see a new order or stock change, so oversells and edit conflicts are more likely.
- New-order sounds and notifications can arrive up to 5 minutes late.
- Every sale prints a temporary reference such as `T2-0042`, because the real order number is assigned at the next sync.
- If a PC dies, up to 5 minutes of its sales can be lost, even with no outage.

### Push (PC to Supabase)
- Every change becomes an outbox entry in a local transaction: command ID, type, payload, acting user, time it happened, and base version of the row. It is then applied to a local overlay, so the screen updates at once.
- It replays oldest-first per PC through a new `blossom_apply_command(id, type, payload, occurred_at, device, local_ref)`, a `SECURITY INVOKER` function that calls the **existing RPCs**, so their role checks and validation stay in charge. It adds retry safety to RPCs that have no request ID today (for example `delay_order`, `set_order_status`, `blossom_void_order`).
- **Business time:** a new `blossom_now()` returns the command's time, limited so it can't be in the future or too far back. Order flows use it instead of `now()` wherever they stamp a sale or payment.
- **Temporary IDs:** orders get their ID from the server, and customers and products use integer IDs. The server's reply fills in a local-to-server ID map, used to rewrite later commands. Customers already resolve by phone through `blossom_resolve_customer`, which merges duplicates made on two PCs.
- **Rejected commands are never deleted.** They go to a new **Sync issues** screen where a manager or owner can fix and retry, or discard with a reason. This replaces today's delete-and-notify behaviour in `src/lib/offlineSync.js:33`.

### Offline sign-in
- After each online sign-in, the PC stores a salted scrypt hash of the password and the user's refresh token (encrypted with `safeStorage`). Offline sign-in checks the hash.
- Offline sign-in expires after 7 days without contacting the server, and is blocked once sync shows the account is deactivated.
- Queued commands replay under the user who made them, using that user's token, so `auth.uid()` and the audit trail stay correct. If that token no longer works, commands wait until the user signs in again.
- Sign-out with unsynced commands only locks the app locally, because revoking the token would strand those commands.
- `src/context/AuthContext.jsx` needs changes because it currently assumes a reachable profile.

### Access on shared PCs
All staff on a PC share one encrypted database. The main process checks the verified user's role before answering any query, using the same rules as `src/lib/permissions.js`. So a cashier can't see cash data through the app, though that data is on the disk in encrypted form if the owner has signed in there.

## Phases (each one can be released on its own)

**0. Safety and schema (needs your help)**
- Run `git init` and make a first commit. The folder has no history, and `.env` and `release/` are already ignored.
- Export the full schema. Core tables and four supplier RPCs (`receive_supplier_stock`, `pay_supplier`, `void_supplier_entry`, `update_supplier_entry`) are not in the repo. Needs the Supabase CLI and your database password: `supabase db dump --schema-only`.
- Create a **staging Supabase project**. No sync migration goes to production until it has been tested there.

**1. Local reads**
- SQLite setup, IPC, `sync_changes`, triggers and pull engine; sync status indicator.
- Move products, categories, customers, settings and orders to read locally. Staff can browse offline; writes are unchanged.
- Check that the native module packages correctly with `electron-builder` (`asar: false` already helps).

**2. Sales and payments offline**
- `blossom_apply_command`, `blossom_now()`, outbox, temporary references on receipts, offline sign-in, Sync issues screen.
- Move `createOrder` (`src/lib/orders.js`), `useQuickSale.js` and payments to the outbox. Migrate pending IndexedDB sales on first launch, then retire `offlineQueue.js` and `offlineSync.js`.

**3. Order workflow, delivery, customers, stock**
- Edit, status, delay, void, reopen, archive; delivery outcomes and handoffs; customers and loyalty cards; stock, waste and products.
- `useOrders.js`, `useDeliveries.js`, `useCustomers.js`, `useProductsAdmin.js`, `useFlowerWaste.js`; `AssistantOrderActions.jsx` and `queryService.js`.

**4. Cash and suppliers**
- Open and close register, manual entries, provisional close, supplier purchases and payments.
- `useCashRegister.js`, `useSuppliers.js`. Highest money risk, so it goes last, once replay is proven.

**5. The rest**
- Cached reports, dashboard and activity log with "as of" labels; settings; image cache; team screens clearly marked online-only.
- Update README and `ConnectionStatus.jsx` wording ("cannot be saved until you reconnect" stops being true).

## Key files

- **New:** `electron/localDb/*` (database, migrations, sync engine, auth vault), `src/lib/data/*`, `src/pages/SyncIssues.jsx`, `supabase/migrations/*_sync_change_log.sql`, `*_apply_command.sql`
- **Changed:** `electron/main.js`, `electron/preload.cjs`, `package.json`, `src/context/AuthContext.jsx`, `src/lib/orders.js`, `src/components/layout/OfflineSyncManager.jsx`, `src/App.jsx`, `src/lib/permissions.js`, plus hooks and pages as each phase reaches them
- **Reused:** `isNetworkError`, `translateOrderError` (`src/lib/orderErrors.js`), `trustedAppWindow` (`electron/main.js`), `blossom_resolve_customer`, existing request-ID tables (`order_creation_requests`, `order_payment_requests`, `manual_cash_entry_requests`), `set_product_stock` compare-and-set

## Verification

Automated (`node --test`, matching the existing `scripts/` style; none of this exists yet):
- Replay order, retry safety (same command twice gives one order and one cash entry), ID rewriting, overlay logic, role checks on queries
- Change log against staging: out-of-order commits are not missed, hard deletes propagate, RLS limits what each role gets

Manual on staging, using two Electron instances with separate data folders:
0. While online, sell on PC A: PC B shows it after the next 5-minute cycle or after **Sync now**, and the order's temporary reference gains its real number.
1. Disconnect both, sell the same last item on both, reconnect: two orders, unique numbers, negative stock flagged, temporary references still searchable.
2. Sell offline, then force-quit and reopen before reconnecting: the sale is still there.
3. Kill the network mid-replay: no duplicate order, payment or cash entry.
4. Sale dated yesterday after the register closed: correct order time, cash on the next register, totals match.
5. Spend the same loyalty points on both PCs: one goes to Sync issues and the sale is preserved.
6. Sign out and in offline as a different role: correct screens, cash data hidden, each command attributed to the right user.
7. Deactivate a user online: their offline sign-in is blocked after the next sync, and their queued commands are handled.
8. Install the packaged `.exe` on a clean PC and upgrade from 1.0.4 with sales pending in the old queue.
9. After each phase, also run the Owner, Manager, Florist, Cashier and Delivery checks listed in the README, while online.
