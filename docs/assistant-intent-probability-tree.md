# Blossom assistant intent probability tree

This is the routing contract for natural-language requests in Blossom. It describes the user’s likely intent, the signals that support it, and the conditions that should trigger clarification instead of a guess.

## How to interpret the routing values

The values below are **initial heuristic routing scores**, not measured probabilities. Blossom has no labeled prompt dataset from which to calculate real probabilities. The route assessor now uses its score to decide whether deterministic routing is clear enough or whether an available local model should help resolve the request. Scores must not be shown to users or treated as statistical confidence. Calibration requires labeled examples and explicit corrections.

In code, clear requests with a score of `0.78` or higher stay on the deterministic path unless they contain competing domains. Lower-scoring requests, fallback intents, and competing-domain requests may use Ollama as a structured tie-break. The model result is still validated and guarded. If it cannot safely resolve the request, the deterministic route/clarification remains. Never execute a write action from a low-confidence guess; model-suggested writes require an explicit order action and target, then use the existing review flow.

### Initial evidence weights

These are **starting routing scores** for a candidate branch. Add evidence for the requested operation and target; subtract when a competing branch has stronger evidence. Clamp the result to `0–1`. Do not call the score a statistical probability until it has been calibrated against labeled prompts.

| Evidence | Starting score / adjustment |
|---|---:|
| Exact order number (`order 893`, `#893`) | +0.70 to order identity |
| Customer name + possessive/order relation (`Djabali Wasila’s order`) | +0.55 to customer order lookup |
| Customer name + contents predicate (`what … has in … order`, `what did … order`) | +0.40 to order-items intent |
| Explicit requested fact (`payment status`, `delivery date`, `items`) | +0.30 to that fact |
| Explicit action verb + clear object (`record payment`, `delay order`) | +0.35 to the action intent |
| Explicit date (`today`, `tomorrow`, ISO date) | +0.25 to date-scoped query |
| Flower/product name from the active catalog | +0.25 to that product entity |
| Inventory predicate (`left`, `in stock`, `quantity`) | +0.35 to stock intent |
| Revenue predicate (`sales`, `revenue`, `earned`) | +0.35 to report intent |
| Bare generic keyword (`order`, `flower`, `paid`, `add`) | +0.05 only; insufficient by itself |
| Missing target for a write action | cap at 0.54; clarify |
| Competing intent domains in one request | ask the model to resolve; if unresolved, clarify |

Example: `What does Djabali Wasila have in her order?` scores high for customer order-items because the customer relation and contents predicate agree. `What orders?` has only a generic order keyword and should ask for scope, not assume today.

```text
Incoming message (1.00)
├─ Explicit destructive/action verb? (cancel, delete, refund, pay, edit, create)
│  ├─ Has a clear target and required details? (0.90+)
│  │  ├─ Permission allows it → show a review/confirmation step; never silently commit
│  │  └─ Permission denied → explain access boundary
│  └─ Missing target/details or action ambiguous → ask for only the missing detail
├─ Explicit entity identifier? (order #, customer name/phone, product name/SKU)
│  ├─ Identifier + requested fact/action → query that entity (0.90+)
│  ├─ Name matches one record → answer requested fact and preserve entity context
│  ├─ Name matches multiple records → show disambiguation list; do not choose newest silently
│  └─ No match → report no match and suggest alternate identifier
├─ Explicit domain + operation? (stock, product, delivery, report, cash, customer, staff)
│  ├─ Distinctive phrase for one operation → route to that operation (0.80+)
│  ├─ Overlapping phrase across operations → ask: which object / intended outcome?
│  └─ Broad keyword only → ask for scope/date/entity
├─ Follow-up referring to previous result? (it, that one, the second, and its phone)
│  ├─ One stored entity → continue with that entity and new requested field
│  ├─ Several stored entities → resolve ordinal or ask which one
│  └─ No valid context → ask which entity; never borrow an unrelated old entity
└─ No supported intent → explain supported Blossom areas; do not default to today’s orders
```

## Domain branches and keyword families

Each branch lists canonical intent, signal families, likely competing intent, and routing rule. Phrases are examples, not an exhaustive grammar; synonyms and spelling variants should normalize to the same branch.

### Orders and fulfillment

| Signal words and phrases | Intended branch | Competing interpretation / guard |
|---|---|---|
| `order #`, `order number`, `number 786`, `commande 786` | Identify one order | If number absent, ask for it; do not infer from a previous unrelated order |
| `for [name]`, `[name]'s order`, `what [name] has in their order`, `what did [name] order`, `items in` | Find order by customer and/or show line items | If multiple orders match, show every candidate with its number/date before item details |
| `status`, `state`, `processing`, `ready`, `done`, `completed`, `cancelled` | Order status | `payment status`, `paid`, `unpaid`, `balance` belong to payment branch |
| `delivery date`, `when due`, `scheduled`, `delivery time`, `pickup`, `motorcycle`, `DHD` | Fulfillment details | Ask date vs time if ambiguous; distinguish pickup from delivery run |
| `today`, `tomorrow`, `due`, `late`, `overdue`, `this week`, `next week` | Order/delivery date filter | Must have an explicit time cue to select a date scope; the word `order` alone never means today |
| `create`, `new order`, `place`, `make` | Create order flow | If user is only asking how, provide guidance; creation opens a draft/review flow |
| `edit`, `change`, `update`, `modify`, `add to order`, `remove from order` | Edit order | Require order number/name or unambiguous conversational selection; show the form before saving |
| `delay`, `postpone`, `reschedule`, `new delivery date` | Delay/reschedule | Ask for the new date if missing; reason is optional; preserve payment/status unless requested |
| `cancel`, `void` | Cancel order | Preserve record and require review/reason according to policy |
| `delete`, `permanently remove` | Delete order | Distinct from cancel; require exact target and destructive confirmation |

### Order question catalog used by the assistant

The assistant should interpret each row as one intent family. Wording can vary; the identifying target (order number, customer, date, or status) and the requested fact/action determine the response. A specific order number takes precedence over broad status or date words. A bare `show order 876` means show the full order record; a named fact such as `status` returns only that fact.

| User may ask… | Resolve as | Target/data returned |
|---|---|---|
| “Show order 876”, “open order #876”, “order ID 876”, “show order details of 876”, “details for order 876”, “what’s in order 876?” | Exact order lookup; full details unless a fact is named | Client, phone, order number, products/quantities, fulfillment status, payment status/method, totals, delivery date/time/method, notes when present |
| “Who is order 876 for?”, “what’s the customer name on 876?”, “client of order 876” | Exact order lookup; customer fact | Client name only |
| “What is the phone/number for order 876?”, “how do I contact the customer?” | Exact order lookup; contact fact | Client phone; if the current order context is unambiguous, a short follow-up such as “what’s their number?” uses that order |
| “What’s the status of 876?”, “is order 876 done/processing/cancelled?” | Exact order lookup; fulfillment status | Order status, not payment status |
| “Is 876 paid?”, “what’s the payment status of order 876?”, “what did they pay with?”, “how much is left?” | Exact order lookup; payment fact | Paid/unpaid state, method, amount paid/due, or total as requested |
| “When is order 876 due?”, “what is the delivery date/date of delivery?”, “what time?”, “pickup or delivery?” | Exact order lookup; fulfillment fact | Delivery date, time, or method |
| “What products/items/flowers are in 876?”, “what did they order?” | Exact order lookup; item fact | Item names, quantities, and line totals |
| “Find/show orders for/by/under customer [name]”, “[name]’s order”, “show order with the name [name]”, “show me the order of [name]” | Customer-name order search | Matching orders; full details for one match, clearly numbered choices if several match |
| “What about [another name]?”, “try [another name]” after an order answer | New customer-name order search, retaining the order topic | The other customer’s matching order(s); “what about its status?” remains attached to the current order |
| “Show open/new/processing/completed/cancelled orders”, “orders with status processing” | Status-filtered order list | Matching orders with client, number, delivery date, status, and total |
| “Orders due/delivering today/tomorrow/on Friday/on 2026-10-09”, “orders delivered on [date]” | Delivery-date-filtered list | Orders scheduled for that date, sorted by delivery time |
| “Orders created/placed today/yesterday/this week” | Creation-date-filtered list | Orders entered during that creation period; distinguish this from delivery date |
| “Find the order for [name] due tomorrow”, “processing orders for [name] this week” | Combined name + date/status filters | Only rows matching every explicit filter; explain when the combined search has no match |
| “Find the order by phone [number]”, “order # / number [number]” | Phone or order-number lookup | Exact phone/order target; never interpret an order number as a phone number |
| “Find orders over/under/between [amount] DA” | Amount-filtered order list | Orders with matching totals, separate from paid amount or cash register balance |
| “Create/make/place an order…”, “edit/update order 876…”, “add/remove items from order 876” | Order write flow | Draft/review UI with the target and proposed changes visible before saving |
| “Delay/reschedule/postpone order 876 to [date]” | Delivery-date change flow | New date and optional reason, with payment and fulfillment state preserved unless explicitly changed |
| “Cancel order 876” vs “delete order 876” | Cancel vs destructive delete | Distinct flows; confirm the exact order before the action |
| “Record/collect payment for order 876”, “refund order 876” | Payment/refund action | Amount and method review; permission and explicit confirmation before writing |

If the requested fact or filter cannot be identified, ask only for the missing piece. If a query returns multiple candidates, show client + order number + delivery date + total for each and let the user select one. If it returns none, retain the search term in the follow-up context so “try [another name]” retries that same order lookup. “Show/list orders” returns a recent-order list; only explicit page navigation such as “go to the orders page” navigates away. A clear switch to inventory, reports, customers, or another area replaces the prior order context; an order lookup never treats an inventory question as a customer name. Never answer an order lookup with navigation alone.

### Stock and inventory question catalog

The stock responses use the fields actually present in the product catalog and mirror the Products page stock bands: `0 or less` is out of stock (negative values need a recount), `1–9` is low, `10–29` is medium, and `30+` is healthy. Stock counts use active catalog products. Purchase-cost valuation and a full receipt/movement ledger are not exposed by the current product table, so the assistant must not invent them.

| User may ask… | Resolve as | Data available/limits |
|---|---|---|
| “How many red flowers do I have?”, “how much red stock is left?”, “are red roses available?”, “stock of white tulips” | Product stock by search terms, color, and flower type | Current quantity per matching active catalog item; include zero/negative items when useful |
| “How many products/items do we have?”, “what is the stock of [product]?”, “show stock for [category]” | Product stock by item or category | `item_name`, `category`, `flower_type`, `color`, `stock_level`, and listed retail price |
| “Show all stock”, “stock overview”, “total inventory”, “how much stock do we have?”, “show me products” | Inventory summary/list | Active product count, total on-hand quantity, out/low/medium/healthy item counts, and a paged sample of item levels |
| “What’s out of stock?”, “show zero-stock products”, “which flowers are sold out?” | Out-of-stock filter | Quantity `<= 0`; negative quantities are called out for recount |
| “What is low?”, “which products are low on stock?”, “what needs restocking?”, “red roses running low” | Low-stock filter | Positive quantity `1–9`, matching the Products page; product-specific terms narrow the result |
| “Which products have enough stock?”, “what is healthy?” | Healthy inventory filter | Quantity `>= 30`; medium stock is `10–29` |
| “What is the stock worth?”, “value of the inventory”, “retail value of red roses in stock” | Current listed retail valuation | Sum of `stock_level × retail_price`; explicitly label this as retail value, not purchase cost or profit |
| “What did this stock cost to buy?”, “wholesale value of inventory” | State data limitation | Purchase/wholesale cost is not exposed in the current product catalog; do not substitute retail value |
| “What stock do we have by color/type/category?” | Catalog facet search | Filter across `color`, `flower_type`, and `category`; if the user asks for a breakdown that is not calculated, show matching rows rather than inventing a grouped total |
| “What is this product’s price?” | Product price lookup | Current `retail_price`; this is a listed selling price, not purchase cost |
| “What was wasted/spoiled/damaged this month?”, “how much flower waste?” | Flower-waste report | The app exposes monthly aggregates: quantity, estimated cost, entry count, and product count. Exact daily/per-product waste detail is not available from this view |
| “How much stock did we receive?”, “show stock movement/history” | Unsupported ledger question | Explain that current stock is available but a complete historical receipt/movement ledger is not exposed by the current system |
| “Receive stock”, “record damaged flowers”, “remove stock” | Guidance or explicit supported action flow | Direct the user to the existing Products workflow; do not claim stock changed unless the app has executed and confirmed that operation |

When an inventory question follows an order question, classify the new request from its explicit stock/product signals before reusing the order entity. When an order question follows inventory, order number/name/status/date signals must replace the product context. Context is for short follow-ups, never a reason to reinterpret a clearly different business topic.

### Products, flowers, and inventory

| Signal words and phrases | Intended branch | Competing interpretation / guard |
|---|---|---|
| Flower names: `rose`, `tulip`, `carnation`, `lily`, `orchid`, `chrysanthemum`, `gypsophila`, `lisianthus`, `hydrangea`, `peony`, `sunflower`, `gerbera`, `alstroemeria`, `baby’s breath` | Product entity lookup | Normalize singular/plural, common spelling, French/local aliases, and catalog shortcuts; use catalog match, not a hard-coded assumption |
| Colors: `red`, `white`, `pink`, `yellow`, `orange`, `purple`, `blue`, `green`, `cream`, `mixed` | Product modifier | Color alone is not a product identity; combine with flower name or ask which flower |
| `how many`, `left`, `remaining`, `available`, `in stock`, `quantity` | Inventory count | If phrase includes `order` or `sold`, route to order/report context instead of inventory |
| `price`, `cost`, `how much is [product]` | Product price | Distinguish catalog price from an order total, paid amount, or revenue |
| `low`, `almost out`, `restock`, `threshold`, `out of stock` | Low-stock alerts | Report configured threshold and current quantity; do not imply an alert if no threshold exists |
| `receive`, `supplier delivery`, `stock in`, `purchase`, `add stock` | Receive inventory | Require product, quantity, and cost where needed; distinguish from adding product to a customer order |
| `waste`, `damaged`, `expired`, `broken stems`, `shrinkage` | Stock loss / adjustment | Require product, quantity, and reason; do not silently change inventory |
| `bouquet`, `arrangement`, `recipe`, `composition`, `stems` | Product composition/order items | Clarify whether user is checking an existing order or drafting a new arrangement |
| `add [flower]` without `to order/cart` or `stock/receive` | Ambiguous | Ask “add to an order or record new stock?” |

### Customers and suppliers

| Signal words and phrases | Intended branch | Competing interpretation / guard |
|---|---|---|
| `customer`, `client`, a name, phone number, `find`, `history`, `orders for` | Customer/order lookup | A customer record and an order record are different; phrase should determine which is needed |
| `phone`, `number`, `contact` after a customer/order answer | Contact detail follow-up | Resolve against the last unambiguous customer/order only |
| `owes`, `balance`, `unpaid`, `payment history` | Customer/order receivable | Financial permission required; separate order due from customer aggregate balance |
| `supplier`, `vendor`, supplier name, `purchase history` | Supplier lookup | Do not treat supplier purchases as customer orders |
| `pay supplier`, `supplier balance`, `purchase payment` | Supplier payable | Distinct from customer payment/refund; confirmation before financial write |

### Payments, cash, and reporting

| Signal words and phrases | Intended branch | Competing interpretation / guard |
|---|---|---|
| `payment status`, `paid`, `unpaid`, `settled`, `still owes` | Payment state/receivable | Status question is read-only; `record/add/collect payment` is a write action |
| `record payment`, `collect`, `take payment`, `pay`, amount + method | Record payment | Require order/customer target, amount, method; show confirmation; never infer full balance without explicit instruction |
| `refund`, `return payment` | Refund | High-risk write; require role permission and confirmation |
| `cash in`, `cash out`, `opening`, `closing`, `cash register`, `Coffre Forte` | Cash-register operation | Keep register balance separate from order revenue and order payment totals |
| `sales`, `revenue`, `turnover`, `earned`, `order value`, `average order` | Business report | Revenue is not cash collected; require a period or ask which period |
| `profit`, `margin`, `cost` | Profit analysis | Do not calculate profit unless purchase costs and adjustments are present; otherwise state what data is missing |
| `compare`, `versus`, `growth`, `change`, `best day` | Comparative report | Require two comparable periods; explain the metric and date basis |

### Delivery, staff, and general business operations

| Signal words and phrases | Intended branch | Competing interpretation / guard |
|---|---|---|
| `delivery run`, `driver`, `going out`, `drop-off`, `route` | Delivery schedule | Exclude pickup orders; sort by delivery time and state when time is missing |
| `delay`, `late`, `missed delivery` | Reschedule vs overdue | `delay this order` is an action; `which orders are late` is a report |
| `staff`, `team`, person name, `role`, `permission`, `invite` | Team/access | Owner-only actions must stay protected |
| `how do I`, `where is`, `help me` | Guidance/navigation | Do not perform an action unless the user explicitly asks to do it |
| `what should I do`, `what needs attention`, `business pulse` | Prioritized overview | Rank real actionable issues; label data coverage and avoid inventing recommendations |

## Ambiguity gates (must win over keyword matches)

1. **Specific entity beats broad time words.** A customer name plus `order/items/status` must never fall into “today’s orders.”
2. **Action vs question.** `Is order 786 paid?` is read-only; `record 2,000 DA for order 786` is a write request.
3. **Stock vs order.** `add roses to order 786` changes a draft order; `receive 20 roses` changes stock; bare `add roses` asks which one.
4. **Order vs customer.** A customer can have multiple orders. Never silently select the newest unless the user explicitly asks for the latest.
5. **Order status vs payment status.** “Done” is fulfillment; “paid” is payment. Do not conflate them.
6. **Revenue vs cash.** Revenue is order value; cash-in is collected money. State the metric and date basis in reports.
7. **Missing date.** A generic `orders` query is not a query for today. Ask for a date/status/customer when none is specified.
8. **Follow-up scope.** Reuse context only for anaphora (“it”, “that one”, “and its phone”) or an explicit ordinal selection. An explicit new name/number overrides old context.
9. **Write safety.** Every create/edit/payment/refund/cancel/delete/stock adjustment has a review step; destructive and financial actions require confirmation and permission checks.
10. **No-match honesty.** If Blossom returns no records, say so; never substitute a different customer/order or return unrelated aggregate data.

## Evaluation scenarios before enabling a route

For each branch, evaluate: canonical phrase, paraphrase, typo, plural/singular, mixed French/English, entity with multiple matches, no match, missing slot, role restriction, and a confusing neighboring intent. Example order-content cases:

- “What does Djabali Wasila have in her order?” → item query by client name.
- “What did Djabali Wasila order?” → same item query.
- “What’s in order 893?” → item query by exact order number.
- “What does Djabali Wasila have tomorrow?” → ask/resolve date scope; do not show today by default.
- “What’s the status of order 893?” → fulfillment status only.
- “Is order 893 paid?” → payment status only.
- “Add roses.” → clarify stock vs customer order.
- “Add 12 red roses to order 893.” → edit that order, then review.
- “Receive 12 red roses from supplier X.” → stock receiving flow, not order edit.
- “Show orders.” → ask for a date, status, customer, or order number.

Track these outcomes in product analytics without recording message contents by default: accepted answer, user correction, clarification success, no-match, action abandoned, and action confirmed. Use explicit feedback to calibrate the initial confidence targets; do not infer “correct” from a user merely continuing the chat.
