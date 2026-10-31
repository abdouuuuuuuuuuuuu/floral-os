# Assistant P1.4 capability audit

P1.4 closes high-value read gaps between Blossom modules and the assistant. Read results are grounded in existing Supabase tables and preserve the app's role matrix. Writes remain review-first.

| Area | User questions covered | Data source | Access boundary | Limits |
| --- | --- | --- | --- | --- |
| Orders | Lookup by number/name/phone, details, status, payment, delivery, creators, time periods | `orders`, staff `profiles` | Orders route access | Does not expose hidden database fields |
| Customers | Find by name or phone, order-linked facts | `customers`, `orders` | Customers route access | Full interaction history remains on Customers page |
| Products and stock | Quantity, availability, thresholds, price, waste summaries | `products`, report view | Products/Reports route access | Purchase-cost valuation is not presented as available |
| Deliveries | Today/tomorrow/yesterday, exact date, this/next week, this month, active status, “next deliveries” continuation | `orders` filtered to scheduled non-pickup orders | Delivery route access; database RLS remains authoritative | 10 rows per response; continuation preserves date/status filters and states visible range plus exact total |
| Suppliers | Find/browse suppliers and read supplier balances | `suppliers`, `supplier_balances` | Suppliers route: owner/manager | Does not create suppliers, receive stock, or record payments through chat |
| Cash register | Daily cash-in/out totals, opening/closing state, optional recent entries | `cash_register`, `daily_cash_summary` | Owner only | One register date at a time; at most 8 detail rows |
| Reports | Revenue, order count, product performance, waste | Existing report tables/views | Reports route: owner/manager | Report revenue is not described as collected cash |
| Order actions | Create/edit/delay/payment/cancel/delete | Existing order workflows | Existing role matrix; explicit review/confirmation | No bulk/multi-record mutation in this slice |

## P1.4 implementation notes

- Added deterministic and Ollama-tool routes for supplier lookup, cash register reads, and delivery schedules by date/period.
- Supplier and cash queries are permission-gated before any database read.
- Delivery queries exclude pickup orders and cancelled/non-active orders by default; explicit status filters are supported through the tool schema. Results sort by delivery date/time and paginate in batches of 10.
- “Next deliveries” or “show more” continues the previous delivery query without losing its date range or status. Each response reports its row range and exact result count.
- The capabilities answer now reflects actual role-scoped read behavior and avoids presenting unsupported supplier writes as chat actions.
- Database row-level security remains the final authority. Client-side route checks are not a replacement for RLS.

## Manual verification scenarios

These are interaction checks for the configured Blossom workspace; they are documented here but were not run in this pass.

| Scenario | Ask / setup | Expected behavior |
| --- | --- | --- |
| Delivery first page | Ask “Show deliveries this week” with more than 10 active non-pickup orders | Rows 1–10, exact total, date/time order, and a “Next 10 deliveries” chip |
| Delivery continuation | After the first page, ask “next deliveries” or press the chip | Rows 11–20 from the same period and status filter; no duplicate rows from page one |
| Delivery last page | Continue when fewer than 10 results remain | Show the actual final range and total; do not offer another page |
| Empty delivery period | Ask for a period with no eligible orders | Clear empty-state text; no misleading “1–0” range |
| Delivery role boundary | Ask as a user with Delivery access but no Orders access, then as a user without Delivery access | First user can read results; second receives a permission response before data is shown |
| Cash period | Owner requests register totals for a week containing multiple dates | Totals include all matching entries, grouped by register date; no false opening/closing summary for a multi-day range |
| Cash role boundary | Non-owner asks for register information | Restricted response and no register data |
| Supplier history | Ask what a supplier purchase history shows | Purchases are distinguished from supplier payment ledger; current balance only appears when the balance view returns it |
| Customer history fallback | Query a customer with linked profile and a legacy order with no customer ID | Linked orders resolve by customer ID; exact-name fallback can find legacy records without conflating partial names |
| Date boundary | Ask for deliveries around midnight/local date and a week boundary | Date-only delivery filters use the requested calendar dates; relative ranges follow `Africa/Algiers` |

## Remaining verification gaps

- Run the scenarios above with the configured Supabase schema and representative staff roles; confirm RLS allows the same rows as the UI.
- Confirm supplier history field availability against production schema. It represents purchase entries, not a full supplier payment ledger.
- Consider cash register period comparisons as a separate enhancement; current reads provide grouped period totals and recent entries.
- Add an automated evaluation harness in P2.12 after privacy-safe outcome capture and fixtures are agreed.
