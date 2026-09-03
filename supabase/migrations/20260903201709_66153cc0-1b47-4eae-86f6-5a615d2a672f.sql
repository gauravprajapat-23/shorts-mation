REVOKE ALL ON FUNCTION public.asset_storage_usage(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_asset_storage_quota() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_unused_asset_candidates(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_asset_usage_after_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_asset_usage_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_asset_everywhere(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_campaign_item_asset_usages() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_template_asset_usages() FROM PUBLIC, anon, authenticated;