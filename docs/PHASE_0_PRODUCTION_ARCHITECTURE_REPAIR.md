# Phase 0 — Production Architecture Repair

Status: implemented in this branch/worktree on 2026-09-07.

## Feature freeze

Until Phase 0 exits, do not add editor tools, effects, templates, transitions, audio features, or marketplace features. Production-foundation defects take priority over feature breadth.

Phase 0 exit gates:

1. Customer UI contains no render-worker URL/secret configuration.
2. Server renderer credentials come only from application infrastructure environment variables.
3. YouTube OAuth state/redirect behavior is deterministic and tested.
4. Disconnect destroys locally stored OAuth tokens and best-effort revokes Google access.
5. A versioned canonical composition contract exists and rejects ambiguous/browser-only state.
6. Typecheck, unit tests, build, lint, and source-integrity checks pass.

## Verified source inventory

"Verified" below means verified by source/tests in this repository, not by calling live Google/Supabase/worker infrastructure.

| Area | Phase 0 status | Evidence / limitation |
| --- | --- | --- |
| Authentication | PRESENT | Supabase auth middleware/client exists. Live environment not exercised in Phase 0. |
| Editor V2 | PRESENT | Scene/track/audio/caption/effect models and tests exist. Feature work frozen. |
| Templates / automation data | PRESENT | Template, CSV/data studio, automation-variable code/tests exist. |
| Durable assets | PRESENT | Asset references/storage migrations and integration tests exist. Live bucket not exercised. |
| Browser renderer | LEGACY/EXPLICIT | Kept only for explicit test rendering. Not the production automation owner. |
| Native FFmpeg worker | PRESENT, LIMITED | Worker/pipeline/tests exist, but Phase 0 does not certify full editor parity. |
| Render queue/retries | PRESENT | Render attempts, queue claims, retry/dead-letter logic and tests exist. |
| Customer renderer config | REMOVED | Settings UI/write APIs removed. Worker config is infrastructure-only. |
| YouTube OAuth | REPAIRED | Shared redirect/state contract, localhost cookie fix, least-privilege scopes, server disconnect/revoke. Live Google consent is an external certification step. |
| YouTube upload | PRESENT | Refresh/upload/idempotency code exists. Live quota/upload not exercised in Phase 0. |
| Analytics | PRESENT | Intelligence/snapshot code/tests exist. Live channel analytics not exercised. |
| Canonical composition | ADDED | `src/lib/canonical-composition.ts`; renderer migration intentionally deferred. |
| Shotstack | LEGACY CODE | Legacy adapter/tests remain for parity/reference. Active native-worker pipeline should not depend on it. Removal is a later cleanup after canonical renderer migration. |

## Architecture decisions locked by Phase 0

### Renderer ownership

Rendering is Shorts-Mation infrastructure. Customers must never enter `FFMPEG_WORKER_URL`, `FFMPEG_WORKER_SECRET`, Shotstack credentials, callback URLs, or equivalent infrastructure secrets.

Production config:

- `FFMPEG_WORKER_URL`
- `FFMPEG_WORKER_SECRET`
- `PUBLIC_APP_URL`

are deployment secrets/settings owned by the application operator.

The historical `render_providers` table remains temporarily so old migrations remain valid. The Phase 0 migration clears any per-user renderer credentials. Do not add new code that writes render worker credentials to this table.

### YouTube ownership

Google OAuth application credentials are configured once for Shorts-Mation:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `OAUTH_STATE_SECRET`
- `TOKEN_ENCRYPTION_KEY`

Users only press **Connect YouTube**. OAuth access/refresh tokens remain server-side and encrypted.

### Canonical composition

New renderer/preview integrations must consume the versioned canonical envelope from `src/lib/canonical-composition.ts` rather than inventing their own interpretation of editor state.

Current identifier:

- schema: `shorts-mation/composition`
- version: `1`
- document: normalized EditorDocument V2

Phase 0 intentionally does not replace the current renderer. Phase 1+ can migrate preview/render materialization to this contract behind tests.

## Known production gaps after Phase 0

1. Native renderer does not yet have certified parity for all editor layers/features.
2. Canonical composition is not yet the input to every render path.
3. Live Google OAuth consent/upload must be certified against the deployed redirect URI and Google Cloud OAuth configuration.
4. Live worker callback/output-host behavior must be certified in staging.
5. Legacy Shotstack/browser render code should only be removed after the replacement renderer passes parity tests.
6. Cloudflare R2/object-storage migration is not part of Phase 0.

## Next phase recommendation

Phase 1 should migrate render materialization to a single canonical composition input and add capability reporting so unsupported compositions fail before a job is submitted. Do not add editor features until preview/render capability parity is measurable.
