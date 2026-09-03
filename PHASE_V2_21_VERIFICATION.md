# V2.21 Verification

## Passed
- `npm run integrity`
  - 194 TS/TSX files
  - 0 unresolved internal imports
- `npm run integrity:migrations`
  - 24 SQL migrations
  - V2.13 through V2.21 invariants present
- TypeScript parser/transpile audit
  - 194 source files
  - 0 syntax diagnostics

## V2.21 coverage included
- template-derived spreadsheet columns
- required/type/date/privacy validation
- mapped-variable validation
- duplicate video filename detection
- duplicate generated-content detection
- TSV bulk paste
- CSV/JSON import/export
- header auto-mapping
- numbered and schedule auto-fill
- durable media picker values
- dynamic row preview through `materializeAutomationDocument`
- persistent RLS-protected drafts
- 100-video server generation ceiling
- canonical `create_campaign_with_items` transaction reuse

## Additional repair
The old New Campaign wizard contained stale `campaign_id: c.id` and `user_id: u.user.id`
fields after campaign creation was moved into the V2.16 transaction RPC. V2.21 removes those
invalid references and restores the wizard to the current `CampaignCreateItem` contract.

## Dependency-aware gate
`npm run typecheck` is blocked in this environment because dependencies are not installed:

`TS2688: Cannot find type definition file for 'vite/client'`

Full Vitest/build/lint/live-Supabase certification is therefore not claimed as passed here.
