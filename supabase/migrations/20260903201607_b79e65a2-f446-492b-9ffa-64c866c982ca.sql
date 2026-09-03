REVOKE ALL ON FUNCTION public.enforce_asset_storage_quota() FROM authenticated;
REVOKE ALL ON FUNCTION public.refresh_asset_usage_after_change() FROM authenticated;
REVOKE ALL ON FUNCTION public.refresh_asset_usage_count(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.sync_campaign_item_asset_usages() FROM authenticated;
REVOKE ALL ON FUNCTION public.sync_template_asset_usages() FROM authenticated;