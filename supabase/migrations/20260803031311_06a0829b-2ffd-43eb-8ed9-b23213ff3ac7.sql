ALTER TABLE public.youtube_connections
  ADD CONSTRAINT youtube_connections_tokens_encrypted_chk
  CHECK (
    (access_token_encrypted IS NULL OR access_token_encrypted LIKE 'v1:%')
    AND (refresh_token_encrypted IS NULL OR refresh_token_encrypted LIKE 'v1:%')
  ) NOT VALID;