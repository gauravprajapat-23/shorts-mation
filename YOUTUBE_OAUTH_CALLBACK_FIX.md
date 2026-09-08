# YouTube OAuth callback repair

This repair prevents `/api/public/youtube/callback` from falling through to the generic TanStack Start error page.

Changes:
- validates all required server OAuth/Supabase/token-encryption environment variables before token persistence;
- resolves an Owner/Admin workspace and explicitly writes `organization_id` to `youtube_connections`;
- preserves existing encrypted refresh tokens when Google omits a new refresh token;
- converts network, encryption, Supabase and workspace failures into safe `yt_error` redirects;
- logs the detailed server exception with `[YouTube OAuth callback]` for local/Vercel diagnostics;
- adds user-facing messages for the stable callback error codes.

Required server environment:
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- OAUTH_STATE_SECRET
- TOKEN_ENCRYPTION_KEY
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY

For localhost Google Console, the authorized redirect URI must exactly match:
`http://localhost:8080/api/public/youtube/callback`

For production, add the exact HTTPS production callback separately.
