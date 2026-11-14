# Cart → checkout → validation: UX analysis

Date: 2026-11-12. Scope: the sale flow a florist runs at the till (Cart page →
Checkout steps → saved order and receipt) and the order-date actions on the
Orders page. Method: walkthrough of the code paths and screens in this
checkout (`src/pages/Cart.jsx`, `Checkout.jsx`, `PaymentStep.jsx`,
`Orders.jsx`, `OrderDetail.jsx`) against the goal the owner set: simple,
creative, attractive, easy, and fast to validate.

Items marked **Done** were implemented in the same change set as this
document. The rest are ranked recommendations.

## 1. What already works well

- Catalog and cart side by side on desktop; a sticky "Review cart" bar on
  smaller screens. No page switch is needed to build an order.
- Search is forgiving (accent-insensitive, matches colour and flower type)
  and the "For you" sort learns each staff member's frequent picks.
- Stock is advisory, not blocking: a stale count never stops a sale.
- Remove and Clear both offer undo; the cart survives a refresh or crash.
- Checkout validates inline, scrolls to the first error, keeps a draft in
  session storage, and re-checks that the cart did not change under a
  payment already entered.
- Phone-first customer lookup auto-fills the profile and is required for
  pay-later orders, so credit lands on the right customer.
- Orders are created in one database transaction with an idempotent request
  id, so a retry after a dropped connection cannot double-sell.

## 2. Problems found and what changed

### 2.1 Order date could not be changed (bug, fixed) — **Done**

Root cause was on the server, not in the screens:

- `delay_order()` only accepted a date that was *after today* **and** *after
  the order's current date*, and refused pickup orders outright. So "move it
  to tomorrow" on a pickup order, "bring it forward two days", or "fix a
  wrong date" all failed, and the date picker's minimum hid the earlier
  dates.
- Editing the date from the order form had two paths: a later date was sent
  to the same `delay_order()` rule (same failures); an earlier date was
  handed to the legacy `update_order_items()` helper, which does not apply
  it, so the UI showed the new date for a second and then snapped back.

Fix (`supabase/migrations/20261112100000_reschedule_orders_any_date.sql`):

- New `reschedule_order()`: any date from today on, earlier or later, pickup
  or delivery, with the reschedule history kept. "Delayed" is only shown
  while the order sits later than its first planned date.
- `delay_order()` kept as a wrapper, so the assistant and the delivery run
  keep working; `edit_order_and_items()` routes every date change through
  the new function.
- Failed-delivery reschedules may now land on the same day (a retry this
  afternoon is a normal outcome).

Screen changes: the clock button is now "Change pickup/delivery date", the
due date on the row is itself clickable, the form offers one-tap dates
(Today, Tomorrow, +1 day, +2 days, +1 week) and tells you the shift ("2 days
later" / "1 day earlier") before you save. The same minimum (today) applies
in the order form, the order detail page, and the assistant.

### 2.2 Cart lines could not be arranged — **Done**

The receipt and the order page list lines in the order they were added, and
there was no way to change it. Florists compose a bouquet in a sequence
(focal flowers, fillers, foliage, then gifts), and the paper receipt is what
the person at the bench works from.

Implemented, with no new dependency (`src/hooks/useCartDrag.js`):

- **Drag a cart line by its grip** to reorder; a pink insertion bar shows
  where it will land; the list auto-scrolls near its edges.
- **Drag a catalog card into the cart** to add it exactly where you drop
  it. A tap still adds one unit as before. The cart highlights as a drop
  target, and on small screens the "Review cart" bar becomes the drop
  target.
- **Keyboard**: focus a grip and press ↑/↓. A live region announces moves.
- A ghost card follows the pointer with a slight tilt; Escape cancels.
- Line order is persisted with the cart and is the order the review step,
  the saved order, and the receipt use (`supabase/migrations/20261112110000_create_order_keeps_cart_line_order.sql`
  makes the database insert lines in cart order).

### 2.3 Checkout asks for one screen too many (recommended, not done)

The stepper reads "2 Details · 3 Payment · 4 Review": numbering starts at 2
because the cart is step 1 but it is not shown. Four screens is a lot for a
walk-in sale. Recommendation for the next iteration:

- Show the stepper as **Cart ✓ · Details · Pay** (three steps, starting at
  1).
- Make the **Review a side panel of the Payment step** on desktop (the order
  summary is already rendered there) and keep the full-page Review only on
  phones. The confirm button becomes "Confirm & print" on the payment step.
- Default the quick-sale path to skip Details entirely: a quick sale with
  no customer should go Cart → Pay → done.

### 2.4 Sale type is chosen twice (recommended)

The cart is entered as "Build an order" or "Build a quick sale" and then the
checkout shows the same Order / Quick sale choice again. Keep the switch,
but collapse it into a single line ("Quick sale · change") so it stops
reading as a required decision.

### 2.5 Bunch quantities (recommended)

Stems are often sold by 5, 10 or 12. Adding by tapping twelve times or
typing a number is slow. Offer **quantity chips on the cart line** (+5, +10,
×12 for roses) or a long-press on the catalog card that opens a quantity
pad. Low cost, high daily time saving.

### 2.6 Printing after validation (recommended)

"Create order & receipt" saves and then opens the receipt page, where the
print is a second action. For quick sales, **print automatically** after a
successful save (the printer path already handles failures without undoing
the order) and show a toast with "Open receipt" instead.

### 2.7 Smaller polish

- Order rows have five icon-only buttons; keep them but surface the two
  that staff use most (edit, change date) with a short label on wide
  screens.
- The cart's "0 left" badge and the red "Stock count needs checking" line
  say the same thing twice on a card; keep one.
- The mobile cart sheet can be closed only via X or tapping outside; add a
  swipe-down handle (visual affordance already implied by the bottom sheet).

## 3. Rollout

1. Apply migration `20261112100000_reschedule_orders_any_date.sql` in
   Supabase (SQL editor or CLI). The app falls back to the old `delay_order`
   while it is missing, so the client can ship first.
2. Apply `20261112110000_create_order_keeps_cart_line_order.sql` only if the
   live `create_order(jsonb, jsonb)` still matches the repository version.
3. Build and release the renderer as usual (`npm run electron:build`).

## 4. Verification checklist

- Orders → clock button on a pickup order → Tomorrow → Save: date changes,
  no "pickup orders do not have a delivery date" error.
- Orders → edit → set an earlier date → Save: the new date stays after the
  list refreshes.
- Orders → change date to today: accepted.
- Orders → done or cancelled order: button disabled with the status reason.
- Cart → drag a catalog card onto the list: it lands at the insertion bar;
  dropped on an existing line's product: quantity increases and the line
  moves there.
- Cart → drag a line by the grip above another: order changes; the order is
  kept after a refresh and shown in the checkout review and the receipt.
- Cart → focus a grip, press ↓: the line moves and the move is announced.
- Cart → press on a card and release without moving: one unit is added, as
  before.
