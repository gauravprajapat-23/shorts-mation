# Phase 0 — YouTube OAuth Certification

## Automated guarantees added

- OAuth state is HMAC signed.
- Cookie/query state must match exactly.
- State has a ten-minute expiry.
- Authorization and token exchange use the same redirect URI helper.
- The state cookie is `Secure` on HTTPS and intentionally non-Secure on HTTP localhost/dev so the browser does not discard it.
- Broad `youtube` scope was removed. Current scopes are upload, read-only channel data, and YouTube Analytics read-only.
- Disconnect is server-owned, best-effort revokes Google access, then destroys locally stored access/refresh tokens even when Google revocation is unavailable.
- Reconnect preserves an existing refresh token when Google omits `refresh_token` in a subsequent authorization response.

## Deployment checklist

Google Cloud Console must list exactly:

`<PUBLIC_APP_URL>/api/public/youtube/callback`

as an authorized redirect URI.

Required server environment:

- `PUBLIC_APP_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `OAUTH_STATE_SECRET` (high entropy)
- `TOKEN_ENCRYPTION_KEY`

## Live certification still required

Automated tests cannot prove Google account configuration. On staging, execute:

1. Connect a test YouTube channel.
2. Confirm channel id/name/avatar persist and token fields are ciphertext.
3. Force access-token expiry and confirm refresh succeeds.
4. Fetch channel/playlists/categories/analytics used by the UI.
5. Upload one private test video with resumable upload.
6. Disconnect and confirm the row is marked disconnected and token columns are null.
7. Reconnect and repeat after browser session restart.

A failure in these steps is a deployment/OAuth certification failure, not a reason to reintroduce customer API keys.
