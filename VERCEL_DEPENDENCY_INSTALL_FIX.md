# Vercel dependency install repair

The deployment was failing before the application build with npm Arborist:

`Cannot read properties of null (reading 'edgesOut')`

## Root cause

`package.json` had moved ahead of `package-lock.json`. Sixteen direct dependency specifications were missing or stale in the npm lock, while `bun.lock` already matched the current package manifest. Vercel therefore selected npm because `package-lock.json` was present and attempted to reconstruct an inconsistent tree with `npm install`.

## Repair

- Removed the stale root `package-lock.json`.
- Kept the synchronized `bun.lock` as the root dependency lock.
- Added `vercel.json` with `bun install --frozen-lockfile`.
- Kept the application build as `npm run build` so dependency installation changes without switching the server runtime.
- Updated the production GitHub workflow to install root dependencies from the same frozen Bun lock.
- Left `worker/` on its independent npm package/lockfile.

Vercel documents Bun lockfile detection and custom `installCommand` support.
