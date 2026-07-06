-- Prevent authenticated users from reading the encrypted OAuth token columns
-- through the Data API. Backend server code uses the service role, which is
-- unaffected. Existing row-level policies still control which rows the user
-- can see for the remaining safe columns.
REVOKE SELECT (access_token_encrypted, refresh_token_encrypted)
  ON public.youtube_connections FROM authenticated;

-- Make sure client code cannot smuggle new plaintext into these columns.
REVOKE UPDATE (access_token_encrypted, refresh_token_encrypted)
  ON public.youtube_connections FROM authenticated;
REVOKE INSERT (access_token_encrypted, refresh_token_encrypted)
  ON public.youtube_connections FROM authenticated;