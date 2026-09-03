# V2.22 Verification

## Passed
- `npm run integrity`
  - 197 TS/TSX files
  - 0 unresolved internal imports
- `npm run integrity:migrations`
  - 25 SQL migrations
  - V2.13 through V2.22 invariants present
- TypeScript parser/transpile audit
  - 197 source files
  - 0 syntax diagnostics

## Architecture checks
- AI API keys never enter campaign/template JSON and are encrypted at rest.
- AI provider calls execute server-side.
- OpenAI and OpenRouter share a structured JSON campaign contract.
- Selected template variables are included in the generation schema/prompt.
- Generation is limited to 1–100 rows on the server.
- Generated content goes to Data Studio first; it does not automatically render/publish.
- Generation runs record provider/model/request count/status/usage for operational visibility.
- User-owned, default, or public templates are accepted; inaccessible private templates are rejected.

## Dependency-aware gate
`npm run typecheck` remains blocked because dependencies are absent in this environment:

`TS2688: Cannot find type definition file for 'vite/client'`

Full Vitest/build/lint/live-provider/live-Supabase certification is not claimed.
