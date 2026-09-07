# Phase 6 — R2-Backed Distributed Render Storage & Worker-Independent Checkpoints

## Architecture
PostgreSQL remains the source of truth for queue ownership, leases, retries and cancellation. Cloudflare R2 is now the source of truth for durable render artifacts. Local worker storage is scratch only and may disappear with the process/container/VPS.

Durable keys use `R2_RENDER_PREFIX` (default `shorts-mation/render-v1`):
- `jobs/<job>/manifest.json`
- `jobs/<job>/checkpoint.json`
- `jobs/<job>/assets/index.json`
- `jobs/<job>/frames/<start>-<end>.tar`
- `jobs/<job>/output/output.mp4`
- `assets/sha256/<prefix>/<sha256>.<ext>` shared across jobs
- `assets/url-index/<sha256(url)>.json` opportunistic stable-URL reuse

## Recovery contract
A newly leased worker creates an empty scratch directory, loads the latest R2 checkpoint, restores the job asset index/content-addressed assets, lists and extracts all durable frame segments, then continues from the first missing frame. Checkpoint objects are uploaded before Postgres checkpoint state advances. A stale worker can therefore disappear without a shared filesystem.

## Frame segments
PNG frames are uploaded in tar segments (default 50 frames). A crash may lose only the current not-yet-closed segment; completed segments are restored on any other worker. Change with `RENDER_FRAME_SEGMENT_SIZE`.

## Content-addressed assets
Every cached render asset is SHA-256 hashed and stored globally. Upload uses HEAD-before-PUT so identical bytes are not duplicated in R2. Exact stable URLs also get a URL index allowing later workers to hydrate from R2 before hitting the origin. Signed URLs that rotate may miss the URL index, but still deduplicate at the byte/object layer after download.

## Multipart output
Files at or above `R2_MULTIPART_THRESHOLD_BYTES` use native S3-compatible multipart upload. Part size is controlled by `R2_MULTIPART_PART_BYTES` and is never below 5 MiB. Failed multipart sessions are aborted.

## Output delivery
Postgres stores `output_object_key`; it no longer depends on a POSIX output path. Authenticated `/outputs/:id?token=...` redirects to a short-lived SigV4 presigned R2 GET URL. Callbacks receive the same presigned R2 URL.

## Stateless workers
No NFS, EFS, shared Docker volume or sticky routing is required. `RENDER_WORK_ROOT` defaults to OS temp storage and is deleted after a job unless `RENDER_KEEP_LOCAL_SCRATCH=1`.

## Required worker configuration
`R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` plus the existing durable Postgres and worker-secret settings. Optional: `R2_RENDER_PREFIX`, multipart sizes, frame segment size and output URL TTL.

## Certification
- `npm --prefix worker test` covers signing/presign construction, multipart routing, content dedupe and fresh-scratch frame restoration.
- With real R2 credentials: `npm --prefix worker run certify:r2:integration` uploads a normal object and multipart object, downloads/lists them, verifies a presigned GET, then removes test objects.
- Existing Postgres lease certification and Chromium golden parity certification remain unchanged.
