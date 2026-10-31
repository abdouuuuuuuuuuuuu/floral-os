# Blossom POS UI System Audit

## Scope

This is a source-level audit of the React application, its shared components,
global CSS, route composition, and light/dark theme handling. It covers the
atomic layers from design tokens through complete route templates. It does not
claim pixel-level visual verification: the audit was not performed against a
live browser screenshot.

## Product surfaces and route templates

`src/App.jsx` composes these screen templates:

| Surface | Routes / screens | Main UI building blocks |
| --- | --- | --- |
| Entry and identity | Splash, login, invite-only, reset/update password, forbidden | `AuthLayout`, `SignInForm`, splash and auth motion styles |
| Daily overview | Dashboard | KPI tiles, order lists, date and action controls, charts |
| Selling | Cart, checkout, receipt, quick-sale redirect | Product catalog, category filters, customer lookup, cart, payment and reward points |
| Order operations | Orders, archived orders, order detail, delivery | Search and filter controls, order rows/cards, status and payment indicators, detail panels |
| Customer relationship | Customers | Customer cards, profile panel, order history, loyalty balance |
| Shop operations | Products, suppliers, team | Search, catalog cards, forms, stock/payment indicators, confirmation dialogs |
| Finance and analysis | Coffre Forte, reports | Cash movement lists, summaries, charts, date filters and export controls |
| Configuration | Settings | Settings groups, form controls, print and app preferences |

All authenticated routes use `DashboardLayout`; it places the sidebar and top
bar around the current screen. `LiveCursorPresence` and `BlossomAssistant` are
mounted at the route shell and therefore need theme support independent of the
current page.

## Atomic hierarchy

### Atoms

| Atom | Current source | Responsibility |
| --- | --- | --- |
| Brand and semantic colors | `src/index.css` `@theme` | Purple structure, pink action, semantic success/warning/danger/info, page and panel colors |
| Semantic theme contract | `src/index.css` `:root` and `html[data-theme="dark"]` | Canvas, panel, raised/inset surfaces, primary/secondary/muted content, borders, focus ring and overlay |
| Type and number styles | `src/index.css` `@theme`, `.figure`, `.label-section` | Inter body/UI text, display face, tabular numerals, headings and section labels |
| Spacing/radius/motion | Tailwind spacing scale and `@theme` | 4px spacing rhythm, control/panel/sheet radii, shared transition curves |
| Icons | `lucide-react`, `BlossomGlyph`, inline SVG marks | Navigation, action, status and brand symbols |
| Theme state | `src/context/ThemeContext.jsx`, initialized in `src/main.jsx` | Persisted light/dark preference on the document root |
| Focus and control feedback | `src/index.css` base layer | Keyboard focus ring, hover/active transitions and reduced-motion behavior |

### Molecules

| Molecule | Source | Composition |
| --- | --- | --- |
| Search and result picker | `TopBar.jsx`, `CustomerSearch.jsx` | Input, icon, clear/action buttons, suggestions and loading/empty/error states |
| Customer selection and payment | `PaymentStep.jsx` | Customer-linked points, tender selection, totals, confirmation actions |
| Sortable data list | `DataTable.jsx` | Header labels, sort controls, rows, numeric alignment and empty state |
| Status and category indicators | `FlowerColour.jsx`, `ConnectionStatus.jsx`, shared pill classes | Color swatches, labels, status text and category identity |
| Notifications and feedback | `NotificationPanel.jsx`, toast components, `SaleComplete.jsx`, `Skeleton.jsx` | Popover, toast, loading, empty and completion feedback |
| Form field groups | Page forms and `AddMemberModal.jsx` | Label, input/select, hint/error and adjacent actions; currently implemented with page-level utility classes |
| Product/customer/order cards | Page components in `Cart.jsx`, `Customers.jsx`, `Orders.jsx`, `Products.jsx` | Identity, supporting details, status, totals and contextual actions |

### Organisms

| Organism | Source | Purpose |
| --- | --- | --- |
| Auth shell | `AuthLayout.jsx`, `SignInForm.jsx` | Login and recovery frame |
| POS application shell | `DashboardLayout.jsx`, `Sidebar.jsx`, `TopBar.jsx` | Navigation, global search, profile, theme and page canvas |
| Blossom assistant | `BlossomAssistant.jsx`, `AssistantOrderActions.jsx` | Assistant panel, conversation, order-building controls |
| Sales flow | `Cart.jsx`, `Checkout.jsx`, `PaymentStep.jsx`, `Receipt.jsx` | Browse products through payment and receipt |
| Order management | `Orders.jsx`, `ArchivedOrders.jsx`, `OrderDetail.jsx`, `Delivery.jsx` | Find, inspect, update and deliver orders |
| Customer profile | `Customers.jsx` | Customer identity, contact, credit/loyalty and related orders |
| Operational workspaces | `Dashboard.jsx`, `Products.jsx`, `Suppliers.jsx`, `TeamMembers.jsx`, `CoffreForte.jsx`, `Reports.jsx`, `Settings.jsx` | Domain-specific overview, tables, forms, summaries and action dialogs |
| Presence and app feedback | `LiveCursorPresence.jsx`, notification/toast/error components | Teammate cursors, notifications, errors and operation feedback |

## Canonical theme map

Light is the reference theme. Dark mode keeps the same semantic roles and brand
hierarchy while changing surface and foreground values. It is not a second
unrelated palette.

| Role | Light | Dark |
| --- | --- | --- |
| Page canvas | `#F7F5FB` | `#131118` |
| Main panel | `#FFFFFF` | `#1D1A23` |
| Raised panel/control | `#FBF9FE` | `#25212C` |
| Inset surface | `#F1EDF6` | `#17141B` |
| Primary content | `#1A1523` | `#F4F0F7` |
| Secondary content | `#514A5C` | `#D5D0DC` |
| Muted content | `#6E6779` | `#AAA2B1` |
| Subtle content | `#766E80` | `#96909F` |
| Subtle border | `#E8E3F2` | `#34303B` |
| Strong border | `#D4CDDF` | `#494450` |
| Keyboard focus | `#C41E63` | `#FF85B6` |

The semantic values live in `--ui-*` CSS variables. Component primitives use
these values so the theme can be changed without hand-editing every screen.
The existing Tailwind color utilities remain as a compatibility layer while
older feature screens are migrated.

## Consistency rules

1. **Surface depth:** canvas → panel → raised control. Avoid nesting multiple
   card layers unless the content hierarchy needs it.
2. **Text:** primary for names/totals, secondary for normal descriptions,
   muted for supporting metadata. Status color must accompany readable text,
   not be the only signal.
3. **Actions:** one visually dominant action in a local decision area; use
   secondary and ghost styles for the rest. Danger is reserved for destructive
   actions.
4. **Type:** 12px is the minimum UI text size; operational amounts use tabular
   numerals. Dense status and helper text must remain readable at shop distance.
5. **Spacing:** keep the Tailwind 4px spacing rhythm. Shared page gutters and
   the sidebar/top-bar geometry come from layout tokens; component internals
   should use the same small set of spacing steps.
6. **Shape:** controls use the control radius, cards/lists the panel radius,
   dialogs/drawers the sheet radius.
7. **Theme:** do not encode a light-only white or gray directly in a new shared
   component. Use semantic surface/content/border tokens. Exceptions are
   illustrations and real product-color swatches.
8. **Focus and motion:** every interactive control has a visible keyboard
   focus state; honor `prefers-reduced-motion`.

## Findings

### Resolved in this pass

- Added a semantic light/dark token map for canvas, panels, content, borders,
  focus and overlays. Updated shared panels, list groups, buttons, labels,
  figures and neutral pills to consume those tokens.
- Moved authenticated page gutters and top spacing into one `.dashboard-main`
  rule, and tied desktop sidebar/top-bar alignment to the same width/height
  variables.
- Raised legacy 10px/11px UI text utilities and section labels to the 12px
  minimum for better POS readability.
- Added dark surface/content treatment for live teammate cursor labels, which
  were styled outside the utility-class theme bridge.
- Corrected dark-only color cases found by scanning utility usage: fuchsia
  loyalty labels/surfaces, the loyalty card's literal-white gradient stop,
  primary-tint text, the amber cash variance label, and the white veil over
  password screen backgrounds.
- Separated dark status foregrounds from their solid fills so success, warning,
  danger and info backgrounds keep white icons/text above 6:1 contrast. White
  overlay utilities now preserve their original opacity over dark surfaces.
- Audited focused, hovered, pressed, disabled and selected states across the
  routes. White focus utilities were bypassing the dark `.bg-white` mapping,
  leaving focused inputs and selects bright white behind pale text. Dark focus
  states now use the raised surface and a high-visibility Blossom focus ring;
  the cart search also uses semantic tokens and removes the duplicate browser
  clear affordance. Added dark equivalents for the assistant's legacy pale
  action/editor surfaces and the sign-in password-toggle hover state.
- Improved interaction feedback in shared flows: customer search now exposes
  keyboard result selection and loading, empty, retry, error and save states;
  sortable rows can be opened by keyboard and report sort state; confirmation
  dialogs trap and restore focus; undo actions expose in-progress and retry
  states. Transient toasts now render globally from their own bounded queue.
- Consolidated the historical `common` toast paths as re-exports of the single
  `ui` implementation.

### Remaining consistency risks

| Priority | Finding | Affected areas | Recommended follow-up |
| --- | --- | --- | --- |
| P1 | Feature screens mostly compose controls from inline Tailwind class strings rather than shared field/button/card primitives. | Products, orders, delivery, customers, suppliers, settings, finance | Introduce shared `Button`, `Field`, `Badge`, `Surface`, `EmptyState` primitives and migrate one workflow at a time. |
| P1 | Legacy dark mode still needs a large utility-compatibility section with `!important` and per-color-family overrides. | Most pages | Migrate commonly used `bg-white`, gray text/borders, and status colors to semantic classes; remove compatibility overrides only after coverage is complete. |
| P1 | The assistant still uses a bespoke inline palette. Existing pale surfaces now have dark mappings, but future literal colors can escape the compatibility selectors. | Blossom assistant and order assistant | Replace shell, message, action and input colors with semantic or assistant-specific tokens; retain distinct intentional brand accents. |
| P2 | Page-internal spacing, card padding, radii and heading sizes vary. The global page gutter is now consistent, but each template still sets its own content rhythm. | All operational pages | Standardize page title/header, section gap, card padding, form row gap and table cell padding through reusable layout primitives. |
| P2 | Status/category palettes and chart colors have domain-specific exceptions. Product swatches must preserve real colors, while status text must retain contrast in both themes. | Products, cart, delivery, reports | Define a documented status/category token map and review contrast on tinted surfaces in both themes. |
| P3 | `src/App.css` contains Vite starter selectors and is not imported by the active app. | Repository stylesheet | Remove the dead starter stylesheet when doing a separate cleanup pass. |

## Suggested rollout

1. **Foundation (done here):** semantic color contract, shared shell geometry,
   readable text floor, theme-aware global primitives.
2. **Reusable atoms:** centralize button variants, text/select controls, badges,
   icons and focus states; keep interaction behavior stable.
3. **Molecules:** standardize search fields, labeled form rows, filter groups,
   stat tiles, empty states and status summaries.
4. **Organisms:** migrate the shell, tables, dialogs, assistant, product cards,
   customer panels and order panels to those molecules.
5. **Template review:** inspect login, dashboard, cart/checkout, orders,
   customers, reports and cash register in light and dark at narrow, medium and
   desktop widths. Fix contrast, clipping, wrapping and rhythm issues from the
   rendered screens.
6. **Cleanup:** remove old utility overrides and dead duplicate primitives
   only after every route has moved to the semantic system.

## Verification boundary

No build or test suite was run for this design-system pass. `git diff --check`
is used as a whitespace/conflict-marker check only; it does not validate the
rendered appearance. The local browser preview was blocked by its URL policy,
so the rendered appearance still needs a visual pass in both themes before a
production release.
