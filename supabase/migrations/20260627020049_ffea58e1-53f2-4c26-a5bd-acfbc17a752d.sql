REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
-- has_role is intentionally callable by authenticated; it's safe (only checks roles).
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
