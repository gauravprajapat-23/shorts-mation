REVOKE EXECUTE ON FUNCTION public.enforce_asset_storage_quota() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.list_unused_asset_candidates(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_asset_usage_after_change() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_asset_usage_count(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.replace_asset_everywhere(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_campaign_item_asset_usages() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_template_asset_usages() FROM authenticated;