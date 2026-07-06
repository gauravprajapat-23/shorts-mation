import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listTemplates from "./tools/list-templates";
import listCampaigns from "./tools/list-campaigns";
import getCampaign from "./tools/get-campaign";
import listAssets from "./tools/list-assets";

// The OAuth issuer must be the direct Supabase host (RFC 8414). Read the
// project ref from a Vite-inlined literal so the published Worker build has
// the correct issuer, not the .lovable.cloud proxy form.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "shortsforge-mcp",
  title: "ShortsForge",
  version: "0.1.0",
  instructions:
    "Tools for ShortsForge, a YouTube Shorts bulk automation app. Use list_templates, list_campaigns, get_campaign, and list_assets to inspect the signed-in user's video templates, campaign progress, and uploaded media.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listTemplates, listCampaigns, getCampaign, listAssets],
});