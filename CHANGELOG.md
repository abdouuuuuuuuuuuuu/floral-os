# Changelog

All notable changes to Blossom POS. This project uses `MAJOR.MINOR.PATCH`
versioning; the published desktop installers live in the `floral-os-releases`
repository and clients auto-update to the latest.

## [1.0.24] - 2026-11-15
### Changed
- Code cleanup: replaced two caret-anchored regexes with `String#startsWith`
  (clears the lint warnings; identical behavior).
- Fixed a stale assistant-catalog test expectation; the suite passes 50/50.
- No functional changes to the app.

### Repository
- Added `.gitattributes`, `.editorconfig`, `.nvmrc`, `LICENSE`, `SECURITY.md`,
  `CONTRIBUTING.md`, this changelog, and a CI workflow (lint + test + build).

### Security (backend — deployed separately to Supabase)
- Edge functions now verify the caller through a shared `require-caller` gate.
- Dropped legacy unused `record_order_payment/refund` RPC overloads.

## [1.0.23] - 2026-11-14
- Receipts show the order's petals from creation.

## [1.0.22]
- "Flowers Required" panel no longer clipped by the Orders header.

## [1.0.21]
- Order edits keep their dates; order reschedule; cart drag-and-drop.
